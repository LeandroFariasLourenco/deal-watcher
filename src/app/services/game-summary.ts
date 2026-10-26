import { Injectable } from '@angular/core';
import { SteamAppReview, SteamNewsItem, SteamReviewSummary } from '../../services/steam';
import { cache, CACHE_TTL, COLLECTIONS } from '../../services/cache';
import { GAME_SUMMARY_SUMMARIZE_URL } from '../../services/game-summary-endpoints';
import { ITADGamePrices, ITADGameSub, ITADMoney } from '../../types/itad';
import {
  GameSummaryPayload,
  GameSummaryPrice,
  GameSummaryPriceEntry,
} from '../../types/game-summary';

@Injectable({
  providedIn: 'root',
})
export class GameSummaryService {
  private readonly memory = new Map<string, string>();

  peek(gameId: string | null | undefined): string | null {
    if (!gameId) return null;
    return this.memory.get(gameId) ?? null;
  }

  async read(gameId: string | null | undefined): Promise<string | null> {
    if (!gameId) return null;
    const fresh = this.memory.get(gameId);
    if (fresh) return fresh;
    const stored = await cache.get<string>(COLLECTIONS.GAME_SUMMARY, gameId);
    if (!stored) return null;
    this.memory.set(gameId, stored);
    return stored;
  }

  remember(gameId: string, text: string) {
    if (!gameId || !text) return;
    this.memory.set(gameId, text);
    void cache.set(COLLECTIONS.GAME_SUMMARY, gameId, text, CACHE_TTL.GAME_SUMMARY);
  }

  buildPayload(input: {
    info: any;
    pricePack: ITADGamePrices | null;
    subscriptions: ITADGameSub[];
    news: SteamNewsItem[];
    reviewSummary: SteamReviewSummary | null;
    reviews: SteamAppReview[];
  }): GameSummaryPayload {
    const info = input.info || {};
    const players = info.players || {};
    const newsitems = (input.news || []).map(item => ({
      title: item.title || '',
      date: Number(item.date) || 0,
    }));
    const summary = input.reviewSummary;

    return {
      info: {
        title: String(info.title || ''),
        releaseDate: String(info.releaseDate || ''),
        tags: Array.isArray(info.tags) ? info.tags.filter((tag: unknown) => typeof tag === 'string') : [],
        reviews: Array.isArray(info.reviews)
          ? info.reviews.map((review: any) => ({
              score: Number(review?.score) || 0,
              source: String(review?.source || ''),
              count: Number(review?.count) || 0,
            }))
          : [],
        players: {
          recent: Number(players.recent) || 0,
          day: Number(players.day) || 0,
          week: Number(players.week) || 0,
          peak: Number(players.peak) || 0,
        },
      },
      prices: this.mapPriceEntries(input.pricePack),
      subscriptions: [
        {
          subs: (input.subscriptions || []).map(sub => ({
            name: sub.name,
            leaving: sub.leaving ?? null,
          })),
        },
      ],
      news: {
        appnews: {
          count: newsitems.length,
          newsitems,
        },
      },
      reviews: {
        response: {
          query_summary: {
            review_score_desc: summary?.review_score_desc || '',
            total_positive: Number(summary?.total_positive) || 0,
            total_negative: Number(summary?.total_negative) || 0,
            total_reviews: Number(summary?.total_reviews) || 0,
          },
          reviews: (input.reviews || []).map(review => ({
            review: review.review || '',
            voted_up: !!review.voted_up,
            author: {
              playtime_forever: Number(review.author?.playtime_forever) || 0,
            },
          })),
        },
      },
    };
  }

  async summarize(
    payload: GameSummaryPayload,
    onUpdate: (text: string) => void,
    signal: AbortSignal
  ): Promise<string> {
    const response = await fetch(GAME_SUMMARY_SUMMARIZE_URL, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream, application/json, text/plain;q=0.9',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(readErrorMessage(response.status, details));
    }

    const raw = await readSummaryResponse(response, onUpdate, signal);
    return finalizeSummary(raw);
  }

  private mapPriceEntries(pack: ITADGamePrices | null): GameSummaryPriceEntry[] {
    if (!pack) return [];
    const currency = pack.deals?.[0]?.price?.currency || pack.historyLow?.all?.currency || 'BRL';
    return [
      {
        historyLow: {
          all: asPrice(pack.historyLow?.all, currency),
          y1: asPrice(pack.historyLow?.y1, currency),
          m3: asPrice(pack.historyLow?.m3, currency),
        },
        deals: (pack.deals || []).map(deal => ({
          shop: { name: deal.shop?.name || '' },
          price: asPrice(deal.price, currency),
          regular: asPrice(deal.regular, deal.price?.currency || currency),
          cut: Number(deal.cut) || 0,
          expiry: deal.expiry ?? null,
        })),
      },
    ];
  }
}

