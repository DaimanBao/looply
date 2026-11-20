export type ReminderField = "PHONE" | "EMAIL" | "PROVINCE";
export interface ReminderProfile {
  phone: string | null;
  phoneVerifiedAt: Date | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  province: { code: string } | null;
}

/** Chỉ nhắc ba thông tin đã duyệt; có giá trị liên hệ nhưng chưa xác minh vẫn còn thiếu. */
export function missingProfileFields(profile: ReminderProfile): ReminderField[] {
  const fields: ReminderField[] = [];
  if (!profile.phone || !profile.phoneVerifiedAt) fields.push("PHONE");
  if (!profile.email || !profile.emailVerifiedAt) fields.push("EMAIL");
  if (!profile.province) fields.push("PROVINCE");
  return fields;
}
