import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, Route, RouteReuseStrategy } from '@angular/router';

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

  retrieveStoredRouteHandles(): DetachedRouteHandle[] {
    return [...this.handles.values()];
  }

  shouldDestroyInjector(route: Route): boolean {
    return route.data?.['reuse'] !== true;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig && this.sameParams(future, curr);
  }

  private routeKey(route: ActivatedRouteSnapshot): string | null {
    const path = route.routeConfig?.path;
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
