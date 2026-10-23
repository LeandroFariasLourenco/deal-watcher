import { Injectable, computed, inject, signal } from '@angular/core';
import { ITADService } from '../../services/itad';
import { ITAD_WEBHOOK_EVENTS, ITAD_WEBHOOK_URL } from '../../services/itad-endpoints';
import { ItadAuthService } from './itad-auth';

const WEBHOOK_ID_KEY = 'itad_webhook_id';

@Injectable({
  providedIn: 'root'
})
export class ItadWebhookService {
  private readonly auth = inject(ItadAuthService);
  private readonly itad = new ITADService();

  readonly webhookId = signal<string | null>(this.readId());
  readonly busy = signal(false);
  readonly enabled = computed(() => !!this.webhookId());

  async enable(): Promise<void> {
    if (this.busy() || this.webhookId()) return;

    this.busy.set(true);
    try {
      const token = await this.auth.validAccessToken();
      const result = await this.itad.addWebhook(token, ITAD_WEBHOOK_URL, ITAD_WEBHOOK_EVENTS);
      const id = result?.id?.trim();
      if (!id) {
        throw new Error('A API não retornou o identificador do webhook.');
      }
      this.persistId(id);
      await this.notifyWorker();
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<void> {
    const id = this.webhookId();
    if (this.busy() || !id) return;

    this.busy.set(true);
    try {
      const token = await this.auth.validAccessToken();
      await this.itad.removeWebhook(token, id);
      this.clearId();
    } catch (error: any) {
      if (error?.status === 400 || error?.status === 404) {
        this.clearId();
        return;
      }
      throw error;
    } finally {
      this.busy.set(false);
    }
  }

  private async notifyWorker() {
    try {
      await fetch(ITAD_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ping: true }),
      });
    } catch (error) {
      console.warn('Não foi possível notificar o worker de webhook', error);
    }
  }

  private readId(): string | null {
    try {
      const value = localStorage.getItem(WEBHOOK_ID_KEY)?.trim();
      return value || null;
    } catch {
      return null;
    }
  }

  private persistId(id: string) {
    localStorage.setItem(WEBHOOK_ID_KEY, id);
    this.webhookId.set(id);
  }

  private clearId() {
    localStorage.removeItem(WEBHOOK_ID_KEY);
    this.webhookId.set(null);
  }
}
