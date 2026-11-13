import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { vi } from 'vitest';
import { MediaDraft, mediaFileError } from './media-draft';
import { MediaUploadApi, type MediaUpload } from '../data-access/media-upload.api';

describe('Media editor lifecycle', () => {
  let draft: MediaDraft;
  let uploads: Subject<MediaUpload>[];
  const cancel = vi.fn(() => of(undefined));

  beforeEach(() => {
    uploads = [];
    cancel.mockClear();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static override createObjectURL = vi.fn(() => 'blob:preview');
        static override revokeObjectURL = vi.fn();
      },
    );
    TestBed.configureTestingModule({
      providers: [
        MediaDraft,
        {
          provide: MediaUploadApi,
          useValue: {
            upload: () => {
              const request = new Subject<MediaUpload>();
              uploads.push(request);
              return request;
            },
            cancel,
          },
        },
      ],
    });
    draft = TestBed.inject(MediaDraft);
  });
  afterEach(() => {
    draft.dispose();
    vi.unstubAllGlobals();
  });

  /** Tạo metadata TEMP còn hạn mà không cần byte media giả làm bằng chứng tích hợp. */
  function uploaded(id: string, type: 'IMAGE' | 'VIDEO' = 'IMAGE'): MediaUpload {
    return { id, type, expiresAt: new Date(Date.now() + 60000).toISOString() };
  }

  it('rejects invalid files and enforces 5 images plus 1 video', () => {
    expect(mediaFileError(new File(['x'], 'x.gif', { type: 'image/gif' }))).not.toBe('');
    expect(mediaFileError(new File([], 'x.png', { type: 'image/png' }))).not.toBe('');
    const oversized = new File(['x'], 'x.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 });
    expect(mediaFileError(oversized)).not.toBe('');
    draft.add(Array.from({ length: 6 }, () => new File(['x'], 'x.png', { type: 'image/png' })));
    draft.add([
      new File(['x'], 'x.mp4', { type: 'video/mp4' }),
      new File(['x'], 'y.webm', { type: 'video/webm' }),
    ]);
    expect(draft.assets()).toHaveLength(6);
    expect(uploads).toHaveLength(6);
    expect(draft.manifest()).toBeNull();
  });

  it('keeps attached files on cancel, saves order independently of cover and falls back after removal', () => {
    draft.initialize([
      { id: 'one', type: 'IMAGE', isCover: true },
      { id: 'two', type: 'IMAGE', isCover: false },
    ]);
    const [one, two] = draft.assets();
    draft.move(two.key, -1);
    expect(draft.manifest()).toEqual({
      imageIds: ['two', 'one'],
      coverImageId: 'one',
      videoId: null,
    });
    draft.remove(one.key);
    expect(draft.manifest()?.coverImageId).toBe('two');
    draft.dispose();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('retries failed upload, excludes expired TEMP and cancels only uncommitted IDs', () => {
    draft.add([new File(['x'], 'x.png', { type: 'image/png' })]);
    const key = draft.assets()[0].key;
    uploads[0].error(new Error('network'));
    expect(draft.manifest()).toBeNull();
    draft.retry(key);
    uploads[1].next({ ...uploaded('temp'), expiresAt: new Date(0).toISOString() });
    expect(draft.manifest()).toBeNull();
    draft.remove(key);
    expect(cancel).toHaveBeenCalledWith('temp');
    draft.add([new File(['x'], 'y.png', { type: 'image/png' })]);
    uploads[2].next(uploaded('committed'));
    expect(draft.manifest()?.imageIds).toEqual(['committed']);
    draft.committed();
    draft.dispose();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels in-flight observers so late upload cannot contaminate another draft', () => {
    draft.add([new File(['x'], 'x.png', { type: 'image/png' })]);
    draft.dispose();
    draft.initialize([{ id: 'saved', type: 'IMAGE', isCover: true }]);
    uploads[0].next(uploaded('late'));
    expect(draft.manifest()?.imageIds).toEqual(['saved']);
  });

  it('rejects server media type mismatch and cancels returned TEMP', () => {
    draft.add([new File(['x'], 'x.png', { type: 'image/png' })]);
    uploads[0].next(uploaded('wrong', 'VIDEO'));
    expect(draft.assets()[0].state).toBe('failed');
    expect(draft.manifest()).toBeNull();
    expect(cancel).toHaveBeenCalledWith('wrong');
  });

  it('rejects overlong video metadata and prevents retrying the same invalid file', () => {
    draft.add([new File(['x'], 'x.mp4', { type: 'video/mp4' })]);
    const key = draft.assets()[0].key;
    draft.validateDuration(key, 180.1);
    uploads[0].next(uploaded('late', 'VIDEO'));
    draft.retry(key);
    expect(uploads).toHaveLength(1);
    expect(draft.assets()[0].state).toBe('failed');
    expect(draft.assets()[0].id).toBeNull();
  });

  it('inserts new images before video so reordering remains available', () => {
    draft.initialize([
      { id: 'one', type: 'IMAGE', isCover: true },
      { id: 'video', type: 'VIDEO', isCover: false },
    ]);
    draft.add([new File(['x'], 'new.png', { type: 'image/png' })]);
    uploads[0].next(uploaded('new'));
    const assets = draft.assets();
    expect(assets.map((entry) => entry.id)).toEqual(['one', 'new', 'video']);
    draft.move(assets[2].key, -1);
    expect(draft.assets().map((entry) => entry.id)).toEqual(['one', 'new', 'video']);
    draft.move(assets[1].key, -1);
    expect(draft.manifest()?.imageIds).toEqual(['new', 'one']);
    expect(draft.manifest()?.coverImageId).toBe('one');
  });
});
