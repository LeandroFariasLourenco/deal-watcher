import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { MatIconModule } from '@angular/material/icon';
import { WaitlistService } from '../../services/waitlist';
import { OwnedGamesService } from '../../services/owned-games';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { SearchStateService } from '../../services/search-state';
import { ItadApiService } from '../../services/itad-api';
import { ImgShimmerDirective } from '../../shared/img-shimmer';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    InputTextModule, 
    ButtonModule, 
    SkeletonModule, 
    RouterLink,
    MatIconModule,
    ToastModule,
    ImgShimmerDirective
  ],
  providers: [MessageService],
  templateUrl: './search.html',
  styleUrl: './search.css'
})
export class Search implements OnInit {
  private itadApi = inject(ItadApiService);
  public waitlist = inject(WaitlistService);
  readonly owned = inject(OwnedGamesService);
  private messageService = inject(MessageService);
  private searchState = inject(SearchStateService);

  searchControl = new FormControl('', { nonNullable: true });
  results = signal<any[]>([]);
  loading = signal(false);
  /** Query that was actually submitted. Typing alone does not set this. */
  submittedQuery = signal('');
  /** Bumped on each search or clear so a late response cannot restore results. */
  private searchSeq = 0;

  ngOnInit() {
    if (this.searchState.hasSearched()) {
      this.searchControl.setValue(this.searchState.query());
      this.results.set(this.searchState.results());
      this.submittedQuery.set(this.searchState.query());
    }
  }

  /** Visible while the field has text or a search is still on screen. */
  showClearButton(): boolean {
    return !!this.searchControl.value || !!this.submittedQuery() || this.results().length > 0 || this.loading();
  }

  /**
   * Right-slot submit icon. Shown on an empty bar, and while the typed query
   * is not the one already on screen. Once that query is active, the slot
   * switches to the clear icon.
   */
  showSubmitButton(): boolean {
    const value = this.searchControl.value.trim();
    if (!value) {
      return !this.submittedQuery() && this.results().length === 0 && !this.loading();
    }
    return value !== this.submittedQuery().trim();
  }

  onSearch() {
    const query = this.searchControl.value;
    if (!query) return;
    const seq = ++this.searchSeq;
    this.submittedQuery.set(query);
    this.loading.set(true);
    this.itadApi.searchGames(query).subscribe({
      next: (data) => {
        if (seq !== this.searchSeq) return;
        const list = Array.isArray(data) ? data : [];
        this.results.set(list);
        this.searchState.saveState(query, list);
        this.loading.set(false);
      },
      error: () => {
        if (seq !== this.searchSeq) return;
        this.loading.set(false);
      }
    });
  }

  clearSearch() {
    this.searchSeq++;
    this.searchControl.setValue('');
    this.results.set([]);
    this.submittedQuery.set('');
    this.loading.set(false);
    this.searchState.clear();
  }

  async addToWatchlist(game: any, event: Event) {
    event.stopPropagation();
    try {
      await this.waitlist.toggle(game.id);
    } catch {
      this.messageService.add({ severity: 'error', summary: 'Erro', detail: 'Falha ao atualizar a waitlist' });
    }
  }
}
