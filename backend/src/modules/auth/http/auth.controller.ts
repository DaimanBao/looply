import type { RequestHandler } from "express";
import { z } from "zod";
import type { IdentityService } from "../identity/identity.service";
import type { SessionService } from "../sessions/session.service";
import type { CredentialService } from "../credentials/credential.service";
import type { OtpService } from "../otp/otp.service";
import {
  registerSchema,
  passwordLoginSchema,
  phoneLoginSchema,
  googleSchema,
  requestOtpSchema,
  reauthSchema,
  resetSchema,
} from "../auth.schema";
import { principal } from "./auth.middleware";
import { body } from "../../../shared/http/validated-body";
import { sessionResponse, refreshCookie, clearRefresh } from "./auth.cookies";

export const linkGoogleSchema = googleSchema
  .extend({ reauthProof: z.string().min(40).max(128) })
  .strict();
export type AuthController = ReturnType<typeof createAuthController>;

/** Chỉ chuyển đổi tại ranh giới HTTP; quy tắc nghiệp vụ thông tin xác thực/phiên nằm trong service. */
export function createAuthController(
  identity: IdentityService,
  sessions: SessionService,
  credentials: CredentialService,
  otp: OtpService,
  secure: boolean,
) {
  /** Chỉ trả token sau khi đăng ký đã xác minh được commit. */
  const register: RequestHandler = async (_request, response) => {
    sessionResponse(response, await identity.register(body(response, registerSchema)), secure, 201);
  };
  /** Đặt refresh cookie sau khi xác thực mật khẩu. */
  const passwordLogin: RequestHandler = async (_request, response) => {
    sessionResponse(
      response,
      await identity.passwordLogin(body(response, passwordLoginSchema)),
      secure,
    );
  };
  /** Đổi mã điện thoại đã xác minh lấy phiên. */
  const phoneLogin: RequestHandler = async (_request, response) => {
    sessionResponse(response, await identity.phoneLogin(body(response, phoneLoginSchema)), secure);
  };
  /** Đổi định danh provider đã xác minh lấy phiên. */
  const googleLogin: RequestHandler = async (_request, response) => {
    sessionResponse(response, await identity.googleLogin(body(response, googleSchema)), secure);
  };
  /** Trả nonce mới gắn với phiên hiện tại nếu có. */
  const googleChallenge: RequestHandler = async (_request, response) => {
    response.json(await identity.challenge(response.locals.principal));
  };
  /** Tiêu thụ quyền liên kết mà không tiết lộ dữ liệu provider. */
  const googleLink: RequestHandler = async (_request, response) => {
    await identity.link(principal(response), body(response, linkGoogleSchema));
    response.sendStatus(204);
  };
  /** Chỉ trả metadata challenge, không trả mã đã gửi. */
  const requestOtp: RequestHandler = async (_request, response) => {
    response
      .status(202)
      .json(await otp.request(body(response, requestOtpSchema), response.locals.principal));
  };
  /** Luân chuyển cookie và giữ giá trị bearer ngoài JSON. */
  const refresh: RequestHandler = async (request, response) => {
    sessionResponse(response, await sessions.refresh(refreshCookie(request)), secure);
  };
  /** Thu hồi phiên của cookie và làm hết hạn cookie trên trình duyệt. */
  const logout: RequestHandler = async (request, response) => {
    await sessions.logout(refreshCookie(request));
    clearRefresh(response, secure);
    response.sendStatus(204);
  };
  /** Trả proof ngắn hạn và tắt cache. */
  const reauthenticate: RequestHandler = async (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(
      await credentials.reauthenticate(principal(response), body(response, reauthSchema)),
    );
  };
  /** Hoàn tất khôi phục và xóa refresh cookie trình duyệt đã lỗi thời. */
  const reset: RequestHandler = async (_request, response) => {
    await credentials.resetPassword(body(response, resetSchema));
    clearRefresh(response, secure);
    response.sendStatus(204);
  };
  /** Trả metadata phiên an toàn cho chủ sở hữu. */
  const list: RequestHandler = async (_request, response) => {
    response.json(await sessions.list(principal(response)));
  };
  /** Chỉ xóa quyền của định danh phiên thuộc bên gọi. */
  const revoke: RequestHandler = async (request, response) => {
    await sessions.revoke(principal(response), z.uuid().parse(request.params.sessionId));
    response.sendStatus(204);
  };
  return {
    register,
    passwordLogin,
    phoneLogin,
    googleLogin,
    googleChallenge,
    googleLink,
    requestOtp,
    refresh,
    logout,
    reauthenticate,
    reset,
    list,
    revoke,
  };
}
