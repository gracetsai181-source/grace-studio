// ==========================================
// /#/admin 管理後台（Google Sheets + Apps Script）
// 分頁：總覽｜作品管理｜詢問名單｜UTM 產生器｜網站設定｜帳號安全
// ==========================================
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, Images, Users, Link2, Settings, ShieldCheck, LogOut, Plus, Edit3, Trash2, Upload,
  Eye, EyeOff, Star, Video, Copy, Check, Download, RefreshCw, AlertTriangle, CheckCircle2, Mail, Lock,
  ExternalLink, TrendingUp
} from 'lucide-react';
import { callApi, ApiError, loadSession, saveSession, AdminSession } from '../lib/api';
import { GAS_READY, GAS_URL, CONFIG_GA4_ID } from '../lib/config';
import { parseAndValidateVideoUrl, compressImage, assetUrl, isSafeUrl, VIDEO_RATIOS, PLATFORM_LABEL } from '../lib/media';
import VideoEmbed from '../components/VideoEmbed';
import { buildUtmUrl, isValidGa4 } from '../lib/analytics';
import { INITIAL_WORKS } from '../data/initialWorks';

type Props = {
  showToast: (m: string) => void;
  navigateTo: (p: string) => void;
  onPublicChanged: () => void;
};

const IDLE_LIMIT_MS = 60 * 60 * 1000; // 閒置 60 分鐘自動登出

const CATEGORIES = ['AI 角色設計', 'AI 動畫影音', '品牌視覺', 'AI 影片', 'AI 虛擬主播', '互動遊戲', '網站與 LINE 開發', 'AR/VR 互動體驗'];
const LEAD_STATUSES = ['新進', '聯繫中', '已報價', '成交', '未成交', '垃圾訊息'];

const input = 'w-full bg-[#1c1813] border border-[#B89A70]/25 focus:border-[#B89A70] rounded-sm p-2.5 text-sm text-white outline-none';
const btnGold = 'px-4 py-2.5 bg-[#B89A70] hover:bg-[#d1b894] text-[#29251F] font-medium text-sm rounded-sm transition-colors disabled:opacity-50';
const btnLine = 'px-3 py-2 border border-[#B89A70]/40 hover:border-[#B89A70] text-[#E9DDCC] text-xs rounded-sm transition-colors disabled:opacity-50';
const card = 'bg-[#29251F] border border-[#B89A70]/20 rounded-sm p-4 sm:p-6';

