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
  templateUrl: './edit-profile.page.html',
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

  /** Nạp danh mục và dữ liệu chủ sở hữu trước khi cho chỉnh sửa. */
  ngOnInit(): void {
    void this.load();
  }

  /** Chỉ điền trường từ response của chủ sở hữu đã xác thực. */
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

  /** Chỉ vá thuộc tính hồ sơ được phép sửa. */
  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    await this.state.run(async () => {
      await this.store.retainResponse(() => this.api.update(this.form.getRawValue()));
    }, 'Đã cập nhật hồ sơ.');
  }

  /** Kiểm tra kích thước/loại file để hỗ trợ trải nghiệm; server vẫn giải mã và kiểm tra byte thực. */
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

  /** Xóa avatar và nạp lại con trỏ công khai từ endpoint chủ sở hữu. */
  async removeAvatar(): Promise<void> {
    await this.state.run(async () => {
      await this.api.removeAvatar();
      await this.store.load();
    }, 'Đã xóa ảnh đại diện.');
  }
}
