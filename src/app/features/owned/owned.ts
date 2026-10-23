import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { SkeletonModule } from 'primeng/skeleton';
import { OwnedGamesService } from '../../services/owned-games';
import { ItadAuthService } from '../../services/itad-auth';
import { ImgShimmerDirective } from '../../shared/img-shimmer';
import { ITADIgnoredGame } from '../../../types/itad';

@Component({
  selector: 'app-owned',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, SkeletonModule, ImgShimmerDirective],
  templateUrl: './owned.html',
  styleUrl: './owned.css'
})
export class Owned {
  readonly owned = inject(OwnedGamesService);
  readonly auth = inject(ItadAuthService);

  readonly games = this.owned.games;
  readonly loading = computed(() => this.owned.loading() || !this.owned.hydrated());
  readonly skeletonSlots = Array.from({ length: 18 }, (_, i) => i);

  reconnect() {
    void this.auth.login('/owned');
  }

  banner(game: ITADIgnoredGame): string | null {
    return game.assets?.banner145 || game.assets?.banner300 || game.assets?.banner400 || game.assets?.boxart || null;
  }
}
