import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { Principal, SessionService } from "../auth";
import type { ListingManifestService } from "../media";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import { ListingRepository, type ListingRow } from "./listing.repository";
import { listingDetail, listingItem } from "./listing.dto";
import {
  validTerms,
  type ListingCreate,
  type ListingPatch,
  type MyListingsQuery,
  type visibilitySchema,
} from "./listing.schema";
import { normalizeListingTitle } from "./listing-search";
import { decodeMyCursor, encodeMyCursor } from "./listing-cursor";
import type { MediaDelivery } from "../media";
import { Readable } from "node:stream";

export class ListingService {
  /** Phối hợp chính sách Listing với giao diện transaction công khai của Auth và Media. */
  constructor(
    private readonly repository: ListingRepository,
    private readonly sessions: SessionService,
    private readonly media: ListingManifestService,
  ) {}

  /** Commit Listing và toàn bộ gallery cùng nhau; upload lỗi vẫn ở TEMP khi rollback. */
  async create(principal: Principal, input: ListingCreate) {
    return this.repository.transaction(async (tx) => {
      await this.repository.lockUsers([principal.userId], tx);
      await this.sessions.requireCurrent(principal, tx);
      const id = randomUUID();
      await this.repository.lockListing(id, tx);
      const province = await this.requireProvince(input.provinceCode, tx);
      await this.repository.create(
        {
          id,
          ownerId: principal.userId,
          title: input.title,
          searchTitle: normalizeListingTitle(input.title),
          description: input.description,
          type: input.type,
          price: input.price,
          rentalUnit: input.rentalUnit,
          provinceId: province.id,
          contactPhone: input.contactPhone ?? null,
        },
        tx,
      );
      await this.media.save(principal.userId, id, input.media, tx);
      return this.detail(await this.requireRow(id, tx), principal.userId, tx);
    });
  }

  /** Đọc chi tiết ACTIVE công khai hoặc HIDDEN của chủ đang hoạt động dưới khóa vòng đời dùng chung. */
  async get(id: string, viewer?: Principal) {
    return this.withVisible(id, viewer, async (row, tx) => this.detail(row, viewer?.userId, tx));
  }

  /** Giữ điều kiện hiển thị khi đọc storage, rồi kiểm tra lại phiên trước khi trả byte. */
  async delivery(
    input: {
      listingId: string;
      mediaId: string;
      variant?: "detail" | "thumbnail" | "original";
      range?: string;
      ifRange?: boolean;
    },
    viewer?: Principal,
  ) {
    let opened: MediaDelivery | undefined;
    try {
      return await this.withVisible(input.listingId, viewer, async (row, tx) => {
        const bytes = await this.media.read(
          {
            listingId: row.id,
            id: input.mediaId,
            ownerId: row.ownerId,
            variant: input.variant,
            range: input.range,
            ifRange: input.ifRange,
          },
          tx,
        );
        opened = bytes;
        if (viewer) await this.sessions.requireCurrent(viewer, tx);
        return bytes;
      });
    } catch (error) {
      if (opened?.body instanceof Readable) opened.body.destroy();
      throw error;
    }
  }

