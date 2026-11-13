import { Validators, type ValidatorFn } from '@angular/forms';

/** Matches server Unicode length rules for passwords, display names and biography. */
export function codePointLength(min: number, max: number): ValidatorFn {
  return (control) => {
    const count = typeof control.value === 'string' ? [...control.value].length : 0;
    return count >= min && count <= max ? null : { codePointLength: { min, max } };
  };
}
export const usernameValidator = Validators.pattern(/^[a-zA-Z0-9_]{3,30}$/);
export const phoneValidator = Validators.pattern(/^\+[1-9][0-9]{7,14}$/);
export const otpValidator = Validators.pattern(/^[0-9]{6}$/);
