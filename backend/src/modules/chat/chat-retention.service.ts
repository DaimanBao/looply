import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";
import type { ChatMediaService, StoredMediaObject } from "../media";
import type { ChatRepository, ConversationRow } from "./chat.repository";
import { snapshotExpiry } from "./chat-policy";

export class ChatRetention {
  private cursor?: string;
  private deleteCursor?: string;
  private inventory?: AsyncGenerator<StoredMediaObject>;

  /** Giữ chính sách retention thuộc Chat, xóa vật lý qua giao diện Media. */
  constructor(
    private readonly repository: ChatRepository,
    private readonly media: ChatMediaService,
  ) {}

  /** Thu hồi trước khi tăng activity để ảnh quá hạn không được gia hạn sống lại. */
  async retire(row: ConversationRow, now: Date, tx: DatabaseTransaction): Promise<void> {
    for (const snapshot of await this.repository.snapshots(row.id, tx)) {
      const expired =
        snapshot.imageState === "PREPARING"
          ? snapshot.createdAt.getTime() + 900_000 <= now.getTime()
          : !!snapshot.snapshotCreatedAt &&
            snapshotExpiry(snapshot.snapshotCreatedAt, row.lastActivityAt) <= now;
      if (!expired) continue;
      await this.revoke(snapshot.id, row.id, now, tx);
    }
  }

  /** Quyền đọc mất cùng commit và job chỉ chứa ID; worker không gửi Notification. */
  async revoke(
    id: string,
    conversationId: string,
    now: Date,
    tx: DatabaseTransaction,
  ): Promise<void> {
    await this.repository.updateSnapshot(
      id,
      {
        imageState: "REVOKED",
        imageRevokedAt: now,
        imageDeletedAt: null,
        sourceMediaId: null,
        sourceListingVersion: null,
      },
      tx,
    );
    await this.repository.event(
      conversationId,
      "chat.snapshot.revoked",
      { snapshotId: id, conversationId },
      tx,
    );
  }

  /** Quét tuần tự batch có giới hạn; Conversation lock serialize worker với activity và publish. */
  async runOnce(): Promise<boolean> {
    await this.reconcileObjects();
    const rows = await this.repository.cleanupConversations(this.cursor);
    this.cursor = rows.at(-1)?.id;
    for (const candidate of rows) {
      await this.repository.transaction(async (tx) => {
        await lockResources(tx, [`conversation:${candidate.id}`]);
        const row = await this.repository.conversation(candidate.id, tx);
        if (row) await this.retire(row, await this.repository.now(tx), tx);
      });
    }
    let failed = false;
    const revoked = await this.repository.revokedSnapshots(this.deleteCursor);
    this.deleteCursor = revoked.at(-1)?.id;
    for (const snapshot of revoked) {
      try {
        const version = await this.repository.snapshotVersion(snapshot.id);
        await this.media.deleteSnapshot(snapshot.id);
        await this.repository.transaction(async (tx) => {
          await lockResources(tx, [`conversation:${snapshot.conversationId}`]);
          const current = await this.repository.snapshot(snapshot.id, tx);
          if (
            current?.imageState === "REVOKED" &&
            version === (await this.repository.snapshotVersion(snapshot.id, tx))
          ) {
            await this.repository.updateSnapshot(
              snapshot.id,
              { imageState: "DELETED", imageDeletedAt: await this.repository.now(tx) },
              tx,
            );
            await this.repository.completeSnapshotCleanup(snapshot.conversationId, snapshot.id, tx);
          }
        });
      } catch {
        // Row REVOKED là retry bền vững; tiếp tục batch để một object lỗi không chặn toàn bộ cleanup.
        failed = true;
      }
    }
    await this.media.cleanupUploads();
    if (failed) throw new Error("CHAT_CLEANUP_RETRY");
    // Một nhịp đã xử lý một batch; không lặp nóng khi tombstone chưa được dọn.
    return false;
  }

  /** Object sau tombstone hoặc thiếu reservation được dọn khi đủ cũ; snapshot sống không bị suy từ mtime. */
  private async reconcileObjects(): Promise<void> {
    this.inventory ??= this.media.snapshotInventory();
    if (!this.inventory) return;
    for (let index = 0; index < 20; index++) {
      const entry = await this.inventory.next();
      if (entry.done) {
        this.inventory = undefined;
        break;
      }
      const match = /^chat-snapshot\/([0-9a-f-]{36})\.webp$/.exec(entry.value.key);
      if (!match || entry.value.modifiedAt.getTime() >= Date.now() - 17 * 60_000) continue;
      const snapshot = await this.repository.snapshotByKey(entry.value.key);
      if (!snapshot || snapshot.imageState === "DELETED") await this.media.deleteSnapshot(match[1]);
    }
  }
}
