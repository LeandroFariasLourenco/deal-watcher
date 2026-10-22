import { Injectable, signal } from '@angular/core';
import {
  ITAD_AUTHORIZE_URL,
  ITAD_CLIENT_ID,
  ITAD_CODE_VERIFIER_KEY,
  ITAD_SCOPES,
  ITAD_TOKEN_URL,
  base64urlencode,
  generateRandomString,
  itadRedirectUri,
  sha256
} from '../shared/itad-oauth';

interface TokenPayload {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

const TOKEN_KEY = 'itad_oauth_tokens';
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
    return itadRedirectUri();
  }

  /** True while the browser is sitting on an ITAD redirect (`code` or `error`). */
  hasOauthReturn(): boolean {
    const params = new URLSearchParams(window.location.search);
    return params.has('code') || params.has('error') || params.has('error_description');
  }

  async restore(): Promise<void> {
    if (this.hasOauthReturn()) return;

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
    const codeVerifier = generateRandomString(64);
    sessionStorage.setItem(ITAD_CODE_VERIFIER_KEY, codeVerifier);
    const state = generateRandomString(32);
    sessionStorage.setItem(STATE_KEY, state);
    sessionStorage.setItem(RETURN_KEY, returnUrl || '/wishlist');

    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64urlencode(hashed);
    const clientId = ITAD_CLIENT_ID;
    const redirectUri = this.redirectUri();
    const scope = ITAD_SCOPES;
    const authUrl = `${ITAD_AUTHORIZE_URL}?` +
      `response_type=code` +
      `&client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}` +
      `&code_challenge=${codeChallenge}` +
      `&code_challenge_method=S256`;

    window.location.href = authUrl;
  }

  consumeReturnUrl(): string {
    const value = sessionStorage.getItem(RETURN_KEY) || '/wishlist';
    sessionStorage.removeItem(RETURN_KEY);
    return value.startsWith('/') ? value : '/wishlist';
  }

  async completeLogin(code: string, state: string): Promise<void> {
    const expectedState = sessionStorage.getItem(STATE_KEY);
    const verifier = sessionStorage.getItem(ITAD_CODE_VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(ITAD_CODE_VERIFIER_KEY);

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
    const payload = await this.postToken({
      client_id: ITAD_CLIENT_ID,
      ...params
    });
    if (!payload.access_token) {
      throw new Error(payload.error_description || payload.error || 'Falha ao autenticar no IsThereAnyDeal');
    }

    this.persistTokens(payload);
    this.accessToken.set(payload.access_token);
    this.loggedIn.set(true);
  }

  private async postToken(body: Record<string, string>): Promise<TokenPayload & { error?: string; error_description?: string }> {
    const response = await fetch(ITAD_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(body).toString()
    });

    const payload = (await response.json().catch(() => ({}))) as TokenPayload & { error?: string; error_description?: string };
    if (!response.ok || !payload.access_token) {
      throw new Error(payload.error_description || payload.error || 'Falha ao autenticar no IsThereAnyDeal');
    }
    return payload;
  }

  private persistTokens(payload: TokenPayload) {
    const expiresAt = Date.now() + Math.max(30, (payload.expires_in ?? 3600) - 30) * 1000;
    const previous = this.readTokens();
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token || previous?.refresh_token,
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
}
