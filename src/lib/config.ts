// ==========================================
// 網站設定：優先讀 public/config.js（部署後可直接在 GitHub 上修改），
// 其次讀 GitHub Actions 的環境變數 (VITE_...)
// ==========================================
declare global {
  interface Window {
    GRACE_CONFIG?: { gasUrl?: string; ga4Id?: string; lineUrl?: string; coderUrl?: string };
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

const env = (key: string) => {
  try { return String((import.meta as any).env?.[key] || ''); } catch (e) { return ''; }
};

const cfg = (typeof window !== 'undefined' && window.GRACE_CONFIG) || {};

export const GAS_URL: string = String(cfg.gasUrl || env('VITE_GAS_URL') || '').trim();
export const CONFIG_GA4_ID: string = String(cfg.ga4Id || env('VITE_GA4_MEASUREMENT_ID') || '').trim();
// LINE 官方帳號與 Coder 官網（可在 public/config.js 修改）
const httpsOr = (v: any, fallback: string) => (/^https:\/\//.test(String(v || '')) ? String(v).trim() : fallback);
export const LINE_URL: string = httpsOr(cfg.lineUrl, 'https://lin.ee/nL7Gq8g');
export const CODER_URL: string = httpsOr(cfg.coderUrl, 'https://gracetsai181-source.github.io/coder/');
// 連到 Coder 時帶上 UTM，Coder 的 GA4 就看得出是從 GRACE 官網來的
export const CODER_LINK: string = (() => {
  try {
    const u = new URL(CODER_URL);
    u.searchParams.set('utm_source', 'grace_studio');
    u.searchParams.set('utm_medium', 'referral');
    u.searchParams.set('utm_campaign', 'sister_site');
    return u.toString();
  } catch (e) { return CODER_URL; }
})();
export const IS_DEV: boolean = (() => { try { return !!(import.meta as any).env?.DEV; } catch (e) { return false; } })();

// Apps Script 網址必須是 https://script.google.com/macros/s/.../exec
export const isValidGasUrl = (u: string) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u);
export const GAS_READY = isValidGasUrl(GAS_URL);
