export type ReminderField = 'PHONE' | 'EMAIL' | 'PROVINCE';

export const reminderActions = {
  PHONE: {
    label: 'Xác minh số điện thoại',
    path: '/account/contacts',
    query: { kind: 'phone' },
    fragment: undefined,
  },
  EMAIL: {
    label: 'Xác minh email',
    path: '/account/contacts',
    query: { kind: 'email' },
    fragment: undefined,
  },
  PROVINCE: {
    label: 'Bổ sung tỉnh / thành phố',
    path: '/account/edit',
    query: {},
    fragment: 'province',
  },
} satisfies Record<
  ReminderField,
  { label: string; path: string; query: Record<string, string>; fragment: string | undefined }
>;
