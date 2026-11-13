import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { MediaUploadApi } from '../data-access/media-upload.api';

export interface DraftAsset {
  key: number;
  type: 'IMAGE' | 'VIDEO';
  id: string | null;
  temporary: boolean;
  file?: File;
  url: string;
  expiresAt?: string;
  state: 'uploading' | 'ready' | 'failed';
  invalidDuration?: boolean;
}

/** Kiểm tra sơ bộ theo bytes và MIME; server vẫn xác minh chữ ký và thời lượng thật. */
export function mediaFileError(file: File): string {
  const image = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  const video = ['video/mp4', 'video/webm'].includes(file.type);
  if (!image && !video) return 'Chọn JPEG, PNG, WebP, MP4 hoặc WebM.';
  if (!file.size || file.size > (image ? 10 : 100) * 1024 * 1024)
    return image
      ? 'Ảnh phải có dữ liệu và tối đa 10 MiB.'
      : 'Video phải có dữ liệu và tối đa 100 MiB.';
  return '';
}

@Injectable()
export class MediaDraft implements OnDestroy {
  private readonly api = inject(MediaUploadApi);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly requests = new Map<number, Subscription>();
  private sequence = 0;
  readonly assets = signal<DraftAsset[]>([]);
  readonly coverKey = signal<number | null>(null);
  readonly error = signal('');
  readonly uploading = computed(() => this.assets().some((asset) => asset.state === 'uploading'));
  readonly dirty = signal(false);

  /** Khởi tạo từ media đã gắn; không lấy quyền hủy TEMP từ các ID này. */
  initialize(assets: readonly { id: string; type: 'IMAGE' | 'VIDEO'; isCover: boolean }[]): void {
    this.dispose();
    this.error.set('');
    this.assets.set(
      assets.map((asset) => ({
        key: ++this.sequence,
        id: asset.id,
        type: asset.type,
        temporary: false,
        url: '',
        state: 'ready',
      })),
    );
    this.coverKey.set(
      this.assets().find((asset) => assets.some((old) => old.id === asset.id && old.isCover))
        ?.key ?? null,
    );
    this.dirty.set(false);
  }

  /** Thêm từng tệp trong giới hạn; preview chỉ dùng Blob URL do editor sở hữu. */
  add(files: readonly File[]): void {
    this.error.set('');
    for (const file of files) {
      const invalid = mediaFileError(file);
      if (invalid) {
        this.error.set(invalid);
        continue;
      }
      const type = file.type.startsWith('image/') ? 'IMAGE' : 'VIDEO';
      if (
        this.assets().filter((asset) => asset.type === type).length >= (type === 'IMAGE' ? 5 : 1)
      ) {
        this.error.set('Mỗi bài tối đa 5 ảnh và 1 video. Bỏ tệp cũ trước khi chọn tệp thay thế.');
        continue;
      }
      const asset: DraftAsset = {
        key: ++this.sequence,
        id: null,
        type,
        file,
        temporary: true,
        url: this.browser ? URL.createObjectURL(file) : '',
        state: 'failed',
      };
      this.assets.update((assets) =>
        type === 'IMAGE'
          ? [
              ...assets.filter((entry) => entry.type === 'IMAGE'),
              asset,
              ...assets.filter((entry) => entry.type === 'VIDEO'),
            ]
          : [...assets, asset],
      );
      if (type === 'IMAGE' && this.coverKey() === null) this.coverKey.set(asset.key);
      this.dirty.set(true);
      this.retry(asset.key);
    }
  }

  /** Retry tường minh chỉ cho file chưa có ID; không phát lại upload thành công. */
  retry(key: number): void {
    const asset = this.assets().find((entry) => entry.key === key);
    if (!asset?.file || asset.id || asset.state === 'uploading' || asset.invalidDuration) return;
    this.patch(key, { state: 'uploading' });
    const request = this.api.upload(asset.file).subscribe({
      next: (upload) => {
        if (upload.type !== asset.type) {
          this.cancel(upload.id);
          this.patch(key, { state: 'failed' });
          this.error.set('Nội dung thực của tệp không khớp loại đã chọn.');
          return;
        }
        this.patch(key, { id: upload.id, expiresAt: upload.expiresAt, state: 'ready' });
      },
      error: () => {
        this.patch(key, { state: 'failed' });
        this.error.set(
          'Upload thất bại hoặc video không hợp lệ (tối đa 180 giây). Có thể thử lại hoặc bỏ tệp.',
        );
      },
    });
    this.requests.set(key, request);
  }

