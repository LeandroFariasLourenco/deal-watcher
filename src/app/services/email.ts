import { Injectable, signal } from '@angular/core';
import axios from 'axios';
import { EMAIL_API_URL } from '../../services/email-endpoints';

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  readonly sending = signal(false);

  /** Dispara o worker de e-mail (envio manual; futuro: jobs em background). */
  async triggerSend(): Promise<void> {
    if (this.sending()) return;

    this.sending.set(true);
    try {
      await axios.get(EMAIL_API_URL, {
        headers: { Accept: 'application/json' },
        timeout: 120_000,
      });
    } finally {
      this.sending.set(false);
    }
  }
}
