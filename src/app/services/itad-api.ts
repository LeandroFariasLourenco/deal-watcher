import { Injectable } from '@angular/core';
import { from } from 'rxjs';
import { ITADService } from '../../services/itad';
import { SteamService } from '../../services/steam';
import { APP_COUNTRY } from '../shared/constants';

@Injectable({
  providedIn: 'root'
})
export class ItadApiService {
  private readonly itad = new ITADService();
  private readonly steam = new SteamService();

  getShops(country = APP_COUNTRY) {
    return from(this.itad.getShops(country));
  }

  getDeals(country = APP_COUNTRY, offset = 0, limit = 20, shops?: number[], sort?: string) {
    return from(this.itad.getDeals(country, offset, limit, shops, sort));
  }

  searchGames(query: string, offset = 0, limit = 20) {
    return from(this.itad.searchGames(query, offset, limit));
  }

  getGiveaways(offset = 0, limit = 20, sort?: string) {
    return from(this.itad.getGiveaways(offset, limit, sort));
  }

  getGameInfo(uuid: string) {
    return from(this.itad.getGameInfo(uuid));
  }

  getGameDeals(uuid: string, country = APP_COUNTRY, shops?: number[]) {
    return from(this.itad.getGameDeals(uuid, country, shops));
  }

  getGameDetails(uuid: string, country = APP_COUNTRY, shops?: number[]) {
    return from(this.itad.getGameDetails(uuid, country, shops));
  }

  getGameOverview(uuid: string, country = APP_COUNTRY, shops?: number[]) {
    return from(this.itad.getGamesOverview([uuid], country, shops));
  }

  getHistory(uuid: string, country = APP_COUNTRY, shops?: number[]) {
    return from(this.itad.getHistory(uuid, country, shops));
  }

  getGameSubs(uuid: string, country = APP_COUNTRY) {
    return from(this.itad.getGameSubs(uuid, country));
  }

  getGameBundles(uuid: string, country = APP_COUNTRY) {
    return from(this.itad.getGameBundles(uuid, country));
  }

  getSteamReviews(appId: number, reviewType?: number) {
    return from(this.steam.getAppReviews(appId, reviewType));
  }

  getSteamNews(appId: number) {
    return from(this.steam.getAppNews(appId));
  }
}
