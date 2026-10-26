/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { ITAD_WEBHOOK_WORKER_URL } from './services/itad-endpoints';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: unknown;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.skipWaiting();
clientsClaim();

async function checkWebhookEventsInBackground() {
  try {
    const res = await fetch(`${ITAD_WEBHOOK_WORKER_URL}/notifications`);
    const { count, items } = await res.json();

    if (count > 0) {
      if ('setAppBadge' in navigator) {
        await navigator.setAppBadge(count);
      }

      const latestDeal = items[0]?.data;
      await self.registration.showNotification('🔥 Oferta na sua Waitlist!', {
        body: `Você tem ${count} nova(s) promoção(ões) aguardando visualização.`,
        icon: new URL('icons/icon-192.png', self.registration.scope).href,
        tag: 'itad-webhook-alert',
        data: { latestDeal, url: 'waitlist' },
      });
    } else if ('clearAppBadge' in navigator) {
      await navigator.clearAppBadge();
    }
  } catch (err) {
    console.error('[SW] Erro ao checar notificações:', err);
  }
}

self.addEventListener('periodicsync', (event) => {
  const syncEvent = event as Event & {
    tag: string;
    waitUntil: (promise: Promise<unknown>) => void;
  };
  if (syncEvent.tag === 'sync-itad-notifications') {
    syncEvent.waitUntil(checkWebhookEventsInBackground());
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CHECK_ITAD_NOTIFICATIONS') {
    event.waitUntil(checkWebhookEventsInBackground());
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data as { url?: string } | undefined)?.url || 'waitlist',
    self.registration.scope,
  ).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const existing = clientList.find((client) => 'focus' in client);
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) {
          await (existing as WindowClient).navigate(target);
        }
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
