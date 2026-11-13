export type AccountStatus = 'ACTIVE' | 'PENDING_DELETION' | 'DELETING' | 'DELETED';
export interface SessionTokens {
  accessToken: string;
  expiresIn: number;
  status: AccountStatus;
}
export interface Province {
  code: string;
  name: string;
}
export interface PublicProfile {
  id: string;
  username: string | null;
  displayName: string;
  bio: string | null;
  province: Province | null;
  avatarUrl: string | null;
  followers: number;
  following: number;
}
export interface PrivateProfile extends PublicProfile {
  username: string;
  email: string | null;
  emailVerifiedAt: string | null;
  phone: string | null;
  phoneVerifiedAt: string | null;
  status: AccountStatus;
  deletionRequestedAt: string | null;
  usernameChangedAt: string | null;
}
export interface ProfilePage {
  data: PublicProfile[];
  pagination: { nextCursor: string | null };
}
export interface AuthSession {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  current: boolean;
}
export type OtpPurpose =
  | 'REGISTER_PHONE'
  | 'LOGIN_PHONE'
  | 'CHANGE_PHONE'
  | 'VERIFY_EMAIL'
  | 'RESET_PASSWORD'
  | 'REAUTH_PHONE';
export type SensitiveOperation =
  'CHANGE_PASSWORD' | 'CHANGE_EMAIL' | 'CHANGE_PHONE' | 'DELETE_ACCOUNT';
export interface OtpAccepted {
  challengeId: string;
  expiresIn: number;
}
export interface OtpProof {
  challengeId: string;
  code: string;
}
export interface ContactChange extends OtpProof {
  destination: string;
  reauthProof: string;
}
export interface Registration extends OtpProof {
  username: string;
  password: string;
  phone: string;
  provinceCode: string;
  email?: string;
}
export interface ProfilePatch {
  displayName?: string;
  bio?: string | null;
  provinceCode?: string;
}
