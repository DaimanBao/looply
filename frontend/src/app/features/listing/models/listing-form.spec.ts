import { FormControl } from '@angular/forms';
import { listingForm, listingText } from './listing-form';

describe('Listing form validation', () => {
  it('counts Unicode code points and trims only ASCII spaces', () => {
    const validate = listingText(10, 150);
    expect(validate(new FormControl('😀'.repeat(9)))).not.toBeNull();
    expect(validate(new FormControl('  ' + '😀'.repeat(10) + '  '))).toBeNull();
    expect(validate(new FormControl('😀'.repeat(151)))).not.toBeNull();
    expect(listingText(1, 1)(new FormControl('\u00a0'))).toBeNull();
  });

  it('keeps money as exact digits, validates phone and permits exchange without money', () => {
    const form = listingForm();
    form.patchValue({
      title: 'Đèn học còn dùng tốt',
      description: 'Đèn học còn dùng tốt và được giữ gìn.',
      provinceCode: '79',
    });
    for (const price of ['0', '01', '-1', '1.5', '1e3', '1000000000000000']) {
      form.controls.price.setValue(price);
      expect(form.invalid).toBe(true);
    }
    form.controls.price.setValue('999999999999999');
    expect(form.valid).toBe(true);
    form.controls.contactPhone.setValue('0901234567');
    expect(form.invalid).toBe(true);
    form.controls.contactPhone.setValue('+84901234567');
    form.patchValue({ type: 'EXCHANGE', price: '' });
    expect(form.valid).toBe(true);
    form.controls.provinceCode.setValue('');
    expect(form.invalid).toBe(true);
  });
});
