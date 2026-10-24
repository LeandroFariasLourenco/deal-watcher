export const GAME_SUMMARY_API_URL = 'https://game-summary-ai.feleolive2010.workers.dev';
export const GAME_SUMMARY_SUMMARIZE_PATH = '/summarize';
export const GAME_SUMMARY_SUMMARIZE_URL = `${GAME_SUMMARY_API_URL}${GAME_SUMMARY_SUMMARIZE_PATH}`;
export const GAME_SUMMARY_SUMMARIZE_PROXY_PATH = '/api/proxy/game-summary/summarize';

export function resolveGameSummaryUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return GAME_SUMMARY_SUMMARIZE_PROXY_PATH;
    }
  }
  return GAME_SUMMARY_SUMMARIZE_URL;
}