function asPrice(value: ITADMoney | null | undefined, fallbackCurrency: string): GameSummaryPrice {
  return {
    amount: Number(value?.amount) || 0,
    amountInt: Number(value?.amountInt) || Math.round((Number(value?.amount) || 0) * 100),
    currency: value?.currency || fallbackCurrency,
  };
}

function readErrorMessage(status: number, details: string): string {
  const parsed = tryParseJson(details);
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
  }
  const fromJson = parsed ? pickSummaryText(parsed) : '';
  if (fromJson) return fromJson;
  if (details.trim()) return details.trim().slice(0, 280);
  return `Falha ao gerar o resumo (${status})`;
}

async function readSummaryResponse(
  response: Response,
  onUpdate: (text: string) => void,
  signal: AbortSignal
): Promise<string> {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const streaming = isStreamingContentType(contentType);

  if (!streaming && contentType.includes('application/json')) {
    const data = await response.json();
    const text = pickSummaryText(data);
    if (text) onUpdate(text);
    return text;
  }

  if (!response.body) {
    const text = finalizeSummary(await response.text());
    if (text) onUpdate(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    buffer += decoder.decode(value, { stream: true });
    const consumed = consumeStreamBuffer(buffer, contentType);
    buffer = consumed.rest;
    if (consumed.text) {
      accumulated = applyChunk(accumulated, consumed.text);
      onUpdate(visibleSummary(accumulated));
    }
  }

  buffer += decoder.decode();
  const tail = consumeStreamBuffer(buffer, contentType, true);
  if (tail.text) {
    accumulated = applyChunk(accumulated, tail.text);
    onUpdate(visibleSummary(accumulated));
  }

  if (!accumulated.trim() && buffer.trim()) {
    accumulated = finalizeSummary(buffer);
    if (accumulated) onUpdate(accumulated);
  }

  return accumulated;
}

function isStreamingContentType(contentType: string): boolean {
  return (
    contentType.includes('text/event-stream') ||
    contentType.includes('ndjson') ||
    contentType.includes('jsonl') ||
    contentType.includes('octet-stream') ||
    contentType.includes('text/plain')
  );
}

function consumeStreamBuffer(buffer: string, contentType: string, flush = false): { text: string; rest: string } {
  if (contentType.includes('text/event-stream') || buffer.includes('data:')) {
    const lines = buffer.split(/\r?\n/);
    const rest = flush ? '' : lines.pop() ?? '';
    let text = '';
    for (const line of lines) {
      const payload = readSseLine(line);
      if (payload) text = applyChunk(text, payload);
    }
    return { text, rest };
  }

  if (contentType.includes('ndjson') || contentType.includes('jsonl')) {
    const lines = buffer.split(/\r?\n/);
    const rest = flush ? '' : lines.pop() ?? '';
    let text = '';
    for (const line of lines) {
      const payload = pickSummaryText(tryParseJson(line) ?? line);
      if (payload) text = applyChunk(text, payload);
    }
    return { text, rest };
  }

  return { text: buffer, rest: '' };
}

function readSseLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return '';
  const data = trimmed.slice(5).trim();
  if (!data || data === '[DONE]') return '';
  return pickSummaryText(tryParseJson(data) ?? data);
}

function applyChunk(current: string, incoming: string): string {
  if (!incoming) return current;
  if (!current) return incoming;
  if (incoming.startsWith(current)) return incoming;
  if (current.endsWith(incoming)) return current;
  return current + incoming;
}

function visibleSummary(raw: string): string {
  const parsed = tryParseJson(raw);
  if (!parsed) return raw;
  return pickSummaryText(parsed) || raw;
}

function finalizeSummary(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const parsed = tryParseJson(trimmed);
  if (parsed) return pickSummaryText(parsed) || trimmed;
  return pickSummaryText(trimmed);
}

function pickSummaryText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(pickSummaryText).filter(Boolean).join('');
  if (typeof value !== 'object') return String(value);

  const record = value as Record<string, unknown>;
  const directKeys = ['summary', 'text', 'content', 'result', 'message', 'output', 'response', 'delta', 'token'];
  for (const key of directKeys) {
    const piece = record[key];
    if (typeof piece === 'string' && piece.trim()) return piece;
    if (piece && typeof piece === 'object') {
      const nested = pickSummaryText(piece);
      if (nested) return nested;
    }
  }

  const choice = Array.isArray(record.choices) ? record.choices[0] : record.choice;
  if (choice) return pickSummaryText(choice);

  return '';
}

function tryParseJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[' && trimmed[0] !== '"')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
