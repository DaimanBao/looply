import { FormControl } from '@angular/forms';
import { codePointLength, usernameValidator, phoneValidator } from './account.validators';

describe('Account validation', () => {
  it('counts Unicode code points rather than UTF-16 units', () => {
    expect(codePointLength(8, 128)(new FormControl('😀'.repeat(8)))).toBeNull();
    expect(codePointLength(8, 128)(new FormControl('😀'.repeat(7)))).toEqual({
      codePointLength: { min: 8, max: 128 },
    });
  });
  it('accepts underscore-only usernames and rejects invalid characters', () => {
    expect(usernameValidator(new FormControl('___'))).toBeNull();
    expect(usernameValidator(new FormControl('a.b'))).not.toBeNull();
  });
  it('requires E.164 phone numbers', () => {
    expect(phoneValidator(new FormControl('+84901234567'))).toBeNull();
    expect(phoneValidator(new FormControl('0901234567'))).not.toBeNull();
  });
});
