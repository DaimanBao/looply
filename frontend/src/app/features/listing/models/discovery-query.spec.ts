import { discoveryQuery, type DiscoveryFilters } from './discovery-query';

const filters: DiscoveryFilters = {
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

describe('discovery filter contract', () => {
  it('requires a manually selected province for Nearby and omits it for National', () => {
    expect(discoveryQuery({ ...filters, tab: 'nearby' }).error).toContain('tỉnh');
    expect(discoveryQuery({ ...filters, provinceCode: '79' }).query?.provinceCode).toBeUndefined();
  });
  it('never compares exchange, mixed types or incompatible rental units', () => {
    for (const type of ['', 'EXCHANGE'] as const) {
      expect(discoveryQuery({ ...filters, type, minPrice: '1' }).query).toBeNull();
      expect(discoveryQuery({ ...filters, type, sort: 'PRICE_ASC' }).query).toBeNull();
    }
    expect(discoveryQuery({ ...filters, type: 'RENT', minPrice: '1' }).query).toBeNull();
    expect(discoveryQuery({ ...filters, type: 'SALE', rentalUnit: 'DAY' }).query).toBeNull();
    expect(
      discoveryQuery({ ...filters, type: 'RENT', rentalUnit: 'MONTH', sort: 'PRICE_DESC' }).query,
    ).not.toBeNull();
  });
  it('validates integer VND boundaries without rounding and leaves Vietnamese search to the server', () => {
    expect(
      discoveryQuery({ ...filters, type: 'SALE', minPrice: '999999999999999', maxPrice: '2' })
        .query,
    ).toBeNull();
    for (const minPrice of ['0', '-1', '1.5', '1e3', '1000000000000000']) {
      expect(discoveryQuery({ ...filters, type: 'SALE', minPrice }).query).toBeNull();
    }
    const result = discoveryQuery({ ...filters, q: 'ĐÈN học' });
    expect(result.query?.q).toBe('ĐÈN học');
    expect(result.query?.sort).toBe('NEWEST');
    expect(result.query?.limit).toBe(12);
  });
});
