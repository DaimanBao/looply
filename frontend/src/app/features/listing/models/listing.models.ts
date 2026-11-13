import type { Province, PublicProfile } from '../../../core/http/api.models';

export type ListingType = 'SALE' | 'RENT' | 'EXCHANGE';
export type RentalUnit = 'DAY' | 'MONTH';
interface MediaBase {
  id: string;
  sizeBytes: string;
  deliveryPath: string;
}
export interface ListingImage extends MediaBase {
  type: 'IMAGE';
  mimeType: 'image/webp';
  durationSeconds: null;
  position: number;
  isCover: boolean;
}
export interface ListingVideo extends MediaBase {
  type: 'VIDEO';
  mimeType: 'video/mp4' | 'video/webm';
  durationSeconds: number;
  position: null;
  isCover: false;
}
export type ListingMedia = ListingImage | ListingVideo;
export interface ListingItem {
  id: string;
  title: string;
  type: ListingType;
  status: 'ACTIVE' | 'HIDDEN' | 'DELETED';
  price: string | null;
  rentalUnit: RentalUnit | null;
  province: Province;
  owner: PublicProfile;
  cover: ListingImage;
  isFollowed: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface ListingDetail extends ListingItem {
  description: string;
  contactPhone: string | null;
  media: ListingMedia[];
  version: number;
  activeCycle: number;
  hasConversations: boolean;
  hasAcceptedProposal: boolean;
}
export interface ListingPage {
  data: ListingItem[];
  pagination: { nextCursor: string | null };
}
export interface ListingSuggestion {
  id: string;
  title: string;
}
