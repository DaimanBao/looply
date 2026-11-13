import type { RequestHandler } from "express";
import { userIdSchema } from "../user.schema";
import type { UserService } from "../user.service";
import type { CredentialService } from "../../auth";
import { profileSchema, changeUsernameSchema, pageSchema } from "../user.schema";
import { changePasswordSchema, changeContactSchema } from "../../auth";
import { principal } from "../../auth";
import { body } from "../../../shared/http/validated-body";

/** Quản lý tuần tự hóa HTTP; service User/Auth giữ mọi quy tắc thay đổi và phân quyền. */
export function createUserController(users: UserService, credentials: CredentialService) {
  /** Chỉ trả dữ liệu riêng qua projection dành cho chủ sở hữu. */
  const me: RequestHandler = async (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(await users.me(principal(response)));
  };
  /** Truyền bản vá hồ sơ đã kiểm tra vào service có phân quyền chủ sở hữu. */
  const update: RequestHandler = async (_request, response) => {
    response.json(await users.update(principal(response), body(response, profileSchema)));
  };
  /** Trả hồ sơ chủ đã cập nhật sau kiểm tra thời gian chờ. */
  const username: RequestHandler = async (_request, response) => {
    response.json(
      await users.username(principal(response), body(response, changeUsernameSchema).username),
    );
  };
  /** Áp dụng proof và mã riêng cho email mà không lộ credential. */
  const email: RequestHandler = async (_request, response) => {
    await credentials.changeContact(
      principal(response),
      "email",
      body(response, changeContactSchema),
    );
    response.sendStatus(204);
  };
  /** Áp dụng proof và mã riêng cho điện thoại mà không lộ credential. */
  const phone: RequestHandler = async (_request, response) => {
    await credentials.changeContact(
      principal(response),
      "phone",
      body(response, changeContactSchema),
    );
    response.sendStatus(204);
  };
  /** Đổi credential mà không trả mật khẩu hoặc dữ liệu refresh. */
  const password: RequestHandler = async (_request, response) => {
    await credentials.changePassword(principal(response), body(response, changePasswordSchema));
    response.sendStatus(204);
  };
  /** Công bố danh mục tham chiếu đang hoạt động. */
  const provinces: RequestHandler = async (_request, response) => {
    response.json(await users.provinces());
  };
  /** Dùng projection công khai có xét block cho người xem tùy chọn. */
  const profile: RequestHandler = async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(
      await users.profile(userIdSchema.parse(request.params).userId, response.locals.principal),
    );
  };
  /** Trả trang có giới hạn gồm hồ sơ công khai của người theo dõi. */
  const followers: RequestHandler = async (request, response) => {
    response.json(
      await users.related(
        userIdSchema.parse(request.params).userId,
        "followers",
        pageSchema.parse(request.query),
        response.locals.principal,
      ),
    );
  };
  /** Trả trang có giới hạn gồm hồ sơ công khai đang theo dõi. */
  const following: RequestHandler = async (request, response) => {
    response.json(
      await users.related(
        userIdSchema.parse(request.params).userId,
        "following",
        pageSchema.parse(request.query),
        response.locals.principal,
      ),
    );
  };
  /** Chỉ trả danh sách chặn của chủ sở hữu hiện tại. */
  const blocked: RequestHandler = async (request, response) => {
    const actor = principal(response);
    response.json(
      await users.related(actor.userId, "blocked", pageSchema.parse(request.query), actor),
    );
  };
  /** Tạo Follow có hướng của bên gọi theo cách idempotent. */
  const follow: RequestHandler = async (request, response) => {
    await users.relationship(
      principal(response),
      userIdSchema.parse(request.params).userId,
      "follow",
    );
    response.sendStatus(204);
  };
  /** Chỉ xóa Follow có hướng của bên gọi. */
  const unfollow: RequestHandler = async (request, response) => {
    await users.relationship(
      principal(response),
      userIdSchema.parse(request.params).userId,
      "unfollow",
    );
    response.sendStatus(204);
  };
  /** Ủy quyền bảo vệ tương tác hai chiều và cleanup Follow. */
  const block: RequestHandler = async (request, response) => {
    await users.relationship(
      principal(response),
      userIdSchema.parse(request.params).userId,
      "block",
    );
    response.sendStatus(204);
  };
  /** Chỉ xóa Block của bên gọi, không khôi phục Follow. */
  const unblock: RequestHandler = async (request, response) => {
    await users.relationship(
      principal(response),
      userIdSchema.parse(request.params).userId,
      "unblock",
    );
    response.sendStatus(204);
  };
  return {
    me,
    update,
    username,
    email,
    phone,
    password,
    provinces,
    profile,
    followers,
    following,
    blocked,
    follow,
    unfollow,
    block,
    unblock,
  };
}
