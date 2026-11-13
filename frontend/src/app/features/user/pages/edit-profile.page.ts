import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Province } from '../../../core/http/api.models';
import { codePointLength } from '../../../shared/validation/account.validators';
import { ActionState } from '../../../shared/ui/action-state';
import { Feedback } from '../../../shared/ui/feedback';
import { UserApi } from '../data-access/user.api';
import { ProfileStore } from '../state/profile.store';
import { Avatar } from '../components/avatar';

@Component({
  imports: [ReactiveFormsModule, RouterLink, Feedback, Avatar],
  template: `
    <p><a routerLink="/account">← Tài khoản</a></p>
    <section class="card form-card">
      <h1>Chỉnh sửa hồ sơ</h1>
      <app-feedback [state]="loading" />
      @if (loading.error()) {
        <button (click)="load()">Thử lại</button>
      }
      @if (ready()) {
        @if (store.profile(); as profile) {
          <div class="avatar-edit">
            <app-avatar [profile]="profile" />
            <div>
              <label
                >Ảnh đại diện<input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  (change)="upload($event)"
                  [disabled]="state.busy()" /></label
              ><small>JPEG, PNG, WebP · Tối đa 10 MiB</small>
              @if (profile.avatarUrl) {
                <button
                  class="text-button"
                  type="button"
                  (click)="removeAvatar()"
                  [disabled]="state.busy()"
                >
                  Xóa ảnh đại diện
                </button>
              }
            </div>
          </div>
        }
        <form [formGroup]="form" (ngSubmit)="save()">
          <label>Tên hiển thị<input formControlName="displayName" autocomplete="nickname" /></label
          ><small>1–60 ký tự Unicode.</small
          ><label>Giới thiệu<textarea formControlName="bio" rows="4"></textarea></label
          ><small>Tối đa 300 ký tự Unicode.</small
          ><label
            >Tỉnh / thành phố<select formControlName="provinceCode">
              <option value="">Chọn tỉnh / thành phố</option>
              @for (province of provinces(); track province.code) {
                <option [value]="province.code">{{ province.name }}</option>
              }
            </select></label
          >
          @if (form.touched && form.invalid) {
            <p role="alert" class="notice error">
              Tên hiển thị, giới thiệu hoặc tỉnh/thành phố chưa hợp lệ.
            </p>
          }
          <button class="primary" [disabled]="state.busy()">Lưu thay đổi</button>
        </form>
      }
      <app-feedback [state]="state" />
    </section>
  `,
})
export class EditProfilePage implements OnInit {
  private readonly api = inject(UserApi);
  readonly store = inject(ProfileStore);
  readonly state = new ActionState();
  readonly loading = new ActionState();
  readonly provinces = signal<Province[]>([]);
  readonly ready = signal(false);
  readonly form = new FormGroup({
    displayName: new FormControl('', { nonNullable: true, validators: [codePointLength(1, 60)] }),
    bio: new FormControl('', { nonNullable: true, validators: [codePointLength(0, 300)] }),
    provinceCode: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  /** Loads catalog and owner data before enabling edits. */
  ngOnInit(): void {
    void this.load();
  }
  /** Hydrates fields only from the authenticated owner's response. */
  async load(): Promise<void> {
    await this.loading.run(async () => {
      const [profile, provinces] = await Promise.all([this.store.load(), this.api.provinces()]);
      this.provinces.set(provinces);
      this.form.setValue({
        displayName: profile.displayName,
        bio: profile.bio || '',
        provinceCode: profile.province?.code || '',
      });
      this.ready.set(true);
    });
  }
  /** Patches only editable profile properties. */
  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    await this.state.run(async () => {
      await this.store.retainResponse(() => this.api.update(this.form.getRawValue()));
    }, 'Đã cập nhật hồ sơ.');
  }
  /** Checks file size/type for usability; the server still decodes and validates actual bytes. */
  async upload(event: Event): Promise<void> {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    if (!file) return;
    if (
      file.size > 10 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      this.state.error.set('Chọn ảnh JPEG, PNG hoặc WebP tối đa 10 MiB.');
      input.value = '';
      return;
    }
    await this.state.run(async () => {
      await this.store.retainResponse(() => this.api.avatar(file));
    }, 'Đã thay ảnh đại diện.');
    input.value = '';
  }
  /** Removes the avatar and reloads the public pointer from the owner endpoint. */
  async removeAvatar(): Promise<void> {
    await this.state.run(async () => {
      await this.api.removeAvatar();
      await this.store.load();
    }, 'Đã xóa ảnh đại diện.');
  }
}
