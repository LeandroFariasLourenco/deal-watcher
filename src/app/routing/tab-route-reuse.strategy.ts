import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

const CACHED_TABS = new Set(['deals', 'search', 'wishlist', 'giveaways']);

@Injectable()
export class TabRouteReuseStrategy implements RouteReuseStrategy {
  private readonly handles = new Map<string, DetachedRouteHandle>();

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.routeKey(route) !== null;
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const key = this.routeKey(route);
    if (!key) return;

    if (handle) {
      this.handles.set(key, handle);
      return;
    }

    this.handles.delete(key);
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const key = this.routeKey(route);
    return !!key && this.handles.has(key);
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const key = this.routeKey(route);
    return key ? this.handles.get(key) ?? null : null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig && this.sameParams(future, curr);
  }

  private routeKey(route: ActivatedRouteSnapshot): string | null {
    const segments = route.pathFromRoot
      .flatMap(snapshot => snapshot.url.map(segment => segment.path))
      .filter(Boolean);
    const path = segments[0] ?? route.routeConfig?.path ?? '';
    if (CACHED_TABS.has(path)) return path;
    if (route.routeConfig?.data?.['reuse'] === true && path) return path;
    return null;
  }

  private sameParams(left: ActivatedRouteSnapshot, right: ActivatedRouteSnapshot): boolean {
    const leftKeys = Object.keys(left.params);
    const rightKeys = Object.keys(right.params);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every(key => left.params[key] === right.params[key]);
  }
}
