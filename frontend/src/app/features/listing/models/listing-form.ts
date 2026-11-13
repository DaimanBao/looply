import { FormControl, FormGroup, type ValidatorFn, Validators } from '@angular/forms';
import type { ListingType, RentalUnit } from './listing.models';

/** Đếm code point sau btrim ASCII giống PostgreSQL và validator Backend. */
export function listingText(min: number, max: number): ValidatorFn {
  return (control) => {
    const value: unknown = control.value;
    const count = typeof value === 'string' ? [...value.replace(/^ +| +$/g, '')].length : 0;
    return count >= min && count <= max ? null : { listingLength: true };
  };
}

/** Tạo form có kiểu chặt chẽ, kiểm tra giá dưới dạng chuỗi để giữ nguyên độ chính xác. */
export function listingForm() {
  return new FormGroup(
    {
      title: new FormControl('', { nonNullable: true, validators: [listingText(10, 150)] }),
      description: new FormControl('', { nonNullable: true, validators: [listingText(20, 5000)] }),
      type: new FormControl<ListingType>('SALE', { nonNullable: true }),
      price: new FormControl('', { nonNullable: true }),
      rentalUnit: new FormControl<RentalUnit>('DAY', { nonNullable: true }),
      provinceCode: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(32)],
      }),
      contactPhone: new FormControl('', {
        nonNullable: true,
        validators: [Validators.pattern(/^\+[1-9][0-9]{7,14}$/)],
      }),
    },
    {
      validators: (control) => {
        const type: unknown = control.get('type')?.value;
        const price: unknown = control.get('price')?.value;
        return type === 'EXCHANGE' ||
          (typeof price === 'string' && /^[1-9][0-9]{0,14}$/.test(price))
          ? null
          : { listingPrice: true };
      },
    },
  );
}
