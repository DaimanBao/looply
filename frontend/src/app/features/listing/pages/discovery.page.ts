import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, timer } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { apiError } from '../../../core/http/api-error';
import type { Province } from '../../../core/http/api.models';
import { UserApi } from '../../user/public-api';
import { ListingApi } from '../data-access/listing.api';
import { InfiniteScroll } from '../components/infinite-scroll';
import { ListingCard } from '../components/listing-card';
import { discoveryQuery, type DiscoveryFilters } from '../models/discovery-query';
import type { ListingSuggestion } from '../models/listing.models';
import { DiscoveryStore } from '../state/discovery.store';

@Component({
  imports: [ReactiveFormsModule, RouterLink, ListingCard, InfiniteScroll],
  providers: [DiscoveryStore],
  templateUrl: './discovery.page.html',
  styleUrl: './discovery.page.scss',
})
export class DiscoveryPage {
  private readonly api = inject(ListingApi);
  private readonly users = inject(UserApi);
  private readonly session = inject(SessionService);
  readonly store = inject(DiscoveryStore);
  readonly tab = signal<DiscoveryFilters['tab']>('national');
  readonly provinces = signal<Province[]>([]);
  readonly provinceError = signal('');
  readonly provinceLoading = signal(false);
  readonly validation = signal('');
  readonly suggestions = signal<ListingSuggestion[]>([]);
  readonly suggestionError = signal('');
  readonly suggesting = signal(false);
  readonly waiting = signal(true);
  readonly form = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    type: new FormControl<DiscoveryFilters['type']>('', { nonNullable: true }),
    rentalUnit: new FormControl<DiscoveryFilters['rentalUnit']>('', { nonNullable: true }),
    provinceCode: new FormControl('', { nonNullable: true }),
    minPrice: new FormControl('', { nonNullable: true }),
    maxPrice: new FormControl('', { nonNullable: true }),
    postedWithin: new FormControl<DiscoveryFilters['postedWithin']>('ALL', { nonNullable: true }),
    sort: new FormControl<DiscoveryFilters['sort']>('RANDOM', { nonNullable: true }),
  });
  readonly values = signal(this.form.getRawValue());
  readonly comparablePrice = computed(
    () =>
      this.values().type === 'SALE' ||
      (this.values().type === 'RENT' && !!this.values().rentalUnit),
  );
  private suggestionRequest?: Subscription;
  private queryTimer?: Subscription;
  private catalogRevision = 0;

  /** Resets stale data immediately and coalesces input changes; identity changes invalidate viewer-bound cursors. */
  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.filtersChanged());
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      this.queryTimer?.unsubscribe();
      this.suggestionRequest?.unsubscribe();
      this.catalogRevision++;
    });
    let identity = -1;
    effect(() => {
      this.session.token();
      const next = this.session.identityVersion();
      if (next === identity) return;
      identity = next;
      untracked(() => this.refresh());
    });
    void this.loadProvinces();
  }
  /** Loads the shared server catalog; failure does not prevent National discovery. */
  async loadProvinces(): Promise<void> {
    const revision = ++this.catalogRevision;
    this.provinceLoading.set(true);
    this.provinceError.set('');
    try {
      const provinces = await this.users.provinces();
      if (revision === this.catalogRevision) this.provinces.set(provinces);
    } catch (error) {
      if (revision === this.catalogRevision) this.provinceError.set(apiError(error));
    } finally {
      if (revision === this.catalogRevision) this.provinceLoading.set(false);
    }
  }
  /** Starts each tab with its own default order and no previous continuation. */
  selectTab(tab: DiscoveryFilters['tab']): void {
    if (tab === this.tab()) return;
    this.tab.set(tab);
    this.form.controls.sort.setValue(
      tab === 'national' && !this.form.controls.q.value.trim() ? 'RANDOM' : 'NEWEST',
      { emitEvent: false },
    );
    this.filtersChanged();
  }
  /** Clears monetary fields when the chosen type/unit makes comparison invalid. */
  private filtersChanged(): void {
    const values = this.form.getRawValue();
    if (values.sort === 'RANDOM' && values.q.trim())
      this.form.controls.sort.setValue('NEWEST', { emitEvent: false });
    if (values.type !== 'RENT') this.form.controls.rentalUnit.setValue('', { emitEvent: false });
    if (values.type !== 'SALE' && !(values.type === 'RENT' && values.rentalUnit)) {
      this.form.patchValue(
        {
          minPrice: '',
          maxPrice: '',
          ...(values.sort.startsWith('PRICE_') ? { sort: 'NEWEST' as const } : {}),
        },
        { emitEvent: false },
      );
    }
    this.values.set(this.form.getRawValue());
    this.refresh();
  }
  /** Invalidates in-flight list/suggestion responses before the 300 ms debounce begins. */
  private refresh(): void {
    this.queryTimer?.unsubscribe();
    this.suggestionRequest?.unsubscribe();
    this.suggestions.set([]);
    this.suggestionError.set('');
    this.suggesting.set(false);
    this.store.reset(null);
    const filters = { ...this.form.getRawValue(), tab: this.tab() };
    const result = discoveryQuery(filters);
    this.validation.set(result.error);
    this.waiting.set(result.query !== null);
    // Title suggestions are independent of province and price constraints.
    const validTitle = !filters.q.includes('\u0000') && [...filters.q].length <= 150;
    this.queryTimer = timer(300).subscribe(() => {
      this.waiting.set(false);
      this.store.reset(result.query);
      if (validTitle && filters.q.trim()) {
        this.suggesting.set(true);
        this.suggestionRequest = this.api.suggestions(filters.q).subscribe({
          next: (suggestions) => {
            this.suggestions.set(suggestions);
            this.suggesting.set(false);
          },
          error: (error: unknown) => {
            this.suggestionError.set(apiError(error));
            this.suggesting.set(false);
          },
        });
      }
    });
  }
}