  /** Từ chối sớm video quá dài khi browser đọc được metadata; server vẫn xác minh độc lập. */
  validateDuration(key: number, duration: number): void {
    const asset = this.assets().find((entry) => entry.key === key);
    if (
      !asset ||
      asset.type !== 'VIDEO' ||
      !asset.temporary ||
      (duration <= 180 && duration > 0 && Number.isFinite(duration))
    )
      return;
    this.requests.get(key)?.unsubscribe();
    this.requests.delete(key);
    if (asset.id) this.cancel(asset.id);
    this.patch(key, { id: null, state: 'failed', invalidDuration: true });
    this.error.set(
      'Video phải có thời lượng hợp lệ và tối đa 180 giây. Bỏ tệp và chọn video khác.',
    );
  }

  /** Bỏ khỏi bản nháp; media đã lưu chỉ detach khi Listing được lưu thành công. */
  remove(key: number): void {
    const asset = this.assets().find((entry) => entry.key === key);
    if (!asset) return;
    this.requests.get(key)?.unsubscribe();
    this.requests.delete(key);
    if (asset.temporary && asset.id) this.cancel(asset.id);
    if (asset.url) URL.revokeObjectURL(asset.url);
    this.assets.update((assets) => assets.filter((entry) => entry.key !== key));
    if (this.coverKey() === key)
      this.coverKey.set(this.assets().find((entry) => entry.type === 'IMAGE')?.key ?? null);
    this.dirty.set(true);
  }

  /** Đổi vị trí ảnh, độc lập với ảnh đại diện. */
  move(key: number, offset: number): void {
    const assets = [...this.assets()];
    const index = assets.findIndex((entry) => entry.key === key);
    const target = index + offset;
    if (
      index < 0 ||
      assets[index].type !== 'IMAGE' ||
      target < 0 ||
      target >= assets.length ||
      assets[target].type !== 'IMAGE'
    )
      return;
    [assets[index], assets[target]] = [assets[target], assets[index]];
    this.assets.set(assets);
    this.dirty.set(true);
  }

  /** Chọn cover từ ảnh hiện có, không cho video làm ảnh đại diện. */
  cover(key: number): void {
    if (!this.assets().some((entry) => entry.key === key && entry.type === 'IMAGE')) return;
    this.coverKey.set(key);
    this.dirty.set(true);
  }

  /** Không đưa file lỗi, đang upload hoặc TEMP hết hạn vào payload. */
  manifest() {
    const assets = this.assets();
    const images = assets.filter((entry) => entry.type === 'IMAGE');
    const cover = images.find((entry) => entry.key === this.coverKey());
    if (
      !images.length ||
      !cover?.id ||
      assets.some(
        (entry) =>
          !entry.id ||
          entry.state !== 'ready' ||
          (entry.expiresAt && Date.parse(entry.expiresAt) <= Date.now()),
      )
    )
      return null;
    return {
      imageIds: images.map((entry) => entry.id!),
      coverImageId: cover.id,
      videoId: assets.find((entry) => entry.type === 'VIDEO')?.id ?? null,
    };
  }

  /** Sau commit, thu hồi quyền hủy TEMP trước khi rời editor. */
  committed(): void {
    this.assets.update((assets) => assets.map((entry) => ({ ...entry, temporary: false })));
    this.dirty.set(false);
  }

  /** Thu hồi preview và hủy TEMP còn biết ID; upload mất response được TTL server dọn. */
  dispose(): void {
    for (const request of this.requests.values()) request.unsubscribe();
    this.requests.clear();
    for (const asset of this.assets()) {
      if (asset.temporary && asset.id) this.cancel(asset.id);
      if (asset.url) URL.revokeObjectURL(asset.url);
    }
    this.assets.set([]);
    this.coverKey.set(null);
    this.dirty.set(false);
  }

  /** Giải phóng tài nguyên khi editor bị hủy. */
  ngOnDestroy(): void {
    this.dispose();
  }

  /** Cập nhật entry theo key để response upload không ghi vào entry khác. */
  private patch(key: number, change: Partial<DraftAsset>): void {
    this.assets.update((assets) =>
      assets.map((entry) => (entry.key === key ? { ...entry, ...change } : entry)),
    );
  }

  /** Cleanup best effort; server TTL vẫn bảo đảm dọn TEMP khi phiên/kết nối đã mất. */
  private cancel(id: string): void {
    this.api
      .cancel(id)
      .subscribe({
        error: () => this.error.set('Chưa hủy được tệp tạm; hệ thống sẽ dọn theo thời hạn.'),
      });
  }
}
