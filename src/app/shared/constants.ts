export const ALLOWED_STORE_CONFIG = [
  { id: 4, matchTitles: ['blizzard', 'battle.net', 'battlenet'], displayName: 'Blizzard', shortName: 'Blizzard', icon: 'ac_unit', logo: 'icons/stores/blizzard.jpg' },
  { id: 36, matchTitles: ['greenmangaming', 'green man gaming'], displayName: 'GreenManGaming', shortName: 'GMG', icon: 'sports_esports', logo: 'icons/stores/gmg.png' },
  { id: 16, matchTitles: ['epic game store', 'epic games store', 'epic games'], displayName: 'Epic Game Store', shortName: 'Epic Games', icon: 'bolt', logo: 'icons/stores/epic.png' },
  { id: 48, matchTitles: ['microsoft store', 'xbox', 'microsoft'], displayName: 'Microsoft Store', shortName: 'Microsoft', icon: 'grid_view', logo: 'icons/stores/microsoft.png' },
  { id: 35, matchTitles: ['gog'], displayName: 'GOG', shortName: 'GOG', icon: 'album', logo: 'icons/stores/gog.png' },
  { id: 62, matchTitles: ['ubisoft store', 'ubisoft'], displayName: 'Ubisoft', shortName: 'Ubisoft', icon: 'public', logo: 'icons/stores/ubisoft.png' },
  { id: 61, matchTitles: ['steam'], displayName: 'Steam', shortName: 'Steam', icon: 'videogame_asset', logo: 'icons/stores/steam.png' },
  { id: 50, matchTitles: ['nuuvem'], displayName: 'Nuuvem', shortName: 'Nuuvem', icon: 'cloud_done', logo: 'icons/stores/nuuvem.png' }
];

export const DEFAULT_SHOP_IDS: number[] = ALLOWED_STORE_CONFIG.map(store => store.id);
export const APP_COUNTRY = 'BR';

export function findStoreConfig(id?: number | null, name?: string | null) {
  if (id != null) {
    const byId = ALLOWED_STORE_CONFIG.find(store => store.id === Number(id));
    if (byId) return byId;
  }

  const raw = (name || '').toLowerCase().trim();
  if (!raw) return null;

  return ALLOWED_STORE_CONFIG.find(store =>
    store.matchTitles.includes(raw) ||
    raw.includes(store.displayName.toLowerCase()) ||
    raw.includes(store.shortName.toLowerCase())
  ) || null;
}

export function storeLogoUrl(id?: number | null, name?: string | null): string | null {
  return findStoreConfig(id, name)?.logo || null;
}
