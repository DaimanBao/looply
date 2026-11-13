import type { ListingType, RentalUnit } from './listing.models';

export interface ListingManifest {
  imageIds: string[];
  coverImageId: string;
  videoId: string | null;
}
export interface ListingInput {
  title: string;
  description: string;
  type: ListingType;
  price: string | null;
  rentalUnit: RentalUnit | null;
  provinceCode: string;
  contactPhone: string | null;
  media: ListingManifest;
}
