import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ItadAuthService } from '../../services/itad-auth';
import { WaitlistService } from '../../services/waitlist';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `
    <div class="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p class="text-white font-semibold">{{ message() }}</p>
      @if (error()) {
        <p class="text-sm text-red-300 max-w-md">{{ error() }}</p>
      }
    </div>
  `
})
export class AuthCallback implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(ItadAuthService);
  private waitlist = inject(WaitlistService);

  message = signal('Conectando à sua conta IsThereAnyDeal...');
  error = signal<string | null>(null);

  async ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const search = new URLSearchParams(window.location.search);
    const code = params.get('code') || search.get('code');
    const state = params.get('state') || search.get('state');
    const oauthError = params.get('error_description') || params.get('error')
      || search.get('error_description') || search.get('error');

    if (oauthError) {
      this.message.set('Não foi possível conectar.');
      this.error.set(oauthError);
      return;
    }

    if (!code || !state) {
      this.message.set('Retorno OAuth incompleto.');
      this.error.set('Código de autorização ausente.');
      return;
    }

    try {
      await this.auth.completeLogin(code, state);
      await this.waitlist.refresh().catch(() => undefined);
      const target = this.auth.consumeReturnUrl();
      await this.router.navigateByUrl(target);
    } catch (err: any) {
      this.message.set('Falha na autenticação.');
      this.error.set(err?.message || 'Tente conectar novamente.');
    }
  }
}