  /** Giữ mốc createdAt/id ổn định, gắn cursor với chủ sở hữu và truy vấn hiện tại. */
  async mine(principal: Principal, query: MyListingsQuery) {
    return this.repository.transaction(async (tx) => {
      await this.repository.lockUsers([principal.userId], tx);
      await this.sessions.requireCurrent(principal, tx);
      const cursor = decodeMyCursor(query, principal.userId, await this.repository.now(tx));
      const rows = await this.repository.mine(
        principal.userId,
        query.status,
        query.limit,
        new Date(cursor.asOf),
        query.after
          ? { id: cursor.last.id, createdAt: new Date(cursor.last.createdAt) }
          : undefined,
        tx,
      );
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        data: page.map((row) => listingItem(row)),
        pagination: {
          nextCursor: rows.length > query.limit && last ? encodeMyCursor(cursor, last) : null,
        },
      };
    });
  }

  /** Kiểm tra thông tin Conversation dưới cùng khóa Listing với bên ghi Chat tương lai trước khi sửa nội dung. */
  async update(id: string, principal: Principal, input: ListingPatch) {
    return this.withOwner(id, principal, input.expectedVersion, false, async (row, tx) => {
      const facts = await this.repository.interactions(id, tx);
      if (facts.hasConversations && input.type && input.type !== row.type)
        throw new AppError(
          409,
          "LISTING_TYPE_LOCKED",
          "Listing type is locked by its conversations.",
        );
      if (facts.hasConversations && !input.confirmConversationImpact)
        throw new AppError(
          409,
          "LISTING_CONFIRMATION_REQUIRED",
          "Confirm changes affecting conversations.",
        );
      if (row.status === "HIDDEN" && facts.hasAcceptedProposal)
        throw new AppError(409, "LISTING_REOPEN_REQUIRED", "Reopen the listing before editing.");
      const type = input.type ?? row.type;
      const price = input.price === undefined ? (row.price?.toFixed(0) ?? null) : input.price;
      const rentalUnit = input.rentalUnit === undefined ? row.rentalUnit : input.rentalUnit;
      if (!validTerms({ type, price, rentalUnit }))
        throw new AppError(400, "VALIDATION_ERROR", "Invalid final price/rental unit.", [
          { path: "body.price", code: "custom" },
        ]);
      const province =
        input.provinceCode === undefined
          ? undefined
          : await this.requireProvince(input.provinceCode, tx);
      if (input.media) await this.media.save(principal.userId, id, input.media, tx);
      await this.change(
        row,
        {
          ...(input.title === undefined
            ? {}
            : { title: input.title, searchTitle: normalizeListingTitle(input.title) }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.contactPhone === undefined ? {} : { contactPhone: input.contactPhone }),
          ...(province ? { provinceId: province.id } : {}),
          type,
          price,
          rentalUnit,
        },
        tx,
      );
      await this.repository.event(id, row.version + 1, tx);
      return this.detail(await this.requireRow(id, tx), principal.userId, tx);
    });
  }

  /** Yêu cầu cùng trạng thái không thay đổi dữ liệu nhưng kiểm tra phiên bản; mở lại bắt đầu đúng một chu kỳ mới. */
  async visibility(id: string, principal: Principal, input: z.infer<typeof visibilitySchema>) {
    return this.withOwner(id, principal, input.expectedVersion, false, async (row, tx) => {
      if (row.status !== input.status) {
        if (
          input.status === "ACTIVE" &&
          (await this.repository.interactions(id, tx)).hasAcceptedProposal &&
          !input.confirmReopenAfterAccepted
        )
          throw new AppError(
            409,
            "LISTING_CONFIRMATION_REQUIRED",
            "Confirm reopening after an accepted proposal.",
          );
        await this.change(
          row,
          {
            status: input.status,
            ...(input.status === "ACTIVE" ? { activeCycle: { increment: 1 } } : {}),
          },
          tx,
        );
      }
      return this.detail(await this.requireRow(id, tx), principal.userId, tx);
    });
  }

  /** Giữ media và tham chiếu lịch sử; trạng thái Listing kết thúc thu hồi quyền truy cập. */
  async remove(id: string, principal: Principal, expectedVersion: number): Promise<void> {
    await this.withOwner(id, principal, expectedVersion, true, async (row, tx) => {
      if (row.status !== "DELETED")
        await this.change(row, { status: "DELETED", deletedAt: await this.repository.now(tx) }, tx);
    });
  }

  /** Chỉ khóa chủ đã xác thực, rồi đọc lại sở hữu mà không lấy khóa User khác. */
  private async withOwner<T>(
    id: string,
    principal: Principal,
    version: number,
    tombstone: boolean,
    run: (row: ListingRow, tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return this.repository.transaction(async (tx) => {
      await this.repository.lockUsers([principal.userId], tx);
      await this.sessions.requireCurrent(principal, tx);
      await this.repository.lockListing(id, tx);
      const row = await this.requireRow(id, tx);
      if (row.ownerId !== principal.userId || (!tombstone && row.status === "DELETED"))
        throw new AppError(404, "NOT_FOUND", "Listing not found.");
      if (row.version !== version)
        throw new AppError(
          409,
          "LISTING_VERSION_CONFLICT",
          "Listing changed; reload before saving.",
        );
      return run(row, tx);
    });
  }

  /** Lấy mọi khóa User liên quan trước Listing; tra chủ sơ bộ không cấp quyền truy cập. */
  private async withVisible<T>(
    id: string,
    viewer: Principal | undefined,
    run: (row: ListingRow, tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    const candidate = await this.repository.owner(id);
    if (!candidate) throw new AppError(404, "NOT_FOUND", "Listing not found.");
    return this.repository.transaction(async (tx) => {
      await this.repository.lockUsers([candidate.ownerId, ...(viewer ? [viewer.userId] : [])], tx);
      if (viewer) await this.sessions.requireCurrent(viewer, tx);
      await this.repository.lockListing(id, tx);
      const row = await this.requireRow(id, tx);
      if (
        row.ownerId !== candidate.ownerId ||
        row.status === "DELETED" ||
        row.deletedAt ||
        (row.status === "HIDDEN" && row.ownerId !== viewer?.userId) ||
        !(await this.repository.visibleOwner(row.ownerId, viewer?.userId, tx))
      )
        throw new AppError(404, "NOT_FOUND", "Listing not found.");
      return run(row, tx);
    });
  }

  /** Trả projection an toàn và ẩn sự tồn tại tương tác với người không sở hữu. */
  private async detail(row: ListingRow, viewerId: string | undefined, tx: DatabaseTransaction) {
    const facts =
      viewerId === row.ownerId
        ? await this.repository.interactions(row.id, tx)
        : { hasConversations: false, hasAcceptedProposal: false };
    const followed = !!viewerId && !!(await this.repository.followed(row.id, viewerId, tx));
    return listingDetail(row, facts, followed);
  }

  /** Tìm Province đã chọn mà không sao chép dữ liệu hồ sơ User riêng tư. */
  private async requireProvince(code: string, tx: DatabaseTransaction) {
    const province = await this.repository.province(code, tx);
    if (!province) throw new AppError(400, "INVALID_PROVINCE", "Choose an active province.");
    return province;
  }

  /** Chuyển hàng thiếu thành cùng lỗi công khai an toàn cho chủ sở hữu. */
  private async requireRow(id: string, tx: DatabaseTransaction) {
    const row = await this.repository.get(id, tx);
    if (!row) throw new AppError(404, "NOT_FOUND", "Listing not found.");
    return row;
  }

  /** Cập nhật timestamp và phiên bản đúng một lần bằng hàng rào database có điều kiện. */
  private async change(
    row: ListingRow,
    data: Parameters<ListingRepository["update"]>[3],
    tx: DatabaseTransaction,
  ): Promise<void> {
    if (
      row.version === 2147483647 ||
      (typeof data.activeCycle === "object" && row.activeCycle === 2147483647)
    )
      throw new AppError(409, "LISTING_VERSION_CONFLICT", "Listing version limit reached.");
    if (
      (
        await this.repository.update(
          row.id,
          row.ownerId,
          row.version,
          { ...data, version: { increment: 1 }, updatedAt: await this.repository.now(tx) },
          tx,
        )
      ).count !== 1
    )
      throw new AppError(409, "LISTING_VERSION_CONFLICT", "Listing changed; reload before saving.");
  }
}
