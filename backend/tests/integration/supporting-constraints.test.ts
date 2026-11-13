import { constraintCases } from "../helpers/constraint-cases";

constraintCases("auth_sessions", [
  { name: "accepts initial token version", changes: { tokenVersion: 1 } },
  { name: "accepts rotated token version", changes: { tokenVersion: 2 } },
  {
    name: "rejects zero token version",
    changes: { tokenVersion: 0 },
    constraint: "ck_session_version",
  },
  {
    name: "rejects negative token version",
    changes: { tokenVersion: -1 },
    constraint: "ck_session_version",
  },
]);
constraintCases("otp_challenges", [
  { name: "accepts zero attempts", changes: { attempts: 0 } },
  { name: "accepts five attempts", changes: { attempts: 5 } },
  { name: "rejects negative attempts", changes: { attempts: -1 }, constraint: "ck_otp_attempts" },
  { name: "rejects six attempts", changes: { attempts: 6 }, constraint: "ck_otp_attempts" },
  {
    name: "accepts challenge before user registration",
    changes: { userId: null, channel: "SMS", purpose: "REGISTER_PHONE" },
  },
]);
constraintCases("notifications", [
  { name: "accepts unread notification", changes: { isRead: false, readAt: null } },
  { name: "accepts read notification", changes: { isRead: true, readAt: new Date() } },
  {
    name: "rejects unread notification with timestamp",
    changes: { isRead: false, readAt: new Date() },
    constraint: "ck_notification_read",
  },
  {
    name: "rejects read notification without timestamp",
    changes: { isRead: true, readAt: null },
    constraint: "ck_notification_read",
  },
]);
constraintCases("outbox_events", [
  { name: "accepts initial attempt count", changes: { attempts: 0 } },
  { name: "accepts retry count", changes: { attempts: 1 } },
  {
    name: "rejects negative attempts",
    changes: { attempts: -1 },
    constraint: "ck_outbox_attempts",
  },
  { name: "rejects unsupported outbox status", changes: { status: "DONE" }, code: "22P02" },
]);
constraintCases("users", [
  { name: "accepts minimum username length", changes: { username: "a_1" } },
  { name: "accepts maximum username length", changes: { username: "a".repeat(30) } },
  {
    name: "rejects verified email time without email",
    changes: { email: null },
    constraint: "ck_user_verified_email",
  },
  {
    name: "rejects verified phone time without phone",
    changes: { phone: null },
    constraint: "ck_user_verified_phone",
  },
  {
    name: "accepts missing optional contacts",
    changes: { email: null, emailVerifiedAt: null, phone: null, phoneVerifiedAt: null },
  },
]);
constraintCases("listings", [
  {
    name: "accepts lower title and description limits",
    changes: { title: "a".repeat(10), description: "b".repeat(20) },
  },
  {
    name: "accepts upper title and description limits",
    changes: { title: "a".repeat(150), description: "b".repeat(5000) },
  },
  {
    name: "rejects 5001 description characters",
    changes: { description: "b".repeat(5001) },
    constraint: "ck_listing_title_description",
  },
  { name: "rejects 151 title characters", changes: { title: "a".repeat(151) }, code: "22001" },
  { name: "accepts minimum price", changes: { price: "1" } },
  { name: "accepts maximum price", changes: { price: "999999999999999" } },
  { name: "rejects zero price", changes: { price: "0" }, constraint: "ck_listing_price_type" },
  { name: "rejects price overflow", changes: { price: "1000000000000000" }, code: "22003" },
  { name: "accepts hidden listing", changes: { status: "HIDDEN" } },
  {
    name: "rejects hidden listing with deletion time",
    changes: { status: "HIDDEN", deletedAt: new Date() },
    constraint: "ck_listing_deleted_at",
  },
  {
    name: "rejects EXCHANGE rental unit",
    changes: { type: "EXCHANGE", price: null, rentalUnit: "DAY" },
    constraint: "ck_listing_price_type",
  },
  { name: "rejects unsupported COMPLETED status", changes: { status: "COMPLETED" }, code: "22P02" },
]);
