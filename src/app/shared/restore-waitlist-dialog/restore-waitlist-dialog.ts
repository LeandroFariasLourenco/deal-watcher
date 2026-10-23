import { Component, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { WaitlistService } from '../../services/waitlist';

export type RestoreWaitlistDialogData = {
  id: string;
  slug?: string;
  title?: string;
  type?: string;
  mature?: boolean;
  assets?: {
    banner145?: string;
    banner300?: string;
    banner400?: string;
    banner600?: string;
    boxart?: string;
  };
};

@Component({
  selector: 'app-restore-waitlist-dialog',
  standalone: true,
  template: `
    <p class="restore-copy">
      Esse jogo foi removido da biblioteca, mas deseja adicioná-lo de volta à lista de espera
      para ser avisado sobre possíveis promoções?
    </p>
    <div class="restore-actions">
      <button type="button" class="restore-btn restore-btn-ghost" (click)="decline()">Agora não</button>
      <button type="button" class="restore-btn restore-btn-primary" (click)="confirm()">Sim, avisar-me</button>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .restore-copy {
      margin: 0;
      color: rgba(255, 255, 255, 0.78);
      font-size: 0.9rem;
      line-height: 1.45;
    }

    .restore-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 1.15rem;
    }

    .restore-btn {
      min-height: 2.35rem;
      padding: 0 0.9rem;
      border-radius: 0.6rem;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
    }

    .restore-btn-ghost {
      color: #c7d5e0;
      background: #1b2838;
      border: 1px solid rgba(255, 255, 255, 0.14);
    }

    .restore-btn-primary {
      color: #ffffff;
      background: #4c6b22;
      border: 1px solid rgba(117, 166, 52, 0.4);
    }
  `,
})
export class RestoreWaitlistDialog {
  private readonly ref = inject(DynamicDialogRef);

  decline() {
    this.ref.close(false);
  }

  confirm() {
    this.ref.close(true);
  }
}

@Injectable({
  providedIn: 'root',
})
export class RestoreWaitlistPrompt {
  private readonly dialog = inject(DialogService);
  private readonly waitlist = inject(WaitlistService);

  async afterRemovedFromLibrary(game: RestoreWaitlistDialogData): Promise<void> {
    if (!game.id || this.waitlist.isMonitored(game.id)) return;

    const ref = this.dialog.open(RestoreWaitlistDialog, {
      header: 'Voltar para a waitlist?',
      modal: true,
      closable: true,
      dismissableMask: true,
      draggable: false,
      resizable: false,
      width: 'min(28rem, calc(100vw - 2rem))',
      styleClass: 'restore-waitlist-dialog',
      data: game,
    });
    if (!ref) return;

    const restore = await firstValueFrom(ref.onClose);
    if (!restore) return;
    try {
      await this.waitlist.add(game.id, game);
    } catch (error) {
      console.error('Failed to restore game to waitlist', error);
    }
  }
}