export default function AdminPortal({ showToast, navigateTo, onPublicChanged }: Props) {
  const [session, setSession] = useState<AdminSession | null>(() => loadSession());
  const [checking, setChecking] = useState(!!loadSession());
  const [tab, setTab] = useState('dashboard');

  const logout = async (msg = '已安全登出管理後台') => {
    const s = session;
    saveSession(null);
    setSession(null);
    if (s) callApi('logout', {}, s.token).catch(() => {});
    showToast(msg);
  };

  // 統一呼叫後台 API；Token 失效就自動登出
  const api = async (action: string, payload: Record<string, any> = {}) => {
    if (!session) throw new ApiError('請先登入', 'AUTH');
    try {
      const res = await callApi(action, payload, session.token);
      const next = { ...session, exp: Date.now() + IDLE_LIMIT_MS };
      saveSession(next);
      return res;
    } catch (err: any) {
      if (err?.code === 'AUTH') {
        saveSession(null);
        setSession(null);
        showToast(err.message || '登入已過期，請重新登入');
      }
      throw err;
    }
  };

  // 進入後台時驗證 Token 是否仍有效
  useEffect(() => {
    if (!session) return;
    callApi('me', {}, session.token)
      .then(() => setChecking(false))
      .catch(() => { saveSession(null); setSession(null); setChecking(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 閒置自動登出
  useEffect(() => {
    if (!session) return;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const events = ['mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - last > IDLE_LIMIT_MS) logout('閒置過久，已自動登出');
    }, 60000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  if (!session) {
    return <LoginScreen onLogin={(s) => { saveSession(s); setSession(s); setTab('dashboard'); showToast('登入成功，歡迎回來'); }} navigateTo={navigateTo} />;
  }
  if (checking) {
    return <div className="min-h-[70vh] flex items-center justify-center text-[#E9DDCC]/70 text-sm">驗證登入狀態中…</div>;
  }

  const tabs = [
    { key: 'dashboard', label: '總覽', icon: LayoutDashboard },
    { key: 'works', label: '作品管理', icon: Images },
    { key: 'leads', label: '詢問名單', icon: Users },
    { key: 'utm', label: 'UTM 產生器', icon: Link2 },
    { key: 'settings', label: '網站設定', icon: Settings },
    { key: 'security', label: '帳號安全', icon: ShieldCheck }
  ];

  return (
    <div className="min-h-screen bg-[#1c1813] safe-pb-admin">
      <div className="bg-[#29251F] border-b border-[#B89A70]/20 safe-pt-1 pb-3 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-[#B89A70] tracking-widest uppercase">
              <ShieldCheck className="w-4 h-4 shrink-0" /> <span className="truncate">GRACE CMS 管理後台</span>
            </div>
            <p className="text-xs text-[#E9DDCC]/60 truncate mt-0.5">{session.email}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => navigateTo('/')} className={btnLine}>前台</button>
            <button onClick={() => logout()} className="px-3 py-2 text-xs bg-red-950/60 border border-red-500/40 text-red-200 hover:bg-red-900/60 rounded-sm flex items-center gap-1.5">
              <LogOut className="w-3.5 h-3.5" /> 登出
            </button>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto mt-3 px-4 sm:px-6 lg:px-12 flex gap-1 overflow-x-auto no-scrollbar" aria-label="後台分頁">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm rounded-sm border transition-colors ${
                tab === t.key ? 'bg-[#B89A70] text-[#29251F] border-[#B89A70] font-medium' : 'text-[#E9DDCC]/80 border-transparent hover:border-[#B89A70]/40'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 pt-6 sm:pt-8">
        {tab === 'dashboard' && <Dashboard api={api} goTab={setTab} />}
        {tab === 'works' && <WorksManager api={api} showToast={showToast} onPublicChanged={onPublicChanged} />}
        {tab === 'leads' && <LeadsManager api={api} showToast={showToast} />}
        {tab === 'utm' && <UtmBuilder api={api} showToast={showToast} />}
        {tab === 'settings' && <SettingsPanel api={api} showToast={showToast} onPublicChanged={onPublicChanged} />}
        {tab === 'security' && (
          <SecurityPanel
            api={api}
            showToast={showToast}
            onTokenChanged={(token) => { const s = { ...session, token, exp: Date.now() + IDLE_LIMIT_MS }; saveSession(s); setSession(s); }}
          />
        )}
      </div>
    </div>
  );
}

// ==========================================
// 登入畫面
// ==========================================
function LoginScreen({ onLogin, navigateTo }: { onLogin: (s: AdminSession) => void; navigateTo: (p: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) { setError('請輸入管理員 Email 與密碼'); return; }
    setLoading(true);
    try {
      const res = await callApi('login', { email: email.trim(), password });
      setPassword('');
      onLogin({ token: res.token, email: res.email, exp: Date.now() + IDLE_LIMIT_MS });
    } catch (err: any) {
      setError(err.message || '登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100svh] flex items-center justify-center px-4 py-12 bg-[#1c1813]">
      <div className="w-full max-w-md bg-[#29251F] border border-[#B89A70]/30 rounded-sm p-6 sm:p-10 shadow-2xl">
        <div className="text-center mb-8">
          <span className="text-xs tracking-[0.25em] uppercase text-[#B89A70] block mb-2">GRACE CREATIVE STUDIO</span>
          <h1 className="font-serif-grace text-3xl text-white mb-2">Admin Portal</h1>
          <p className="text-xs text-[#E9DDCC]/60">管理員專用・Google Sheets 安全驗證</p>
        </div>

        {!GAS_READY && (
          <div className="mb-6 p-3.5 bg-amber-950/60 border border-amber-500/40 rounded-sm text-xs text-amber-200 leading-relaxed">
            尚未設定後端：請在 <code>public/config.js</code> 填入 Apps Script 網頁應用程式網址（…/exec）後重新部署。
          </div>
        )}
        {error && (
          <div role="alert" className="mb-6 p-3.5 bg-red-950/60 border border-red-500/40 rounded-sm text-xs text-red-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label htmlFor="admin-email" className="block text-xs tracking-wider text-[#E9DDCC]/80 mb-2">管理員 Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#B89A70]/70 absolute left-3.5 top-3.5" />
              <input id="admin-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} pl-10 py-3`} />
            </div>
          </div>
          <div>
            <label htmlFor="admin-password" className="block text-xs tracking-wider text-[#E9DDCC]/80 mb-2">密碼</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#B89A70]/70 absolute left-3.5 top-3.5" />
              <input id="admin-password" type={showPw ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${input} pl-10 pr-11 py-3`} />
              <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? '隱藏密碼' : '顯示密碼'} className="absolute right-2 top-1.5 p-2 text-[#B89A70]/70">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading || !GAS_READY} className={`${btnGold} w-full py-3.5 tracking-widest`}>
            {loading ? '驗證中…' : '登入管理後台'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#B89A70]/15 text-[11px] text-[#E9DDCC]/55 space-y-1.5 leading-relaxed">
          <p className="flex items-center gap-1.5 text-[#B89A70]"><ShieldCheck className="w-4 h-4 shrink-0" /> 密碼以加鹽雜湊保存在 Apps Script，不會存在試算表或網站程式碼。</p>
          <p>連續輸錯 5 次會鎖定 15 分鐘；關閉分頁或閒置 60 分鐘會自動登出。</p>
          <button type="button" onClick={() => navigateTo('/')} className="underline underline-offset-4 text-[#B89A70]/70 hover:text-[#B89A70]">← 回到網站首頁</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 總覽
// ==========================================
function Dashboard({ api, goTab }: { api: any; goTab: (t: string) => void }) {
  const [data, setData] = useState<{ works: any[]; contacts: any[] } | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const [w, c] = await Promise.all([api('listWorks'), api('listContacts')]);
      setData({ works: w.works, contacts: c.contacts });
    } catch (err: any) { setError(err.message); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  if (error) return <ErrorBox msg={error} onRetry={load} />;
  if (!data) return <Loading />;

  const published = data.works.filter((w) => w.status === 'published').length;
  const newLeads = data.contacts.filter((c) => c.status === '新進').length;
  const bySource = countBy(data.contacts, (c) => `${c.utm_source || '(direct)'} / ${c.utm_medium || '(none)'}`);
  const byCampaign = countBy(data.contacts.filter((c) => c.utm_campaign), (c) => c.utm_campaign);
  const last30 = data.contacts.filter((c) => Date.now() - new Date(c.created_at).getTime() < 30 * 86400000).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat label="已發布作品" value={published} sub={`草稿 ${data.works.length - published} 件`} onClick={() => goTab('works')} />
        <Stat label="新進詢問" value={newLeads} sub="尚未處理" onClick={() => goTab('leads')} />
        <Stat label="近 30 天詢問" value={last30} sub={`累計 ${data.contacts.length} 筆`} onClick={() => goTab('leads')} />
        <Stat label="成交" value={data.contacts.filter((c) => c.status === '成交').length} sub="依詢問名單狀態" onClick={() => goTab('leads')} />
      </div>

      {data.works.length === 0 && <SeedBanner api={api} onDone={load} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className={card}>
          <h3 className="text-white font-medium mb-1 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#B89A70]" /> 詢問來源（UTM source / medium）</h3>
          <p className="text-[11px] text-[#E9DDCC]/50 mb-4">依送出表單時記錄的最後一次 UTM 來源</p>
          <BarList rows={bySource} empty="還沒有詢問資料" />
        </div>
        <div className={card}>
          <h3 className="text-white font-medium mb-1 flex items-center gap-2"><Link2 className="w-4 h-4 text-[#B89A70]" /> 行銷活動成效（utm_campaign）</h3>
          <p className="text-[11px] text-[#E9DDCC]/50 mb-4">用「UTM 產生器」建立的連結，帶來的詢問數</p>
          <BarList rows={byCampaign} empty="還沒有帶活動參數的詢問" />
        </div>
      </div>

      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium">最新詢問</h3>
          <button onClick={() => goTab('leads')} className={btnLine}>查看全部</button>
        </div>
        {data.contacts.length === 0 ? <p className="text-sm text-[#E9DDCC]/50">目前沒有資料</p> : (
          <ul className="divide-y divide-[#B89A70]/10">
            {data.contacts.slice(0, 5).map((c) => (
              <li key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm">
                <span className="text-white">{c.name} <span className="text-[#E9DDCC]/50 text-xs">｜{c.service}</span></span>
                <span className="text-xs text-[#E9DDCC]/60">{formatDate(c.created_at)}・{c.utm_source || '(direct)'}・{c.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`${card} text-xs text-[#E9DDCC]/70 leading-relaxed`}>
        想看完整流量（訪客數、頁面、轉換）：到 <a className="text-[#B89A70] underline" href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer">Google Analytics</a> →「報表 → 流量開發 → 流量開發」，
        維度選「工作階段來源/媒介」或「工作階段廣告活動」。表單送出會記錄為 <code className="text-[#B89A70]">generate_lead</code> 事件，可在 GA4「管理 → 事件」把它標示為「關鍵事件」。
      </div>
    </div>
  );
}

function SeedBanner({ api, onDone }: { api: any; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const seed = async () => {
    setBusy(true);
    try {
      const res = await api('bulkImport', { works: INITIAL_WORKS.map(({ fallback_cover, ...w }) => w) });
      setMsg(`已匯入 ${res.added} 件作品`);
      onDone();
    } catch (err: any) { setMsg(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-sm text-sm text-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <span>Google Sheets 的「Works」還是空的，網站目前顯示內建的 {INITIAL_WORKS.length} 件作品。要把它們匯入試算表方便之後編輯嗎？</span>
      <button onClick={seed} disabled={busy} className={btnGold}>{busy ? '匯入中…' : msg || '一鍵匯入內建作品'}</button>
    </div>
  );
}

// ==========================================
// 作品管理
// ==========================================
const emptyWork = () => ({
  id: '', title: '', category: CATEGORIES[0], description: '', concept: '', cover_image: '', gallery_images: [] as string[],
  video_url: '', video_ratio: 'auto', external_url: '', sort_order: 1, is_featured: false, status: 'published'
});

function WorksManager({ api, showToast, onPublicChanged }: { api: any; showToast: (m: string) => void; onPublicChanged: () => void }) {
  const [works, setWorks] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(emptyWork());
  const [editing, setEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [filter, setFilter] = useState('all');
  const coverRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setError('');
    try { setWorks((await api('listWorks')).works); } catch (err: any) { setError(err.message); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const video = useMemo(() => parseAndValidateVideoUrl(form.video_url), [form.video_url]);

  const openNew = () => {
    setForm({ ...emptyWork(), sort_order: (works?.length || 0) + 1 });
    setEditing(false); setFormError(''); setShowForm(true);
    setTimeout(() => formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const openEdit = (w: any) => {
    setForm({ ...emptyWork(), ...w, gallery_images: Array.isArray(w.gallery_images) ? w.gallery_images : [] });
    setEditing(true); setFormError(''); setShowForm(true);
    setTimeout(() => formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const upload = async (file: File) => {
    const img = await compressImage(file);
    const res = await api('uploadImage', { mimeType: img.mimeType, dataBase64: img.dataBase64 });
    return res.url as string;
  };
  const onCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setUploading('封面上傳中…'); setFormError('');
    try { const url = await upload(f); setForm((p: any) => ({ ...p, cover_image: url })); showToast('封面已上傳到 Google Drive'); }
    catch (err: any) { setFormError(`封面上傳失敗：${err.message}`); }
    finally { setUploading(''); }
  };
  const onGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setFormError('');
    let done = 0;
    for (const f of files) {
      setUploading(`細節圖上傳中 ${done + 1}/${files.length}…`);
      try { const url = await upload(f); setForm((p: any) => ({ ...p, gallery_images: [...p.gallery_images, url] })); done++; }
      catch (err: any) { setFormError(`「${f.name}」上傳失敗：${err.message}`); }
    }
    setUploading('');
    if (done) showToast(`已上傳 ${done} 張細節圖`);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!form.title.trim()) return setFormError('請填寫作品名稱');
    if (!form.description.trim()) return setFormError('請填寫作品介紹');
    if (!isSafeUrl(form.cover_image)) return setFormError('請上傳封面，或填入 https 圖片網址 / 站內路徑（例如 images/xxx.jpg）');
    if (!video.isValid) return setFormError(video.error || '影片網址驗證未通過');
    if (form.external_url && !isSafeUrl(form.external_url)) return setFormError('互動連結需為 https 網址或站內路徑（例如 games/xxx/index.html）');
    setSaving(true);
    try {
      const res = await api('saveWork', {
        work: {
          ...form,
          id: editing ? form.id : '',
          title: form.title.trim(),
          description: form.description.trim(),
          concept: form.concept.trim(),
          cover_image: form.cover_image.trim(),
          video_url: form.video_url.trim(),
          video_platform: video.platform,
          external_url: form.external_url.trim()
        }
      });
      showToast(res.created ? `已新增「${res.work.title}」` : `已更新「${res.work.title}」`);
      setShowForm(false); setEditing(false); setForm(emptyWork());
      await load();
      onPublicChanged();
    } catch (err: any) {
      setFormError(`儲存失敗：${err.message}`);
    } finally { setSaving(false); }
  };

  const toggleStatus = async (w: any) => {
    try {
      await api('saveWork', { work: { ...w, status: w.status === 'published' ? 'draft' : 'published' } });
      showToast(w.status === 'published' ? `「${w.title}」已轉為草稿` : `「${w.title}」已公開發布`);
      await load(); onPublicChanged();
    } catch (err: any) { showToast(`更新失敗：${err.message}`); }
  };
  const remove = async (w: any) => {
    if (!window.confirm(`確定要刪除「${w.title}」嗎？此動作無法復原。`)) return;
    try { await api('deleteWork', { id: w.id }); showToast(`已刪除「${w.title}」`); await load(); onPublicChanged(); }
    catch (err: any) { showToast(`刪除失敗：${err.message}`); }
  };

  if (error) return <ErrorBox msg={error} onRetry={load} />;
  if (!works) return <Loading />;

  const list = works.filter((w) => filter === 'all' || w.status === filter);

  return (
    <div className="space-y-6">
      {works.length === 0 && <SeedBanner api={api} onDone={load} />}

      <div ref={formTopRef} />
      {showForm && (
        <form onSubmit={save} className={`${card} space-y-4`}>
          <div className="flex items-center justify-between pb-3 border-b border-[#B89A70]/15">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              {editing ? <Edit3 className="w-5 h-5 text-[#B89A70]" /> : <Plus className="w-5 h-5 text-[#B89A70]" />}
              {editing ? '編輯作品' : '新增作品'}
            </h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-[#E9DDCC]/60 hover:text-white underline">取消</button>
          </div>

          {formError && <div role="alert" className="p-3 bg-red-950/70 border border-red-500/40 text-red-200 text-xs rounded-sm flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{formError}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="作品名稱 *"><input className={input} required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="分類 *">
                <select className={input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {[...new Set([...CATEGORIES, form.category])].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="排序（小的在前）"><input type="number" min={0} className={input} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></Field>
            </div>
          </div>
          <Field label="作品介紹 *"><textarea rows={3} required maxLength={2000} className={input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="創作理念"><textarea rows={2} maxLength={2000} className={input} value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} /></Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 bg-[#1c1813] border border-[#B89A70]/20 rounded-sm space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#B89A70] font-medium">封面圖片 *</span>
                <button type="button" disabled={!!uploading} onClick={() => coverRef.current?.click()} className={`${btnLine} flex items-center gap-1`}><Upload className="w-3.5 h-3.5" /> 上傳</button>
                <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onCover} className="hidden" />
              </div>
              <input className={`${input} text-xs`} value={form.cover_image} onChange={(e) => setForm({ ...form, cover_image: e.target.value })} placeholder="或貼上 https 圖片網址 / images/檔名.jpg" />
              {form.cover_image && isSafeUrl(form.cover_image) && <img src={assetUrl(form.cover_image)} alt="封面預覽" className="w-full h-32 object-cover rounded-sm border border-[#B89A70]/20" />}
            </div>
            <div className="p-3.5 bg-[#1c1813] border border-[#B89A70]/20 rounded-sm space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#E9DDCC]/90 font-medium">細節圖（{form.gallery_images.length} 張）</span>
                <button type="button" disabled={!!uploading} onClick={() => galleryRef.current?.click()} className={`${btnLine} flex items-center gap-1`}><Plus className="w-3.5 h-3.5" /> 多張上傳</button>
                <input ref={galleryRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={onGallery} className="hidden" />
              </div>
              {form.gallery_images.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {form.gallery_images.map((img: string, i: number) => (
                    <div key={i} className="relative h-16 rounded-sm overflow-hidden border border-[#B89A70]/20">
                      <img src={assetUrl(img)} alt="" className="w-full h-full object-cover" />
                      <button type="button" aria-label="移除圖片" onClick={() => setForm((p: any) => ({ ...p, gallery_images: p.gallery_images.filter((_: any, j: number) => j !== i) }))}
                        className="absolute top-0.5 right-0.5 p-1 bg-black/70 rounded-sm text-red-300"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {uploading && <p className="text-xs text-[#B89A70]">{uploading}（圖片會自動壓縮並存到你的 Google Drive）</p>}

          <div className="p-3.5 bg-[#1c1813] border border-[#B89A70]/20 rounded-sm space-y-2.5">
            <span className="text-xs text-[#B89A70] font-medium flex items-center gap-1.5"><Video className="w-4 h-4" /> 影片（直接嵌入網頁播放）</span>
            <p className="text-[11px] text-[#E9DDCC]/55 leading-relaxed">
              貼上 YouTube、Instagram、Facebook、TikTok、Vimeo、Google 雲端硬碟的影片網址，或站內影片 <code className="text-[#B89A70]">videos/檔名.mp4</code>、https 開頭的 .mp4 網址。
              大檔影片建議上傳到 YouTube（可設「不公開」）或 Google 雲端硬碟（共用設為「知道連結的任何人」）再貼網址。
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input type="text" className={`${input} text-xs md:col-span-2`} value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://www.instagram.com/reel/..." />
              <select className={`${input} text-xs`} value={form.video_ratio} onChange={(e) => setForm({ ...form, video_ratio: e.target.value })} aria-label="影片比例">
                {VIDEO_RATIOS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {form.video_url.trim() && (
              video.isValid
                ? (
                  <div className="space-y-2">
                    <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> 已識別為 {PLATFORM_LABEL[video.platform]}，下方是網站上的實際播放效果</p>
                    <div className="rounded-sm overflow-hidden border border-[#B89A70]/30">
                      <VideoEmbed work={{ ...form, video_url: form.video_url.trim() }} mode="preview" />
                    </div>
                  </div>
                )
                : <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {video.error}</p>
            )}
          </div>

          <Field label="互動遊戲 / 外部連結（選填，例如 games/cat-tennis/index.html）">
            <input className={`${input} text-xs`} value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2.5 bg-[#1c1813] p-3 rounded-sm border border-[#B89A70]/20 cursor-pointer">
              <input type="checkbox" checked={!!form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} className="accent-[#B89A70] w-4 h-4" />
              <span className="text-xs text-[#E9DDCC]">設為精選作品</span>
            </label>
            <select className={`${input} text-xs`} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} aria-label="發布狀態">
              <option value="published">公開發布</option>
              <option value="draft">草稿（不公開）</option>
            </select>
          </div>

          <button type="submit" disabled={saving || !!uploading} className={`${btnGold} w-full py-3.5 tracking-widest`}>
            {saving ? '儲存到 Google Sheets 中…' : editing ? '儲存修改' : '新增作品'}
          </button>
        </form>
      )}

      <div className={`${card} flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
        <div>
          <h2 className="text-lg font-medium text-white">作品列表（{works.length} 件）</h2>
          <p className="text-xs text-[#E9DDCC]/60 mt-0.5">訪客只看得到「公開發布」的作品</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[['all', '全部'], ['published', '已發布'], ['draft', '草稿']].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-sm border ${filter === k ? 'bg-[#B89A70] text-[#29251F] border-[#B89A70]' : 'border-[#B89A70]/25 text-[#E9DDCC]/70'}`}>
              {l}（{k === 'all' ? works.length : works.filter((w) => w.status === k).length}）
            </button>
          ))}
          <button onClick={openNew} className={`${btnGold} flex items-center gap-1 text-xs py-2`}><Plus className="w-4 h-4" /> 新增作品</button>
        </div>
      </div>

      <div className="space-y-3">
        {list.map((w) => (
          <div key={w.id} className="bg-[#29251F] border border-[#B89A70]/20 hover:border-[#B89A70]/45 rounded-sm p-4 flex flex-col sm:flex-row gap-4">
            <img src={assetUrl(w.cover_image)} alt="" loading="lazy" className="w-full sm:w-24 h-40 sm:h-24 object-cover rounded-sm border border-[#B89A70]/25 bg-[#1c1813] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5 text-[11px]">
                <span className="px-2 py-0.5 bg-[#1c1813] border border-[#B89A70]/30 text-[#B89A70] rounded-sm">#{w.sort_order}</span>
                <span className="px-2 py-0.5 bg-[#B89A70]/15 text-[#E9DDCC] rounded-sm">{w.category}</span>
                <span className={`px-2 py-0.5 rounded-sm ${w.status === 'published' ? 'bg-emerald-950/80 text-emerald-300' : 'bg-amber-950/80 text-amber-300'}`}>{w.status === 'published' ? '已發布' : '草稿'}</span>
                {w.is_featured && <span className="px-2 py-0.5 bg-[#B89A70] text-[#29251F] rounded-sm flex items-center gap-1"><Star className="w-3 h-3" />精選</span>}
                {w.video_url && <span className="px-2 py-0.5 text-[#B89A70] flex items-center gap-1"><Video className="w-3 h-3" />{PLATFORM_LABEL[w.video_platform] || '影片'}</span>}
              </div>
              <h3 className="text-base font-medium text-white break-words">{w.title}</h3>
              <p className="text-xs text-[#E9DDCC]/70 line-clamp-2 mt-1">{w.description}</p>
            </div>
            <div className="flex sm:flex-col gap-2 shrink-0">
              <button onClick={() => openEdit(w)} className={`${btnLine} flex-1 flex items-center justify-center gap-1`}><Edit3 className="w-3.5 h-3.5" /> 編輯</button>
              <button onClick={() => toggleStatus(w)} className={`${btnLine} flex-1 flex items-center justify-center gap-1`}>
                {w.status === 'published' ? <><EyeOff className="w-3.5 h-3.5" /> 轉草稿</> : <><Eye className="w-3.5 h-3.5" /> 發布</>}
              </button>
              <button onClick={() => remove(w)} className="flex-1 px-3 py-2 text-xs bg-red-950/40 hover:bg-red-900/70 text-red-300 border border-red-500/30 rounded-sm flex items-center justify-center gap-1"><Trash2 className="w-3.5 h-3.5" /> 刪除</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="text-sm text-[#E9DDCC]/50 text-center py-8">沒有符合的作品</p>}
      </div>
    </div>
  );
}

// ==========================================
// 詢問名單（含 UTM 來源）
// ==========================================
function LeadsManager({ api, showToast }: { api: any; showToast: (m: string) => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('全部');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = async () => {
    setError('');
    try { setRows((await api('listContacts')).contacts); } catch (err: any) { setError(err.message); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const update = async (c: any, patch: any) => {
    try {
      await api('updateContact', { id: c.id, ...patch });
      setRows((prev) => prev!.map((r) => (r.id === c.id ? { ...r, ...patch } : r)));
      showToast('已更新');
    } catch (err: any) { showToast(`更新失敗：${err.message}`); }
  };
  const remove = async (c: any) => {
    if (!window.confirm(`確定刪除「${c.name}」的詢問紀錄？`)) return;
    try { await api('deleteContact', { id: c.id }); setRows((prev) => prev!.filter((r) => r.id !== c.id)); showToast('已刪除'); }
    catch (err: any) { showToast(`刪除失敗：${err.message}`); }
  };

  if (error) return <ErrorBox msg={error} onRetry={load} />;
  if (!rows) return <Loading />;

  const kw = q.trim().toLowerCase();
  const list = rows.filter((r) => (status === '全部' || r.status === status) &&
    (!kw || [r.name, r.email, r.contact_info, r.message, r.utm_source, r.utm_campaign].join(' ').toLowerCase().includes(kw)));

  const exportCsv = () => {
    const cols = ['created_at', 'name', 'email', 'contact_info', 'service', 'budget', 'message', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'first_source', 'first_medium', 'first_campaign', 'landing_page', 'referrer', 'status', 'note'];
    const esc = (v: any) => {
      let s = String(v ?? '');
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = '﻿' + [cols.join(','), ...list.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `grace-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-col lg:flex-row lg:items-center justify-between gap-3`}>
        <div>
          <h2 className="text-lg font-medium text-white">詢問名單（{rows.length} 筆）</h2>
          <p className="text-xs text-[#E9DDCC]/60 mt-0.5">資料存在 Google Sheets「Contacts」工作表</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名、Email、來源…" className={`${input} sm:w-56`} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${input} sm:w-32`} aria-label="依狀態篩選">
            {['全部', ...LEAD_STATUSES].map((s) => <option key={s}>{s}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={exportCsv} className={`${btnLine} flex items-center gap-1`}><Download className="w-3.5 h-3.5" /> 匯出 CSV</button>
            <button onClick={load} className={`${btnLine} flex items-center gap-1`} aria-label="重新整理"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      {list.length === 0 && <p className="text-sm text-[#E9DDCC]/50 text-center py-10">沒有資料</p>}
      {list.map((c) => (
        <div key={c.id} className="bg-[#29251F] border border-[#B89A70]/20 rounded-sm">
          <button onClick={() => setOpen(open === c.id ? null : c.id)} className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-white font-medium break-words">{c.name} <span className="text-xs text-[#E9DDCC]/60 font-normal">{c.email}</span></p>
              <p className="text-xs text-[#E9DDCC]/60 mt-0.5">{formatDate(c.created_at)}・{c.service}・預算 {c.budget}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] shrink-0">
              <span className="px-2 py-0.5 bg-[#1c1813] border border-[#B89A70]/30 text-[#B89A70] rounded-sm">{c.utm_source || '(direct)'} / {c.utm_medium || '(none)'}</span>
              {c.utm_campaign && <span className="px-2 py-0.5 bg-[#B89A70]/15 text-[#E9DDCC] rounded-sm">{c.utm_campaign}</span>}
              <span className={`px-2 py-0.5 rounded-sm ${c.status === '新進' ? 'bg-sky-950 text-sky-300' : c.status === '成交' ? 'bg-emerald-950 text-emerald-300' : 'bg-[#1c1813] text-[#E9DDCC]/70'}`}>{c.status}</span>
            </div>
          </button>
          {open === c.id && (
            <div className="px-4 pb-4 space-y-3 text-sm border-t border-[#B89A70]/10 pt-3">
              <p className="whitespace-pre-wrap break-words text-[#E9DDCC]/90">{c.message}</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-[#E9DDCC]/65">
                <Info k="聯絡方式" v={c.contact_info} />
                <Info k="首次來源" v={[c.first_source, c.first_medium, c.first_campaign].filter(Boolean).join(' / ')} />
                <Info k="utm_term / content" v={[c.utm_term, c.utm_content].filter(Boolean).join(' / ')} />
                <Info k="廣告點擊 ID" v={c.gclid ? 'Google Ads (gclid)' : c.fbclid ? 'Meta (fbclid)' : ''} />
                <Info k="到達頁面" v={c.landing_page} />
                <Info k="參照網址" v={c.referrer} />
              </dl>
              <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-2">
                <select value={c.status} onChange={(e) => update(c, { status: e.target.value })} className={input} aria-label="處理狀態">
                  {LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
                <NoteInput initial={c.note} onSave={(note) => update(c, { note })} />
                <button onClick={() => remove(c)} className="px-3 py-2 text-xs bg-red-950/40 text-red-300 border border-red-500/30 rounded-sm flex items-center justify-center gap-1"><Trash2 className="w-3.5 h-3.5" /> 刪除</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent('關於您的專案諮詢｜GRACE CREATIVE STUDIO')}`} className={`${btnLine} flex items-center gap-1`}><Mail className="w-3.5 h-3.5" /> 回信</a>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function NoteInput({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(initial || '');
  return (
    <div className="flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="備註（例如：已報價 2 萬）" maxLength={1000} className={input} />
      <button onClick={() => onSave(v)} className={btnLine}>儲存</button>
    </div>
  );
}

// ==========================================
// UTM 產生器
// ==========================================
const UTM_PRESETS = [
  { label: 'Facebook 貼文', utm_source: 'facebook', utm_medium: 'social' },
  { label: 'Instagram 個人檔案', utm_source: 'instagram', utm_medium: 'social', utm_content: 'bio_link' },
  { label: 'LINE 官方帳號', utm_source: 'line', utm_medium: 'social' },
  { label: 'Facebook / IG 廣告', utm_source: 'meta', utm_medium: 'cpc' },
  { label: 'Google 廣告', utm_source: 'google', utm_medium: 'cpc' },
  { label: '電子報', utm_source: 'newsletter', utm_medium: 'email' },
  { label: 'QR Code 印刷品', utm_source: 'qrcode', utm_medium: 'offline' }
];

function UtmBuilder({ api, showToast }: { api: any; showToast: (m: string) => void }) {
  const siteUrl = `${window.location.origin}${window.location.pathname}`;
  const [f, setF] = useState<any>({ name: '', base_url: siteUrl, utm_source: '', utm_medium: '', utm_campaign: '', utm_term: '', utm_content: '', anchor: '' });
  const [links, setLinks] = useState<any[] | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [l, c] = await Promise.all([api('listUtm'), api('listContacts')]);
      setLinks(l.links); setLeads(c.contacts);
    } catch (err: any) { setError(err.message); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const fullUrl = useMemo(() => {
    const u = buildUtmUrl(f.base_url, f);
    return u && f.anchor ? `${u.split('#')[0]}#${f.anchor}` : u;
  }, [f]);
  const valid = /^(https:\/\/|http:\/\/localhost)/i.test(f.base_url) && f.utm_source.trim() && f.utm_medium.trim() && f.utm_campaign.trim();

  const copy = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setCopied(key); setTimeout(() => setCopied(''), 1500);
  };
  const save = async () => {
    if (!valid) return;
    try { await api('saveUtm', { link: { ...f, full_url: fullUrl } }); showToast('已儲存到 Google Sheets'); load(); }
    catch (err: any) { showToast(`儲存失敗：${err.message}`); }
  };
  const remove = async (l: any) => {
    if (!window.confirm('確定刪除這個 UTM 連結紀錄？（已發出去的連結仍可使用）')) return;
    try { await api('deleteUtm', { id: l.id }); load(); } catch (err: any) { showToast(err.message); }
  };
  const leadCount = (l: any) => leads.filter((c) => c.utm_source === l.utm_source && c.utm_medium === l.utm_medium && c.utm_campaign === l.utm_campaign).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className={`${card} lg:col-span-5 space-y-4`}>
        <h2 className="text-lg font-medium text-white">建立追蹤連結</h2>
        <div className="flex flex-wrap gap-1.5">
          {UTM_PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => setF({ ...f, utm_source: p.utm_source, utm_medium: p.utm_medium, utm_content: (p as any).utm_content || f.utm_content })}
              className="px-2.5 py-1 text-[11px] border border-[#B89A70]/30 text-[#E9DDCC]/80 rounded-sm hover:border-[#B89A70]">{p.label}</button>
          ))}
        </div>
        <Field label="名稱（給自己看的備註）"><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="例如：12 月 IG 限動" /></Field>
        <Field label="網站網址 *"><input className={input} value={f.base_url} onChange={(e) => setF({ ...f, base_url: e.target.value })} /></Field>
        <Field label="跳到區塊（選填）">
          <select className={input} value={f.anchor} onChange={(e) => setF({ ...f, anchor: e.target.value })}>
            <option value="">首頁最上方</option><option value="portfolio">作品集</option><option value="services">服務項目</option><option value="contact">聯絡我們</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="utm_source 來源 *"><input className={input} value={f.utm_source} onChange={(e) => setF({ ...f, utm_source: e.target.value })} placeholder="facebook" /></Field>
          <Field label="utm_medium 媒介 *"><input className={input} value={f.utm_medium} onChange={(e) => setF({ ...f, utm_medium: e.target.value })} placeholder="social" /></Field>
        </div>
        <Field label="utm_campaign 活動名稱 *"><input className={input} value={f.utm_campaign} onChange={(e) => setF({ ...f, utm_campaign: e.target.value })} placeholder="2026_xmas_promo" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="utm_term 關鍵字"><input className={input} value={f.utm_term} onChange={(e) => setF({ ...f, utm_term: e.target.value })} /></Field>
          <Field label="utm_content 內容"><input className={input} value={f.utm_content} onChange={(e) => setF({ ...f, utm_content: e.target.value })} placeholder="banner_a" /></Field>
        </div>
        <div className="p-3 bg-[#1c1813] border border-[#B89A70]/25 rounded-sm text-xs break-all text-[#E9DDCC]" data-testid="utm-preview">{valid ? fullUrl : '請填寫必填欄位（*）'}</div>
        <div className="flex gap-2">
          <button disabled={!valid} onClick={() => copy(fullUrl, 'new')} className={`${btnLine} flex-1 flex items-center justify-center gap-1`}>{copied === 'new' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} 複製</button>
          <button disabled={!valid} onClick={save} className={`${btnGold} flex-1`}>儲存連結</button>
        </div>
        <p className="text-[11px] text-[#E9DDCC]/50 leading-relaxed">命名建議：全部小寫、用底線連接（例如 2026_xmas_promo），GA4 才不會把同一個活動拆成好幾筆。</p>
      </div>

      <div className="lg:col-span-7 space-y-3">
        <div className={card}>
          <h2 className="text-lg font-medium text-white">已儲存的連結</h2>
          <p className="text-xs text-[#E9DDCC]/60 mt-0.5">「詢問數」= 透過這組 source / medium / campaign 送出表單的人數</p>
        </div>
        {error && <ErrorBox msg={error} onRetry={load} />}
        {!links && !error && <Loading />}
        {links?.length === 0 && <p className="text-sm text-[#E9DDCC]/50 text-center py-8">還沒有儲存的連結</p>}
        {links?.map((l) => (
          <div key={l.id} className="bg-[#29251F] border border-[#B89A70]/20 rounded-sm p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium">{l.name || l.utm_campaign}</p>
                <p className="text-[11px] text-[#E9DDCC]/60">{l.utm_source} / {l.utm_medium} / {l.utm_campaign}・{formatDate(l.created_at)}</p>
              </div>
              <span className="shrink-0 px-2 py-1 text-xs bg-[#B89A70]/15 text-[#B89A70] rounded-sm">詢問 {leadCount(l)}</span>
            </div>
            <p className="text-[11px] text-[#E9DDCC]/70 break-all">{l.full_url}</p>
            <div className="flex gap-2">
              <button onClick={() => copy(l.full_url, l.id)} className={`${btnLine} flex items-center gap-1`}>{copied === l.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} 複製</button>
              <a href={l.full_url} target="_blank" rel="noopener noreferrer" className={`${btnLine} flex items-center gap-1`}><ExternalLink className="w-3.5 h-3.5" /> 測試</a>
              <button onClick={() => remove(l)} className="px-3 py-2 text-xs text-red-300 border border-red-500/30 rounded-sm"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 網站設定（GA4 ID 等，存在 Settings 工作表）
// ==========================================
function SettingsPanel({ api, showToast, onPublicChanged }: { api: any; showToast: (m: string) => void; onPublicChanged: () => void }) {
  const [s, setS] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await api('getSettings');
      const obj: Record<string, string> = {};
      res.settings.forEach((r: any) => { obj[r.key] = String(r.value ?? ''); });
      setS(obj);
    } catch (err: any) { setError(err.message); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (s!.ga4_id && !isValidGa4(s!.ga4_id.trim())) { showToast('GA4 評估 ID 格式應為 G-XXXXXXXXXX'); return; }
    setSaving(true);
    try {
      await api('saveSettings', { settings: { ga4_id: s!.ga4_id.trim().toUpperCase(), site_title: s!.site_title, contact_notify_email: s!.contact_notify_email.trim() } });
      showToast('設定已儲存，前台重新整理後生效');
      onPublicChanged();
    } catch (err: any) { showToast(`儲存失敗：${err.message}`); } finally { setSaving(false); }
  };

  if (error) return <ErrorBox msg={error} onRetry={load} />;
  if (!s) return <Loading />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <form onSubmit={save} className={`${card} space-y-4`}>
        <h2 className="text-lg font-medium text-white">網站設定</h2>
        <Field label="GA4 評估 ID（G-XXXXXXXXXX）">
          <input className={input} value={s.ga4_id || ''} onChange={(e) => setS({ ...s, ga4_id: e.target.value })} placeholder="G-XXXXXXXXXX" />
        </Field>
        {CONFIG_GA4_ID && <p className="text-[11px] text-amber-300">注意：public/config.js 已填 ga4Id（{CONFIG_GA4_ID}），會優先使用 config.js 的值。</p>}
        <Field label="網站標題"><input className={input} maxLength={300} value={s.site_title || ''} onChange={(e) => setS({ ...s, site_title: e.target.value })} /></Field>
        <Field label="新詢問通知信箱（選填）"><input type="email" className={input} value={s.contact_notify_email || ''} onChange={(e) => setS({ ...s, contact_notify_email: e.target.value })} placeholder="有人填表就寄信通知" /></Field>
        <button type="submit" disabled={saving} className={`${btnGold} w-full`}>{saving ? '儲存中…' : '儲存設定'}</button>
      </form>

      <div className={`${card} space-y-3 text-xs text-[#E9DDCC]/75 leading-relaxed`}>
        <h2 className="text-lg font-medium text-white">連線資訊</h2>
        <Info k="Apps Script 網址" v={GAS_URL} />
        <Info k="GA4 狀態" v={(CONFIG_GA4_ID || s.ga4_id) ? `已設定 ${CONFIG_GA4_ID || s.ga4_id}` : '未設定（不會載入 GA4）'} />
        <p className="pt-2">GA4 評估 ID 在哪裡？Google Analytics →「管理」→「資料串流」→ 點你的網站串流 → 右上角「評估 ID」。</p>
        <p>驗證 GA4 有沒有收到資料：開啟網站後，到 GA4「報表 → 即時」應該會看到 1 位使用者。</p>
        <p>Apps Script 網址要換的話，請修改 GitHub 上的 <code className="text-[#B89A70]">public/config.js</code>，存檔後會自動重新部署。</p>
      </div>
    </div>
  );
}

// ==========================================
// 帳號安全
// ==========================================
function SecurityPanel({ api, showToast, onTokenChanged }: { api: any; showToast: (m: string) => void; onTokenChanged: (t: string) => void }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<any[] | null>(null);

  useEffect(() => { api('auditLog').then((r: any) => setLogs(r.logs)).catch(() => setLogs([])); }, []); // eslint-disable-line

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    if (newPw !== newPw2) return setMsg('兩次輸入的新密碼不一致');
    if (newPw.length < 10 || !/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) return setMsg('新密碼至少 10 碼，且需包含英文與數字');
    setBusy(true);
    try {
      const res = await api('changePassword', { oldPassword: oldPw, newPassword: newPw });
      onTokenChanged(res.token);
      setOldPw(''); setNewPw(''); setNewPw2('');
      showToast('密碼已更新，其他裝置的登入已全部失效');
    } catch (err: any) { setMsg(err.message); } finally { setBusy(false); }
  };

  const labels: Record<string, string> = {
    login_ok: '登入成功', login_fail: '登入失敗', set_credentials: '設定密碼', create_work: '新增作品', update_work: '修改作品',
    delete_work: '刪除作品', bulk_import: '批次匯入', save_settings: '修改設定', upload_image: '上傳圖片', save_utm: '新增 UTM',
    delete_utm: '刪除 UTM', update_contact: '更新詢問', delete_contact: '刪除詢問', revoke_all: '全部登出'
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <form onSubmit={submit} className={`${card} space-y-4`}>
        <h2 className="text-lg font-medium text-white">修改密碼</h2>
        {msg && <div role="alert" className="p-3 bg-red-950/70 border border-red-500/40 text-red-200 text-xs rounded-sm">{msg}</div>}
        <Field label="目前密碼"><input type="password" autoComplete="current-password" className={input} value={oldPw} onChange={(e) => setOldPw(e.target.value)} required /></Field>
        <Field label="新密碼（至少 10 碼，含英文與數字）"><input type="password" autoComplete="new-password" className={input} value={newPw} onChange={(e) => setNewPw(e.target.value)} required /></Field>
        <Field label="再輸入一次新密碼"><input type="password" autoComplete="new-password" className={input} value={newPw2} onChange={(e) => setNewPw2(e.target.value)} required /></Field>
        <button type="submit" disabled={busy} className={`${btnGold} w-full`}>{busy ? '更新中…' : '更新密碼'}</button>
        <p className="text-[11px] text-[#E9DDCC]/50">忘記密碼：打開 Google 試算表 → 上方選單「Grace 後台 → ② 設定管理員帳號密碼」重新設定即可。</p>
      </form>

      <div className={card}>
        <h2 className="text-lg font-medium text-white mb-3">操作紀錄（最近 200 筆）</h2>
        {!logs ? <Loading /> : logs.length === 0 ? <p className="text-sm text-[#E9DDCC]/50">沒有紀錄</p> : (
          <ul className="max-h-[420px] overflow-y-auto divide-y divide-[#B89A70]/10 text-xs">
            {logs.map((l, i) => (
              <li key={i} className="py-2 flex justify-between gap-3">
                <span className={l.event === 'login_fail' ? 'text-red-300' : 'text-[#E9DDCC]'}>{labels[l.event] || l.event} <span className="text-[#E9DDCC]/45">{l.detail}</span></span>
                <span className="text-[#E9DDCC]/50 shrink-0">{formatDate(l.time)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 小元件與工具
// ==========================================
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-[#E9DDCC]/80 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return <div className="break-all"><dt className="inline text-[#B89A70]">{k}：</dt><dd className="inline">{v}</dd></div>;
}

function Stat({ label, value, sub, onClick }: { label: string; value: number; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left bg-[#29251F] border border-[#B89A70]/20 hover:border-[#B89A70]/50 rounded-sm p-4 sm:p-5 transition-colors">
      <p className="text-[11px] sm:text-xs text-[#E9DDCC]/60">{label}</p>
      <p className="text-2xl sm:text-3xl text-white font-serif-grace mt-1">{value}</p>
      <p className="text-[11px] text-[#B89A70]/80 mt-1">{sub}</p>
    </button>
  );
}

function BarList({ rows, empty }: { rows: [string, number][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-[#E9DDCC]/50">{empty}</p>;
  const max = rows[0][1];
  return (
    <ul className="space-y-2.5">
      {rows.slice(0, 8).map(([k, n]) => (
        <li key={k} className="text-xs">
          <div className="flex justify-between gap-3 mb-1"><span className="text-[#E9DDCC] truncate">{k}</span><span className="text-white tabular-nums">{n}</span></div>
          <div className="h-1.5 bg-[#1c1813] rounded-full overflow-hidden"><div className="h-full bg-[#B89A70]" style={{ width: `${(n / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Loading() {
  return <div className="py-16 text-center text-sm text-[#E9DDCC]/60">從 Google Sheets 讀取中…</div>;
}

function ErrorBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div role="alert" className="p-4 bg-red-950/50 border border-red-500/40 rounded-sm text-sm text-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{msg}</span>
      <button onClick={onRetry} className={btnLine}>重試</button>
    </div>
  );
}

function countBy(list: any[], fn: (x: any) => string): [string, number][] {
  const m = new Map<string, number>();
  list.forEach((x) => { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function formatDate(s: string) {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s || '';
  return d.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
