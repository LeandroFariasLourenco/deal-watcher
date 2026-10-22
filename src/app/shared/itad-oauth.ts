export const ITAD_CLIENT_ID = '8dff7a638baade84';
export const ITAD_AUTHORIZE_URL = 'https://isthereanydeal.com/oauth/authorize/';
export const ITAD_TOKEN_URL = 'https://isthereanydeal.com/oauth/token/';
export const ITAD_SCOPES = 'wait_read wait_write';
export const ITAD_CODE_VERIFIER_KEY = 'itad_code_verifier';

export function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

export function base64urlencode(a: ArrayBuffer): string {
  let str = '';
  const bytes = new Uint8Array(a);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Registered redirect URIs are origins/base URLs, with no /callback suffix. */
export function itadRedirectUri(): string {
  if (window.location.hostname === 'leandrofariaslourenco.github.io') {
    return 'https://leandrofariaslourenco.github.io/deal-watcher';
  }
  return window.location.origin;
}

/**
 * ITAD sends the user back to the redirect URI itself (`/?code=&state=`),
 * including on GitHub Pages where the SPA base is `/deal-watcher/`.
 * Move that return onto the existing callback route before Angular reads the URL.
 */
export function redirectOauthReturnToCallback(): void {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  const hasReturn = params.has('code') || params.has('error') || params.has('error_description');
  if (!hasReturn) return;

  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const callbackPath = `${base}/auth/callback`;
  const current = window.location.pathname.replace(/\/$/, '') || '/';
  if (current === callbackPath) return;

  const next = `${callbackPath}?${params.toString()}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

redirectOauthReturnToCallback();
