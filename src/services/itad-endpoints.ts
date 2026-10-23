export const ITAD_API_BASE = 'https://deal-watcher.feleolive2010.workers.dev/itad';
export const ITAD_AUTH_BASE = 'https://deal-watcher.feleolive2010.workers.dev/auth';
export const ITAD_TOKEN_PATH = '/oauth/token/';
export const ITAD_TOKEN_URL = `${ITAD_AUTH_BASE}${ITAD_TOKEN_PATH}`;
export const ITAD_WEBHOOK_WORKER_URL = 'https://deal-watcher-webhook.feleolive2010.workers.dev';
export const ITAD_WEBHOOK_URL = `${ITAD_WEBHOOK_WORKER_URL}/webhook`;
export const ITAD_WEBHOOK_EVENTS = ['notification-waitlist'];
