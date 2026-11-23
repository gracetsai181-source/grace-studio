// ==========================================
// Google Apps Script API 用戶端
// POST 使用 text/plain 避免瀏覽器 CORS 預檢，Apps Script 可正常回傳 JSON
// ==========================================
import { GAS_URL, GAS_READY } from './config';

export class ApiError extends Error {
  code: string;
  constructor(message: string, code = '') {
    super(message);
    this.code = code;
  }
}

const PUBLIC_CACHE_KEY = 'grace_public_cache_v1';
const SESSION_KEY = 'grace_admin_session_v1';

async function request(url: string, init: RequestInit = {}, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, redirect: 'follow', credentials: 'omit' });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch (e) {
      throw new ApiError('Apps Script 回應格式錯誤，請確認部署存取權為「任何人」並使用最新版本');
    }
    if (!data.ok) throw new ApiError(data.error || '操作失敗', data.code || '');
    return data;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    if (err?.name === 'AbortError') throw new ApiError('連線逾時，請稍後再試');
    throw new ApiError('無法連線到 Google Sheets 後端，請檢查網路或 Apps Script 網址');
  } finally {
    clearTimeout(timer);
  }
}

export async function callApi(action: string, payload: Record<string, any> = {}, token?: string) {
  if (!GAS_READY) throw new ApiError('尚未設定 Apps Script 網址（public/config.js 的 gasUrl）', 'NO_CONFIG');
  return request(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token, ...payload })
  }, action === 'uploadImage' ? 90000 : 30000);
}

// 讀取公開作品與設定；離線或失敗時回傳上次快取
export async function fetchPublicData(): Promise<{ works: any[]; settings: Record<string, string>; fromCache?: boolean } | null> {
  if (!GAS_READY) return null;
  try {
    const data = await request(`${GAS_URL}?action=public&t=${Math.floor(Date.now() / 60000)}`, { method: 'GET' }, 20000);
    try { localStorage.setItem(PUBLIC_CACHE_KEY, JSON.stringify({ works: data.works, settings: data.settings })); } catch (e) {}
    return { works: data.works || [], settings: data.settings || {} };
  } catch (err) {
    try {
      const cached = JSON.parse(localStorage.getItem(PUBLIC_CACHE_KEY) || 'null');
      if (cached) return { ...cached, fromCache: true };
    } catch (e) {}
    return null;
  }
}

export function readCachedPublic() {
  try { return JSON.parse(localStorage.getItem(PUBLIC_CACHE_KEY) || 'null'); } catch (e) { return null; }
}

// ---- 管理員登入狀態：存在 sessionStorage，關閉分頁就清除 ----
export type AdminSession = { token: string; email: string; exp: number };

export function loadSession(): AdminSession | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (s && s.token && s.exp > Date.now()) return s;
  } catch (e) {}
  return null;
}

export function saveSession(s: AdminSession | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}
