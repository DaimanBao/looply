import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import type { Province } from '../../../core/http/api.models';
import { UserApi } from '../../user/public-api';
import { MediaDraft } from '../../media/public-api';
import { ListingApi } from '../data-access/listing.api';
import { ListingManagementApi } from '../data-access/listing-management.api';
import { listingError, listingErrorCode } from '../data-access/listing-error';
import { listingForm } from '../models/listing-form';
import type { ListingDetail } from '../models/listing.models';

@Injectable()
export class ListingEditor implements OnDestroy {
  private readonly api = inject(ListingManagementApi);
  private readonly discovery = inject(ListingApi);
  private readonly user = inject(UserApi);
  private readonly session = inject(SessionService);
  readonly media = inject(MediaDraft);
  readonly form = listingForm();
  readonly listing = signal<ListingDetail | null>(null);
  readonly provinces = signal<Province[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly blocked = signal(false);
  readonly ready = signal(false);
  private epoch = 0;

  /** Nạp dữ liệu chủ và catalog, từ chối editor của người khác dù detail công khai đọc được. */
  async load(id: string | null): Promise<void> {
    const epoch = ++this.epoch;
    const identity = this.session.identityVersion();
    this.ready.set(false);
    this.busy.set(false);
    this.loading.set(true);
    this.listing.set(null);
    this.error.set('');
    this.success.set('');
    this.blocked.set(false);
    this.media.dispose();
    this.form.reset();
    try {
      const [profile, provinces, listing] = await Promise.all([
        this.user.me(),
        this.user.provinces(),
        id ? firstValueFrom(this.discovery.detail(id)) : null,
      ]);
      if (epoch !== this.epoch || identity !== this.session.identityVersion()) return;
      if (listing && listing.owner.id !== profile.id) {
        this.error.set('Bạn chỉ được quản lý bài đăng của mình.');
        return;
      }
      this.provinces.set(provinces);
      this.listing.set(listing);
      this.form.patchValue(
        listing
          ? {
              title: listing.title,
              description: listing.description,
              type: listing.type,
              price: listing.price ?? '',
              rentalUnit: listing.rentalUnit ?? 'DAY',
              provinceCode: listing.province.code,
              contactPhone: listing.contactPhone ?? '',
            }
          : { provinceCode: profile.province?.code ?? '', contactPhone: profile.phone ?? '' },
      );
      this.form.controls.type.enable();
      if (listing?.hasConversations) this.form.controls.type.disable();
      // Video đứng sau gallery để thao tác sắp xếp ảnh không đi qua video.
      this.media.initialize(
        listing
          ? [
              ...listing.media
                .filter((asset) => asset.type === 'IMAGE')
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
              ...listing.media.filter((asset) => asset.type === 'VIDEO'),
            ]
          : [],
      );
      this.form.markAsPristine();
      this.ready.set(true);
    } catch (error) {
      if (epoch === this.epoch && identity === this.session.identityVersion())
        this.error.set(listingError(error));
    } finally {
      if (epoch === this.epoch) this.loading.set(false);
    }
  }

  /** Lưu nội dung và manifest cuối cùng bằng một mutation có kiểm tra version. */
  async save(confirmConversationImpact: boolean): Promise<boolean> {
    if (!this.ready() || this.busy() || this.blocked() || this.media.uploading()) return false;
    this.form.markAllAsTouched();
    const manifest = this.media.manifest();
    if (this.form.invalid || !manifest) {
      this.error.set(
        'Kiểm tra các trường và chọn 1–5 ảnh đã upload; tệp lỗi/hết hạn cần bỏ hoặc chọn lại.',
      );
      return false;
    }
    const listing = this.listing();
    if (listing?.status === 'HIDDEN' && listing.hasAcceptedProposal) {
      this.error.set('Hãy hiện lại bài trước khi sửa nội dung.');
      return false;
    }
    if (listing?.hasConversations && !confirmConversationImpact) return false;
    const value = this.form.getRawValue();
    const input = {
      ...value,
      price: value.type === 'EXCHANGE' ? null : value.price,
      rentalUnit: value.type === 'RENT' ? value.rentalUnit : null,
      contactPhone: value.contactPhone || null,
      media: manifest,
    };
    const saved = await this.mutate(
      () =>
        listing
          ? this.api.update(listing.id, input, listing.version, confirmConversationImpact)
          : this.api.create(input),
      'Đã lưu bài đăng.',
    );
    if (saved) {
      this.media.committed();
      this.form.markAsPristine();
    }
    return saved;
  }

  /** Ẩn hoặc mở lại bài đã lưu, không gửi thay đổi chưa lưu của editor. */
  async visibility(confirmed: boolean): Promise<boolean> {
    const listing = this.listing();
    if (!listing || !confirmed || this.busy() || this.blocked()) return false;
    return this.mutate(
      () =>
        this.api.visibility(
          listing.id,
          listing.version,
          listing.status === 'ACTIVE' ? 'HIDDEN' : 'ACTIVE',
          listing.hasAcceptedProposal,
        ),
      'Đã cập nhật trạng thái.',
    );
  }

  /** Xóa mềm với đúng version và xác nhận của người dùng. */
  async remove(confirmed: boolean): Promise<boolean> {
    const listing = this.listing();
    if (!listing || !confirmed || this.busy() || this.blocked()) return false;
    return this.mutate(() => this.api.remove(listing.id, listing.version), 'Đã xóa bài đăng.');
  }

  /** Đổi danh tính phải xóa ngay dữ liệu riêng và vô hiệu hóa response cũ. */
  clear(): void {
    this.epoch++;
    this.ready.set(false);
    this.listing.set(null);
    this.form.reset();
    this.media.dispose();
  }

  /** Vô hiệu hóa tác vụ đang chờ khi provider editor bị hủy. */
  ngOnDestroy(): void {
    this.clear();
  }

  /** Khóa thao tác song song và chặn retry mù khi không xác định được kết quả commit. */
  private async mutate(
    request: () => Observable<ListingDetail | void>,
    message: string,
  ): Promise<boolean> {
    const epoch = this.epoch;
    const identity = this.session.identityVersion();
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const result = await firstValueFrom(request());
      if (epoch !== this.epoch || identity !== this.session.identityVersion()) return false;
      if (result) this.listing.set(result);
      this.success.set(message);
      return true;
    } catch (error) {
      if (epoch !== this.epoch || identity !== this.session.identityVersion()) return false;
      const code = listingErrorCode(error);
      this.blocked.set(
        [
          'LISTING_VERSION_CONFLICT',
          'LISTING_TYPE_LOCKED',
          'LISTING_CONFIRMATION_REQUIRED',
        ].includes(code) ||
          !(error instanceof HttpErrorResponse) ||
          error.status === 0 ||
          error.status >= 500,
      );
      this.error.set(
        this.blocked() && (!code || (error instanceof HttpErrorResponse && error.status >= 500))
          ? 'Chưa xác định được kết quả. Kiểm tra Bài đăng của tôi hoặc tải lại trước khi thử tiếp để tránh tạo trùng.'
          : listingError(error),
      );
      return false;
    } finally {
      if (epoch === this.epoch) this.busy.set(false);
    }
  }
}
