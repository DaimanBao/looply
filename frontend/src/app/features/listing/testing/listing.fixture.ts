import type { ListingDetail } from '../models/listing.models';

/** Cung cấp dữ liệu công khai đúng contract với ID ổn định cho test Listing tập trung. */
export function listingFixture(overrides: Partial<ListingDetail> = {}): ListingDetail {
  const id = '00000000-0000-4000-8000-000000000001';
  const cover = {
    id: '00000000-0000-4000-8000-000000000010',
    type: 'IMAGE' as const,
    mimeType: 'image/webp' as const,
    sizeBytes: '100',
    durationSeconds: null,
    position: 0,
    isCover: true,
    deliveryPath: `/api/listings/${id}/media/00000000-0000-4000-8000-000000000010`,
  };
  return {
    id,
    title: 'Đèn học còn dùng tốt',
    description: 'Đèn học được giữ gìn và còn sử dụng tốt.',
    type: 'SALE',
    status: 'ACTIVE',
    price: '250000',
    rentalUnit: null,
    province: { code: '79', name: 'Hồ Chí Minh' },
    owner: {
      id: '00000000-0000-4000-8000-000000000099',
      displayName: 'An',
      username: 'an',
      bio: null,
      province: { code: '79', name: 'Hồ Chí Minh' },
      avatarUrl: null,
      followers: 0,
      following: 0,
    },
    cover,
    media: [cover],
    isFollowed: false,
    createdAt: '2026-11-12T10:00:00Z',
    updatedAt: '2026-11-12T10:00:00Z',
    contactPhone: null,
    version: 1,
    activeCycle: 1,
    hasConversations: false,
    hasAcceptedProposal: false,
    ...overrides,
  };
}
