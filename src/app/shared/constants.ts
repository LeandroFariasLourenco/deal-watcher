export const ALLOWED_STORE_CONFIG = [
  { id: 4, matchTitles: ['blizzard'], displayName: 'Blizzard', icon: 'ac_unit' },
  { id: 36, matchTitles: ['greenmangaming', 'green man gaming'], displayName: 'GreenManGaming', icon: 'sports_esports' },
  { id: 16, matchTitles: ['epic game store', 'epic games store'], displayName: 'Epic Game Store', icon: 'bolt' },
  { id: 48, matchTitles: ['microsoft store'], displayName: 'Microsoft Store', icon: 'grid_view' },
  { id: 35, matchTitles: ['gog'], displayName: 'GOG', icon: 'album' },
  { id: 62, matchTitles: ['ubisoft store', 'ubisoft'], displayName: 'Ubisoft', icon: 'public' },
  { id: 61, matchTitles: ['steam'], displayName: 'Steam', icon: 'videogame_asset' },
  { id: 50, matchTitles: ['nuuvem'], displayName: 'Nuuvem', icon: 'cloud_done' }
];

export const DEFAULT_SHOP_IDS: number[] = ALLOWED_STORE_CONFIG.map(store => store.id);
