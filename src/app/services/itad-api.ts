import { Injectable } from '@angular/core';
import { from } from 'rxjs';
import { ITADService } from '../../services/itad';

@Injectable({
  providedIn: 'root'
})
export class ItadApiService {
  private readonly itad = new ITADService('', '');

  getShops(country = 'BR') {
    return from(this.itad.getShops(country));
  }

  getDeals(country = 'BR', offset = 0, limit = 20, shops?: number[], sort?: string) {
    return from(this.itad.getDeals(country, offset, limit, shops, sort));
  }

  searchGames(query: string, offset = 0, limit = 20) {
    return from(this.itad.searchGames(query, offset, limit));
  }

  getGiveaways(offset = 0, limit = 20, sort?: string) {
    return from(this.itad.getGiveaways(offset, limit, sort));
  }

  getGameDetails(uuid: string, country = 'BR', shops?: number[]) {
    return from(this.itad.getGameDetails(uuid, country, shops));
  }

  getHistory(uuid: string, country = 'BR', shops?: number[]) {
    return from(this.itad.getHistory(uuid, country, shops));
  }
}
