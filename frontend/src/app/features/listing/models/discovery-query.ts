import type { ListingType, RentalUnit } from './listing.models';

export type ListingSort = 'NEWEST' | 'OLDEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'RANDOM';
export interface DiscoveryFilters {
  tab: 'nearby' | 'national';
  q: string;
  type: ListingType | '';
  rentalUnit: RentalUnit | '';
  provinceCode: string;
  minPrice: string;
  maxPrice: string;
  postedWithin: 'ALL' | '24H' | '7D' | '30D';
  sort: ListingSort;
}
export interface DiscoveryQuery {
  feed: 'nearby' | 'national';
  q: string;
  type?: ListingType;
  rentalUnit?: RentalUnit;
  provinceCode?: string;
  minPrice?: string;
  maxPrice?: string;
  postedWithin: DiscoveryFilters['postedWithin'];
  sort: ListingSort;
  limit: number;
}
export const INITIAL_FILTERS: DiscoveryFilters = {
  tab: 'national',
  q: '',
  type: '',
  rentalUnit: '',
  provinceCode: '',
  minPrice: '',
  maxPrice: '',
  postedWithin: 'ALL',
  sort: 'RANDOM',
};

/** Builds only contract-valid combinations; normalization/search semantics remain server-owned. */
export function discoveryQuery(filters: DiscoveryFilters): {
  query: DiscoveryQuery | null;
  error: string;
} {
  const sort =
    filters.sort === 'RANDOM' && (filters.tab !== 'national' || filters.q.trim())
      ? 'NEWEST'
      : filters.sort;
  const error = filterError(filters, sort);
  if (error) return { query: null, error };
  return {
    error: '',
    query: {
      feed: filters.tab,
      q: filters.q,
      sort,
      postedWithin: filters.postedWithin,
      limit: 12,
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.rentalUnit ? { rentalUnit: filters.rentalUnit } : {}),
      ...(filters.tab === 'nearby' ? { provinceCode: filters.provinceCode } : {}),
      ...(filters.minPrice ? { minPrice: filters.minPrice } : {}),
      ...(filters.maxPrice ? { maxPrice: filters.maxPrice } : {}),
    },
  };
}

/** Explains invalid input before an HTTP request, preserving exact integer VND comparisons. */
function filterError(filters: DiscoveryFilters, sort: ListingSort): string {
  if (filters.q.includes('\u0000') || [...filters.q].length > 150)
    return 'Từ khóa tối đa 150 ký tự và không chứa ký tự NUL.';
  if (filters.tab === 'nearby' && !filters.provinceCode)
    return 'Chọn tỉnh/thành phố để xem bài gần bạn.';
  if (filters.rentalUnit && filters.type !== 'RENT')
    return 'Đơn vị thuê chỉ áp dụng cho bài cho thuê.';
  const priced = filters.minPrice !== '' || filters.maxPrice !== '' || sort.startsWith('PRICE_');
  if (priced && filters.type !== 'SALE' && filters.type !== 'RENT')
    return 'Chọn Bán hoặc Cho thuê để lọc, sắp xếp giá.';
  if (priced && filters.type === 'RENT' && !filters.rentalUnit)
    return 'Chọn ngày hoặc tháng trước khi so sánh giá thuê.';
  for (const price of [filters.minPrice, filters.maxPrice]) {
    if (price && !/^[1-9][0-9]{0,14}$/.test(price))
      return 'Giá phải là số nguyên VNĐ từ 1 đến 999999999999999.';
  }
  if (filters.minPrice && filters.maxPrice && BigInt(filters.minPrice) > BigInt(filters.maxPrice))
    return 'Giá tối đa phải lớn hơn hoặc bằng giá tối thiểu.';
  return '';
}
