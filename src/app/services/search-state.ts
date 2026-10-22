import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SearchStateService {
  query = signal<string>('');
  results = signal<any[]>([]);
  hasSearched = signal<boolean>(false);

  saveState(query: string, results: any[]) {
    this.query.set(query);
    this.results.set(results);
    this.hasSearched.set(true);
  }

  clear() {
    this.query.set('');
    this.results.set([]);
    this.hasSearched.set(false);
  }
}
