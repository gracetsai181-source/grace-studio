// ==========================================
// GA4 + UTM 追蹤
//  - 進站時記錄 UTM（首次接觸 first touch / 最後接觸 last touch，保存 90 天）
//  - 送出諮詢表單時把 UTM 一起寫進 Google Sheets
//  - GA4 只在設定有效評估 ID 時載入；後台頁面不送事件
// ==========================================
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'gclid', 'fbclid'];
const FIRST_KEY = 'grace_utm_first_v1';
const LAST_KEY = 'grace_utm_last_v1';
const KEEP_DAYS = 90;

type Touch = Record<string, string> & { ts?: string; landing?: string };

const read = (k: string): Touch | null => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    if (v && v.ts && Date.now() - new Date(v.ts).getTime() < KEEP_DAYS * 86400000) return v;
  } catch (e) {}
  return null;
};
const write = (k: string, v: Touch) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

let landingPage = '';
let sessionReferrer = '';

export function captureUtm() {
  if (typeof window === 'undefined') return;
  landingPage = window.location.href.slice(0, 500);
  sessionReferrer = (document.referrer || '').slice(0, 500);
  const params = new URLSearchParams(window.location.search);
  const touch: Touch = {};
  UTM_KEYS.forEach((k) => {
    const v = params.get(k);
    if (v) touch[k] = v.slice(0, 150);
  });
  if (touch.gclid && !touch.utm_source) { touch.utm_source = 'google'; touch.utm_medium = 'cpc'; }
  if (touch.fbclid && !touch.utm_source) { touch.utm_source = 'facebook'; touch.utm_medium = 'social'; }

  // 沒有 UTM 但從其他網站點進來：記為 referral
  if (!touch.utm_source && sessionReferrer) {
    try {
      const host = new URL(sessionReferrer).hostname;
      if (host && host !== window.location.hostname) {
        touch.utm_source = host.replace(/^www\./, '');
        touch.utm_medium = /google|bing|yahoo|duckduckgo/.test(host) ? 'organic' : 'referral';
      }
    } catch (e) {}
  }
  if (!touch.utm_source) return;
  touch.ts = new Date().toISOString();
  touch.landing = landingPage;
  if (!read(FIRST_KEY)) write(FIRST_KEY, touch);
  write(LAST_KEY, touch);
}

export function getAttribution() {
  const last = read(LAST_KEY) || {};
  const first = read(FIRST_KEY) || {};
  return {
    utm: last,
    firstTouch: first,
    landingPage: (last as Touch).landing || landingPage,
    referrer: sessionReferrer
  };
}

// ---- GA4 ----
let loadedId = '';
export const isValidGa4 = (id: string) => /^G-[A-Z0-9]{4,15}$/i.test(id || '') && id.toUpperCase() !== 'G-XXXXXXXXXX';

export function initGA4(id: string) {
  if (!isValidGa4(id) || loadedId) return;
  loadedId = id;
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  window.gtag = function () { window.dataLayer!.push(arguments); };
  window.gtag('js', new Date());
  // page_location 帶完整網址（含 ?utm_...），GA4 會自動歸因流量來源
  window.gtag('config', id, {
    page_location: window.location.href,
    page_title: document.title,
    send_page_view: !isAdminRoute()
  });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

const isAdminRoute = () => window.location.hash.startsWith('#/admin');

export function trackPageView(path: string) {
  if (!loadedId || !window.gtag || path === '/admin') return;
  window.gtag('event', 'page_view', {
    page_location: window.location.href,
    page_path: path,
    page_title: document.title
  });
}

export function track(event: string, params: Record<string, any> = {}) {
  if (!loadedId || !window.gtag || isAdminRoute()) return;
  window.gtag('event', event, params);
}

// 產生 UTM 網址（後台 UTM 產生器使用）
export function buildUtmUrl(base: string, p: Record<string, string>) {
  let url: URL;
  try { url = new URL(base); } catch (e) { return ''; }
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => {
    const v = (p[k] || '').trim();
    if (v) url.searchParams.set(k, v.replace(/\s+/g, '_'));
    else url.searchParams.delete(k);
  });
  // 確保 hash（例如 #portfolio）放在最後
  return url.toString();
}
