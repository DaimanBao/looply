import type { RequestHandler } from "express";
import { z } from "zod";
import { userIdSchema } from "../user.schema";
import type { UserService } from "../user.service";
import type { CredentialService } from "../../auth";
import { profileSchema, changeUsernameSchema, pageSchema } from "../user.schema";
import { changePasswordSchema, changeContactSchema } from "../../auth";
import { principal } from "../../auth";
import { parseRequest, validatedHandler } from "../../../shared/middleware/validate-request";

/** Quản lý tuần tự hóa HTTP; service User/Auth giữ mọi quy tắc thay đổi và phân quyền. */
export function createUserController(users: UserService, credentials: CredentialService) {
  const userParams = z.object({ params: userIdSchema });
  const contactBody = z.object({ body: changeContactSchema });
  const pageRequest = z.object({ query: pageSchema });
  /** Chỉ trả dữ liệu riêng qua projection dành cho chủ sở hữu. */
  const me: RequestHandler = async (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(await users.me(principal(response)));
  };
  /** Truyền bản vá hồ sơ đã kiểm tra vào service có phân quyền chủ sở hữu. */
  const update = validatedHandler(z.object({ body: profileSchema }), async ({ body }, response) => {
    response.json(await users.update(principal(response), body));
  });
  /** Trả hồ sơ chủ đã cập nhật sau kiểm tra thời gian chờ. */
  const username = validatedHandler(
    z.object({ body: changeUsernameSchema }),
    async ({ body }, response) => {
      response.json(await users.username(principal(response), body.username));
    },
  );
  /** Áp dụng proof và mã riêng cho email mà không lộ credential. */
  const email = validatedHandler(contactBody, async ({ body }, response) => {
    await credentials.changeContact(principal(response), "email", body);
    response.sendStatus(204);
  });
  /** Áp dụng proof và mã riêng cho điện thoại mà không lộ credential. */
  const phone = validatedHandler(contactBody, async ({ body }, response) => {
    await credentials.changeContact(principal(response), "phone", body);
    response.sendStatus(204);
  });
  /** Đổi credential mà không trả mật khẩu hoặc dữ liệu refresh. */
  const password = validatedHandler(
    z.object({ body: changePasswordSchema }),
    async ({ body }, response) => {
      await credentials.changePassword(principal(response), body);
      response.sendStatus(204);
    },
  );
  /** Công bố danh mục tham chiếu đang hoạt động. */
  const provinces: RequestHandler = async (_request, response) => {
    response.json(await users.provinces());
  };
  /** Dùng projection công khai có xét block cho người xem tùy chọn. */
  const profile = validatedHandler(userParams, async ({ params }, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(await users.profile(params.userId, response.locals.principal));
  });
  /** Trả trang có giới hạn gồm hồ sơ công khai của người theo dõi. */
  const followers = validatedHandler(userParams, async ({ params }, response, request) => {
    const { query } = parseRequest(pageRequest, request);
    response.json(
      await users.related(params.userId, "followers", query, response.locals.principal),
    );
  });
  /** Trả trang có giới hạn gồm hồ sơ công khai đang theo dõi. */
  const following = validatedHandler(userParams, async ({ params }, response, request) => {
    const { query } = parseRequest(pageRequest, request);
    response.json(
      await users.related(params.userId, "following", query, response.locals.principal),
    );
  });
  /** Chỉ trả danh sách chặn của chủ sở hữu hiện tại. */
  const blocked = validatedHandler(pageRequest, async ({ query }, response) => {
    const actor = principal(response);
    response.json(await users.related(actor.userId, "blocked", query, actor));
  });
  /** Tạo Follow có hướng của bên gọi theo cách idempotent. */
  const follow = validatedHandler(userParams, async ({ params }, response) => {
    await users.relationship(principal(response), params.userId, "follow");
    response.sendStatus(204);
  });
  /** Chỉ xóa Follow có hướng của bên gọi. */
  const unfollow = validatedHandler(userParams, async ({ params }, response) => {
    await users.relationship(principal(response), params.userId, "unfollow");
    response.sendStatus(204);
  });
  /** Ủy quyền bảo vệ tương tác hai chiều và cleanup Follow. */
  const block = validatedHandler(userParams, async ({ params }, response) => {
    await users.relationship(principal(response), params.userId, "block");
    response.sendStatus(204);
  });
  /** Chỉ xóa Block của bên gọi, không khôi phục Follow. */
  const unblock = validatedHandler(userParams, async ({ params }, response) => {
    await users.relationship(principal(response), params.userId, "unblock");
    response.sendStatus(204);
  });
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
