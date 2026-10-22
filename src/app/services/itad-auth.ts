import { Injectable, signal } from '@angular/core';
import {
  ITAD_AUTHORIZE_URL,
  ITAD_CLIENT_ID,
  ITAD_CLIENT_SECRET,
  ITAD_SCOPES,
  ITAD_TOKEN_URL
} from '../shared/itad-oauth';

interface TokenPayload {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

const TOKEN_KEY = 'itad_oauth_tokens';
const VERIFIER_KEY = 'itad_oauth_verifier';
const STATE_KEY = 'itad_oauth_state';
const RETURN_KEY = 'itad_oauth_return';

@Injectable({
  providedIn: 'root'
})
export class ItadAuthService {
  readonly loggedIn = signal(false);
  readonly accessToken = signal<string | null>(null);

  isLoggedIn(): boolean {
    return this.loggedIn();
  }

  redirectUri(): string {
    const base = document.querySelector('base')?.href || `${location.origin}/`;
    return new URL('auth/callback', base).href;
  }

  async restore(): Promise<void> {
    const tokens = this.readTokens();
    if (!tokens?.access_token) {
      this.clearSession();
      return;
    }

    if (this.isExpired(tokens) && tokens.refresh_token) {
      try {
        await this.exchange({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token
        });
        return;
      } catch {
        this.clearSession();
        return;
      }
    }

    if (this.isExpired(tokens)) {
      this.clearSession();
      return;
    }

    this.accessToken.set(tokens.access_token);
    this.loggedIn.set(true);
  }

  async login(returnUrl = '/wishlist'): Promise<void> {
    const verifier = this.randomUrlSafe(32);
    const state = this.randomUrlSafe(16);
    const challenge = await this.sha256Challenge(verifier);

    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);
    sessionStorage.setItem(RETURN_KEY, returnUrl || '/wishlist');

    const url = new URL(ITAD_AUTHORIZE_URL);
    url.searchParams.set('client_id', ITAD_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('scope', ITAD_SCOPES);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    location.assign(url.toString());
  }

  consumeReturnUrl(): string {
    const value = sessionStorage.getItem(RETURN_KEY) || '/wishlist';
    sessionStorage.removeItem(RETURN_KEY);
    return value.startsWith('/') ? value : '/wishlist';
  }

  async completeLogin(code: string, state: string): Promise<void> {
    const expectedState = sessionStorage.getItem(STATE_KEY);
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(VERIFIER_KEY);

    if (!expectedState || state !== expectedState || !verifier) {
      throw new Error('Sessão OAuth inválida. Tente conectar novamente.');
    }

    await this.exchange({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: this.redirectUri()
    });
  }

  async validAccessToken(): Promise<string> {
    const tokens = this.readTokens();
    if (!tokens?.access_token) {
      throw new Error('not_authenticated');
    }

    if (this.isExpired(tokens) && tokens.refresh_token) {
      await this.exchange({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token
      });
    } else if (this.isExpired(tokens)) {
      this.logout();
      throw new Error('not_authenticated');
    }

    const token = this.accessToken();
    if (!token) throw new Error('not_authenticated');
    return token;
  }

  logout(): void {
    this.clearSession();
  }

  private async exchange(params: Record<string, string>): Promise<void> {
    const body = new URLSearchParams({
      client_id: ITAD_CLIENT_ID,
      client_secret: ITAD_CLIENT_SECRET,
      ...params
    });

    const response = await fetch(ITAD_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    const payload = (await response.json().catch(() => ({}))) as TokenPayload & { error?: string; error_description?: string };
    if (!response.ok || !payload.access_token) {
      throw new Error(payload.error_description || payload.error || 'Falha ao autenticar no IsThereAnyDeal');
    }

    this.persistTokens(payload);
    this.accessToken.set(payload.access_token);
    this.loggedIn.set(true);
  }

  private persistTokens(payload: TokenPayload) {
    const expiresAt = Date.now() + Math.max(30, (payload.expires_in ?? 3600) - 30) * 1000;
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: expiresAt
    }));
  }

  private readTokens(): { access_token: string; refresh_token?: string; expires_at: number } | null {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private isExpired(tokens: { expires_at?: number }): boolean {
    return !tokens.expires_at || Date.now() >= tokens.expires_at;
  }

  private clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    this.accessToken.set(null);
    this.loggedIn.set(false);
  }

  private randomUrlSafe(bytes: number): string {
    const buffer = crypto.getRandomValues(new Uint8Array(bytes));
    return this.toBase64Url(buffer);
  }

  private async sha256Challenge(verifier: string): Promise<string> {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.toBase64Url(new Uint8Array(digest));
  }

  private toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
}
