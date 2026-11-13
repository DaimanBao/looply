import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { decodeUpload, MediaUploadApi } from './media-upload.api';

describe('Media upload HTTP boundary', () => {
  it('sends raw bytes and cancels by UUID without multipart or storage URL', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const api = TestBed.inject(MediaUploadApi);
    const http = TestBed.inject(HttpTestingController);
    const file = new File(['bytes'], 'test.png', { type: 'image/png' });
    let id = '';
    api.upload(file).subscribe((upload) => (id = upload.id));
    const request = http.expectOne('/api/media/listing-uploads');
    expect(request.request.body).toBe(file);
    expect(request.request.headers.get('Content-Type')).toBe('application/octet-stream');
    request.flush({
      id: '00000000-0000-4000-8000-000000000001',
      status: 'TEMP',
      type: 'IMAGE',
      mimeType: 'image/webp',
      durationSeconds: null,
      sizeBytes: '100',
      expiresAt: new Date().toISOString(),
    });
    api.cancel(id).subscribe();
    const cancel = http.expectOne(`/api/media/listing-uploads/${id}`);
    expect(cancel.request.method).toBe('DELETE');
    cancel.flush(null);
    http.verify();
  });

  it('rejects unready, malformed or invalid-duration video metadata', () => {
    const value = {
      id: '00000000-0000-4000-8000-000000000001',
      status: 'TEMP',
      type: 'VIDEO',
      mimeType: 'video/mp4',
      durationSeconds: 180,
      sizeBytes: '100',
      expiresAt: new Date().toISOString(),
    };
    expect(decodeUpload(value).type).toBe('VIDEO');
    for (const patch of [
      { status: 'ATTACHED' },
      { durationSeconds: 181 },
      { expiresAt: 'invalid' },
      { id: 'other' },
      { sizeBytes: 100 },
    ])
      expect(() => decodeUpload({ ...value, ...patch })).toThrow();
  });
});
