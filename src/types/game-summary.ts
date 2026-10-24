export interface GameSummaryPrice {
  amount: number;
  amountInt: number;
  currency: string;
}

export interface GameSummaryStoreReview {
  score: number;
  source: string;
  count: number;
}

export interface GameSummaryPlayers {
  recent: number;
  day: number;
  week: number;
  peak: number;
}

export interface GameSummaryInfo {
  title: string;
  releaseDate: string;
  tags: string[];
  reviews: GameSummaryStoreReview[];
  players: GameSummaryPlayers;
}

export interface GameSummaryHistoryLow {
  all: GameSummaryPrice;
  y1: GameSummaryPrice;
  m3: GameSummaryPrice;
}

export interface GameSummaryDeal {
  shop: { name: string };
  price: GameSummaryPrice;
  regular: GameSummaryPrice;
  cut: number;
  expiry: string | null;
}

export interface GameSummaryPriceEntry {
  historyLow: GameSummaryHistoryLow;
  deals: GameSummaryDeal[];
}

export interface GameSummarySubscription {
  name: string;
  leaving: string | null;
}

export interface GameSummarySubscriptionEntry {
  subs: GameSummarySubscription[];
}

export interface GameSummaryNewsItem {
  title: string;
  date: number;
}

export interface GameSummaryNews {
  appnews: {
    count: number;
    newsitems: GameSummaryNewsItem[];
  };
}

export interface GameSummarySteamReview {
  review: string;
  voted_up: boolean;
  author: {
    playtime_forever: number;
  };
}

export interface GameSummarySteamReviews {
  response: {
    query_summary: {
      review_score_desc: string;
      total_positive: number;
      total_negative: number;
      total_reviews: number;
    };
    reviews: GameSummarySteamReview[];
  };
}

export interface GameSummaryPayload {
  info: GameSummaryInfo;
  prices: GameSummaryPriceEntry[];
  subscriptions: GameSummarySubscriptionEntry[];
  news: GameSummaryNews;
  reviews: GameSummarySteamReviews;
}
