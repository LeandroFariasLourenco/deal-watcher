export interface ITADHistoryPrice {
  timestamp: string;
  price: number;
  shop: string;
  shopId?: number;
}

export interface ITADGame {
  id: string;
  slug: string;
  title: string;
  type: string;
  assets: {
    banner145: string;
    banner300: string;
    banner400: string;
    banner600: string;
    box250: string;
    box313: string;
    box450: string;
  };
}

export type ITADInfo = ITADGame;

export interface ITADPrice {
  shop: {
    id: number;
    name: string;
  };
  price: {
    amount: number;
    amountInt: number;
    currency: string;
  };
  regular: {
    amount: number;
    amountInt: number;
    currency: string;
  };
  cut: number;
  voucher: string | null;
  storeLow: {
    amount: number;
    amountInt: number;
    currency: string;
  } | null;
  historyLow: {
    amount: number;
    amountInt: number;
    currency: string;
  } | null;
  url: string;
  drm: string[];
}

export interface ITADGameDetails {
  info: ITADInfo;
  prices: ITADPrice[];
  history: ITADHistoryPrice[];
}

export interface ITADGameSub {
  id: number | string;
  name: string;
  shop?: {
    id: number;
    name: string;
  } | null;
}

export interface ITADGameBundle {
  id: number | string;
  title: string;
  url?: string | null;
  details?: string | null;
  expiry?: string | null;
  publish?: string | null;
  note?: string | null;
}

export interface ITADPriceResponse {
  [uuid: string]: {
    id: string;
    deals: ITADPrice[];
  };
}

export interface ITADShop {
  id: number;
  name: string;
  title: string;
}

export interface ITADNotification {
  id: string;
  type: string;
  title: string;
  timestamp: string;
  read: string | null;
}

export interface ITADWaitlistGame {
  id: string;
  slug: string;
  title: string;
  type: string;
  mature: boolean;
  added: string | null;
  assets: {
    banner145?: string;
    banner300?: string;
    banner400?: string;
    banner600?: string;
    boxart?: string;
  };
}
