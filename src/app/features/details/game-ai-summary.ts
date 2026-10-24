import { Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { GameSummaryService } from '../../services/game-summary';
import { GameSummaryPayload } from '../../../types/game-summary';

export type GameAiSummaryPhase = 'idle' | 'gathering' | 'loading' | 'typing' | 'done' | 'error';

@Component({
  selector: 'app-game-ai-summary',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './game-ai-summary.html',
  styleUrl: './game-ai-summary.css',
})
export class GameAiSummary {
  readonly gameId = input<string | null>(null);
  readonly ready = input(false);
  readonly payload = input.required<GameSummaryPayload>();
  readonly activate = output<void>();

  private readonly summaries = inject(GameSummaryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly phase = signal<GameAiSummaryPhase>('idle');
  readonly displayed = signal('');
  readonly error = signal<string | null>(null);
  readonly requested = signal(false);
  readonly attempt = signal(0);
  readonly cacheChecked = signal(false);

  private boundId: string | null = null;
  private lastAttempt = 0;
  private targetText = '';
  private abort: AbortController | null = null;
  private typingFrame = 0;
  private finishTyping = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.stop());
    effect(() => {
      const gameId = this.gameId();
      const ready = this.ready();
      const requested = this.requested();
      const attempt = this.attempt();
      untracked(() => this.sync(gameId, ready, requested, attempt));
    });
  }

  get showCaret(): boolean {
    return this.phase() === 'typing' || this.phase() === 'loading';
  }

  generate() {
    const phase = this.phase();
    if (phase === 'loading' || phase === 'typing') return;
    if (phase === 'done' && this.displayed()) return;

    this.error.set(null);
    this.requested.set(true);
    this.attempt.update(value => value + 1);
    this.activate.emit();
  }

  private sync(gameId: string | null, ready: boolean, requested: boolean, attempt: number) {
    if (this.boundId !== gameId) {
      this.resetFor(gameId);
      this.lastAttempt = attempt;
      return;
    }

    if (!requested) return;

    if (this.phase() === 'loading' || this.phase() === 'typing' || this.phase() === 'done') return;

    if (!ready) {
      this.phase.set('gathering');
      return;
    }

    if (attempt === this.lastAttempt) return;
    this.lastAttempt = attempt;
    void this.runSummary();
  }

  private resetFor(gameId: string | null) {
    this.stop();
    this.boundId = gameId;
    this.requested.set(false);
    this.error.set(null);
    const cached = this.summaries.peek(gameId);
    if (cached) {
      this.showCached(cached);
      return;
    }
    this.cacheChecked.set(false);
    this.targetText = '';
    this.displayed.set('');
    this.phase.set('idle');
    if (gameId) void this.hydrateFromCache(gameId);
    else this.cacheChecked.set(true);
  }

  private async hydrateFromCache(gameId: string) {
    const cached = await this.summaries.read(gameId);
    if (this.boundId !== gameId) return;
    if (cached) {
      this.showCached(cached);
      return;
    }
    this.cacheChecked.set(true);
  }

  private showCached(text: string) {
    this.targetText = text;
    this.displayed.set(text);
    this.phase.set('done');
    this.cacheChecked.set(true);
  }

  private async runSummary() {
    const gameId = this.gameId();
    if (!gameId) return;

    const cached = await this.summaries.read(gameId);
    if (this.boundId !== gameId) return;
    if (cached) {
      this.showCached(cached);
      return;
    }

    this.stop();
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.finishTyping = false;
    this.phase.set('loading');
    this.displayed.set('');
    this.targetText = '';
    this.error.set(null);

    try {
      const text = await this.summaries.summarize(
        this.payload(),
        chunk => {
          if (signal.aborted) return;
          this.targetText = chunk;
          if (this.phase() === 'loading') this.phase.set('typing');
          this.pump();
        },
        signal
      );

      if (signal.aborted) return;
      if (!text.trim()) throw new Error('O resumo veio vazio.');

      this.summaries.remember(gameId, text);
      this.targetText = text;
      if (!text.startsWith(this.displayed())) this.displayed.set('');
      this.phase.set('typing');
      this.pump(true);
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      this.phase.set('error');
      this.error.set(this.readErrorMessage(error));
    }
  }

  private pump(finish = false) {
    if (finish) this.finishTyping = true;
    if (this.typingFrame) return;

    const tick = () => {
      const target = this.targetText;
      const current = this.displayed();
      if (current.length < target.length) {
        const remain = target.length - current.length;
        const step = remain > 120 ? 10 : remain > 40 ? 4 : remain > 12 ? 2 : 1;
        this.displayed.set(target.slice(0, current.length + step));
        this.typingFrame = requestAnimationFrame(tick);
        return;
      }

      this.typingFrame = 0;
      if (this.finishTyping && target) this.phase.set('done');
    };

    this.typingFrame = requestAnimationFrame(tick);
  }

  private stop() {
    this.abort?.abort();
    this.abort = null;
    this.finishTyping = false;
    if (this.typingFrame) {
      cancelAnimationFrame(this.typingFrame);
      this.typingFrame = 0;
    }
  }

  private readErrorMessage(error: unknown): string {
    if (error instanceof TypeError) return 'Não foi possível conectar ao serviço de resumo.';
    if (error instanceof Error && error.message) return error.message;
    return 'Não foi possível gerar o resumo.';
  }
}
