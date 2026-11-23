// ==========================================
// PWA：註冊 Service Worker、偵測新版本、安裝到主畫面
// ==========================================
import { useEffect, useState } from 'react';
import { IS_DEV } from './config';

type Listener = () => void;
let waitingWorker: ServiceWorker | null = null;
const updateListeners = new Set<Listener>();
let deferredPrompt: any = null;
const installListeners = new Set<Listener>();

export function registerServiceWorker() {
  if (IS_DEV || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const onWaiting = (w: ServiceWorker | null) => {
        if (w && navigator.serviceWorker.controller) {
          waitingWorker = w;
          updateListeners.forEach((l) => l());
        }
      };
      onWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => { if (nw.state === 'installed') onWaiting(nw); });
      });
      // 每小時檢查一次新版本
      setInterval(() => reg.update().catch(() => {}), 3600 * 1000);
    } catch (e) {
      console.warn('Service Worker 註冊失敗', e);
    }
  });
  // 只有使用者按下「立即更新」才重新整理（第一次安裝不重整）
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !userRequestedUpdate) return;
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    deferredPrompt = e;
    installListeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installListeners.forEach((l) => l());
  });
}

let userRequestedUpdate = false;
export function applyUpdate() {
  userRequestedUpdate = true;
  waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
}

export function useUpdateAvailable() {
  const [available, setAvailable] = useState(!!waitingWorker);
  useEffect(() => {
    const l = () => setAvailable(true);
    updateListeners.add(l);
    return () => { updateListeners.delete(l); };
  }, []);
  return available;
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;

export function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(!!deferredPrompt);
  useEffect(() => {
    const l = () => setCanInstall(!!deferredPrompt);
    installListeners.add(l);
    return () => { installListeners.delete(l); };
  }, []);
  const promptInstall = async () => {
    if (!deferredPrompt) return 'unavailable';
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
    deferredPrompt = null;
    setCanInstall(false);
    return choice.outcome;
  };
  return { canInstall, promptInstall, showIOSHint: !canInstall && isIOS() && !isStandalone(), standalone: isStandalone() };
}
