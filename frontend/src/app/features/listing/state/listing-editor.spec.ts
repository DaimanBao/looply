import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { SessionService } from '../../../core/auth/session.service';
import { UserApi } from '../../user/public-api';
import { MediaDraft } from '../../media/public-api';
import { MediaUploadApi } from '../../media/data-access/media-upload.api';
import { ListingApi } from '../data-access/listing.api';
import { ListingManagementApi } from '../data-access/listing-management.api';
import { ListingEditor } from './listing-editor';
import { listingFixture } from '../testing/listing.fixture';
import type { ListingDetail } from '../models/listing.models';

describe('Listing editor orchestration', () => {
  let editor: ListingEditor;
  let detail: ListingDetail;
  let generation: number;
  const create = vi.fn();
  const update = vi.fn();
  const visibility = vi.fn();
  const remove = vi.fn();

  beforeEach(() => {
    detail = listingFixture();
    generation = 1;
    for (const mock of [create, update, visibility, remove]) mock.mockReset();
    TestBed.configureTestingModule({
      providers: [
        ListingEditor,
        MediaDraft,
        {
          provide: SessionService,
          useValue: { token: signal('token'), identityVersion: () => generation },
        },
        {
          provide: UserApi,
          useValue: {
            me: async () => ({ ...detail.owner, phone: null }),
            provinces: async () => [detail.province],
          },
        },
        { provide: ListingApi, useValue: { detail: () => of(detail) } },
        { provide: MediaUploadApi, useValue: { cancel: () => of(undefined) } },
        { provide: ListingManagementApi, useValue: { create, update, visibility, remove } },
      ],
    });
    editor = TestBed.inject(ListingEditor);
  });

  it('requires valid form and full uploaded manifest before creating', async () => {
    await editor.load(null);
    expect(await editor.save(false)).toBe(false);
    expect(create).not.toHaveBeenCalled();
    editor.form.patchValue({
      title: detail.title,
      description: detail.description,
      type: 'EXCHANGE',
      price: '100',
    });
    editor.media.initialize(detail.media);
    create.mockReturnValue(of(listingFixture({ type: 'EXCHANGE', price: null })));
    expect(await editor.save(false)).toBe(true);
    expect(create.mock.calls[0][0]).toMatchObject({
      type: 'EXCHANGE',
      price: null,
      rentalUnit: null,
      media: { imageIds: [detail.cover.id] },
    });
  });

  it('locks type after Conversation and requires confirmation; accepted hidden must reopen', async () => {
    detail = listingFixture({ hasConversations: true });
    await editor.load(detail.id);
    expect(editor.form.controls.type.disabled).toBe(true);
    expect(await editor.save(false)).toBe(false);
    update.mockReturnValue(of(detail));
    expect(await editor.save(true)).toBe(true);
    expect(update.mock.calls[0].slice(2)).toEqual([1, true]);
    detail = listingFixture({ status: 'HIDDEN', hasAcceptedProposal: true });
    await editor.load(detail.id);
    expect(await editor.save(true)).toBe(false);
    visibility.mockReturnValue(of(listingFixture({ version: 2 })));
    expect(await editor.visibility(false)).toBe(false);
    expect(await editor.visibility(true)).toBe(true);
    expect(visibility).toHaveBeenCalledWith(detail.id, 1, 'ACTIVE', true);
  });

  it('blocks duplicate submit and stale-version retry without replacing user draft', async () => {
    await editor.load(detail.id);
    const pending = new Subject<ListingDetail>();
    update.mockReturnValue(pending);
    const saving = editor.save(true);
    expect(await editor.save(true)).toBe(false);
    expect(await editor.visibility(true)).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    pending.error(
      new HttpErrorResponse({
        status: 409,
        error: { error: { code: 'LISTING_VERSION_CONFLICT' } },
      }),
    );
    expect(await saving).toBe(false);
    expect(editor.blocked()).toBe(true);
    expect(editor.form.controls.title.value).toBe(detail.title);
    expect(await editor.save(true)).toBe(false);
  });

  it('requires explicit delete and uses the updated version after visibility', async () => {
    await editor.load(detail.id);
    visibility.mockReturnValue(of(listingFixture({ status: 'HIDDEN', version: 2 })));
    await editor.visibility(true);
    expect(await editor.remove(false)).toBe(false);
    remove.mockReturnValue(of(undefined));
    expect(await editor.remove(true)).toBe(true);
    expect(remove).toHaveBeenCalledWith(detail.id, 2);
  });

  it('does not adopt mutation response after identity changes or allow retry of uncertain create', async () => {
    await editor.load(detail.id);
    const pending = new Subject<ListingDetail>();
    update.mockReturnValue(pending);
    const saving = editor.save(true);
    generation++;
    editor.clear();
    pending.next(detail);
    expect(await saving).toBe(false);
    expect(editor.listing()).toBeNull();
    await editor.load(null);
    editor.form.patchValue({
      title: detail.title,
      description: detail.description,
      type: 'RENT',
      price: '100',
      rentalUnit: 'MONTH',
    });
    editor.media.initialize(detail.media);
    create.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    expect(await editor.save(false)).toBe(false);
    expect(editor.blocked()).toBe(true);
    expect(await editor.save(false)).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('denies management of another owner even when detail is publicly readable', async () => {
    // /users/me được lấy riêng, không suy ra quyền từ detail của người khác.
    vi.spyOn(TestBed.inject(UserApi), 'me').mockResolvedValue({
      ...detail.owner,
      id: 'different',
      username: 'other',
      phone: null,
      email: null,
      phoneVerifiedAt: null,
      emailVerifiedAt: null,
      status: 'ACTIVE',
      deletionRequestedAt: null,
      usernameChangedAt: null,
    });
    await editor.load(detail.id);
    expect(editor.ready()).toBe(false);
    expect(editor.listing()).toBeNull();
    expect(await editor.save(true)).toBe(false);
  });
});
