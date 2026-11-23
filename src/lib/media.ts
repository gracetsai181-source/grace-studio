// ==========================================
// 媒體工具：站內路徑、影片網址解析、安全網址檢查、圖片壓縮
// ==========================================
const BASE_URL = (() => {
  try { return (import.meta as any).env.BASE_URL || './'; } catch (e) { return './'; }
})();

// 站內檔案 (public/ 底下) 轉成正確網址；外部網址與 data: 原樣回傳
export const assetUrl = (p: string) => {
  if (!p || typeof p !== 'string') return p;
  if (/^(https?:)?\/\//i.test(p) || p.startsWith('data:') || p.startsWith('blob:')) return p;
  return BASE_URL + p.replace(/^\.?\//, '');
};

// 只允許 https 網址或站內相對路徑（擋掉 javascript:、data:text/html 等危險網址）
export const isSafeUrl = (u: string) => {
  const s = String(u || '').trim();
  if (!s) return false;
  if (/^https:\/\//i.test(s)) return true;
  return /^[\w\-./\u4e00-\u9fff%]+$/.test(s) && !s.includes('..') && !s.includes('//');
};

// 外部連結只開 https；站內路徑轉成正確網址
export const safeHref = (u: string) => (isSafeUrl(u) ? assetUrl(u) : '#');

// ==========================================
// 影片網址解析：全部轉成可「直接在網頁內播放」的嵌入網址
// 支援：站內 / https 影片檔 (mp4/webm/mov)、YouTube（含 Shorts、直播）、Instagram（貼文 / Reels）、
//       Facebook（影片 / Reels / 分享連結 / fb.watch）、TikTok、Vimeo、Google 雲端硬碟影片
// kind: 'video' 用 <video> 播放；'iframe' 用官方播放器嵌入
// ==========================================
const VIDEO_FILE_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

export const parseAndValidateVideoUrl = (rawUrl: string): any => {
  const empty = { isValid: true, platform: 'none', kind: 'none', embedUrl: null, originalUrl: '', canEmbed: false, defaultRatio: 'landscape' };
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') return empty;
  const url = rawUrl.trim();
  const ok = (platform: string, kind: string, embedUrl: string, defaultRatio = 'landscape', extra: any = {}) =>
    ({ isValid: true, platform, kind, embedUrl, originalUrl: url, canEmbed: true, defaultRatio, ...extra });
  const bad = (error: string) => ({ isValid: false, platform: 'none', kind: 'none', error });

  // 0. 站內影片檔（public/videos/ 底下）
  if (/^\.?\/?videos\/[^?#]+\.(mp4|webm|mov|m4v)$/i.test(url) && !url.includes('..')) {
    return ok('file', 'video', assetUrl(url), 'portrait');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (e) {
    return bad('無效的網址格式（站內影片請填 videos/檔名.mp4）');
  }
  if (parsed.protocol !== 'https:') return bad('影片網址必須是 https:// 開頭');
  const host = parsed.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, '');
  const path = parsed.pathname;

  // 1. YouTube（watch / youtu.be / shorts / live / embed）
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    let id: string | null = null;
    if (host === 'youtu.be') id = path.slice(1).split('/')[0];
    else {
      const m = path.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/);
      id = m ? m[2] : parsed.searchParams.get('v');
    }
    if (!id || !/^[\w-]{11}$/.test(id)) return bad('無法解析 YouTube 影片 ID，請貼上影片頁面的網址');
    const start = parseInt(String(parsed.searchParams.get('t') || parsed.searchParams.get('start') || '0').replace(/s$/, ''), 10);
    const qs = `rel=0&playsinline=1&modestbranding=1${start > 0 ? `&start=${start}` : ''}`;
    return ok('youtube', 'iframe', `https://www.youtube-nocookie.com/embed/${id}?${qs}`, path.startsWith('/shorts/') ? 'portrait' : 'landscape', { videoId: id });
  }

  // 2. Instagram（/p/、/reel/、/reels/、/tv/）
  if (host === 'instagram.com') {
    const m = path.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
    if (!m) return bad('請貼上 Instagram 貼文或 Reels 的網址（instagram.com/reel/...）');
    const type = m[1] === 'p' ? 'p' : m[1] === 'tv' ? 'tv' : 'reel';
    return ok('instagram', 'iframe', `https://www.instagram.com/${type}/${m[2]}/embed/`, 'portrait', { videoId: m[2] });
  }

  // 3. Facebook（影片、Reels、watch、分享連結、fb.watch）
  if (host === 'facebook.com' || host === 'fb.watch' || host === 'web.facebook.com' || host === 'fb.com') {
    const isReel = /\/reel\/|\/share\/r\//.test(path);
    const isVideo = host === 'fb.watch' || isReel || /\/videos\/|\/watch|\/share\/v\/|\/video\.php/.test(path) || parsed.searchParams.has('v');
    const href = encodeURIComponent(url);
    const embed = isVideo
      ? `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false&width=560&t=0`
      : `https://www.facebook.com/plugins/post.php?href=${href}&show_text=true&width=500`;
    return ok('facebook', 'iframe', embed, isReel ? 'portrait' : 'landscape');
  }

  // 4. TikTok
  if (host === 'tiktok.com') {
    const m = path.match(/\/video\/(\d{8,25})/);
    if (!m) return bad('請貼上 TikTok 影片完整網址（tiktok.com/@帳號/video/數字），短網址請先用瀏覽器打開再複製');
    return ok('tiktok', 'iframe', `https://www.tiktok.com/embed/v2/${m[1]}`, 'portrait', { videoId: m[1] });
  }
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
    return bad('TikTok 短網址無法嵌入，請先用瀏覽器打開，再複製網址列的完整網址');
  }

  // 5. Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = path.match(/(?:\/video)?\/(\d{5,12})(?:\/([\w]+))?/);
    if (!m) return bad('無法解析 Vimeo 影片 ID');
    const hash = m[2] && !/^\d+$/.test(m[2]) ? `?h=${m[2]}` : '';
    return ok('vimeo', 'iframe', `https://player.vimeo.com/video/${m[1]}${hash}`, 'landscape', { videoId: m[1] });
  }

  // 6. Google 雲端硬碟影片（需設為「知道連結的任何人可檢視」）
  if (host === 'drive.google.com') {
    const m = path.match(/\/file\/d\/([\w-]{10,})/);
    const id = m ? m[1] : parsed.searchParams.get('id');
    if (!id || !/^[\w-]{10,}$/.test(id)) return bad('無法解析 Google 雲端硬碟檔案 ID');
    return ok('gdrive', 'iframe', `https://drive.google.com/file/d/${id}/preview`, 'landscape', { videoId: id });
  }

  // 7. 其他 https 影片檔直連（例如 .mp4）
  if (VIDEO_FILE_RE.test(path)) {
    return ok('file', 'video', url, 'landscape');
  }

  return bad('目前支援 YouTube、Instagram、Facebook、TikTok、Vimeo、Google 雲端硬碟，或 .mp4 影片檔網址');
};

export const PLATFORM_LABEL: Record<string, string> = {
  file: '影片檔', youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook',
  tiktok: 'TikTok', vimeo: 'Vimeo', gdrive: 'Google 雲端硬碟', none: ''
};

// 影片比例：auto / portrait (9:16) / landscape (16:9) / square (1:1)
export const VIDEO_RATIOS = [
  { value: 'auto', label: '自動判斷' },
  { value: 'portrait', label: '直式 9:16（Reels / Shorts）' },
  { value: 'landscape', label: '橫式 16:9（YouTube）' },
  { value: 'square', label: '方形 1:1' }
];

export const resolveRatio = (work: any, info: any) => {
  const r = work?.video_ratio || 'auto';
  if (r !== 'auto') return r;
  return info?.defaultRatio || 'landscape';
};

// 上傳前在瀏覽器壓縮圖片（最長邊 1600px），回傳 { mimeType, dataBase64, dataUrl }
export async function compressImage(file: File, maxSide = 1600, quality = 0.85) {
  const okTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!okTypes.includes(file.type)) throw new Error('僅支援 JPG、PNG、WEBP、GIF 圖片');
  if (file.size > 20 * 1024 * 1024) throw new Error('原始圖片不得超過 20MB');
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('讀取圖片失敗'));
    r.readAsDataURL(file);
  });
  if (file.type === 'image/gif') {
    // GIF 保留動畫，不壓縮
    return { mimeType: file.type, dataBase64: dataUrl.split(',')[1], dataUrl };
  }
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('圖片格式無法讀取'));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('瀏覽器不支援圖片處理');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const out = canvas.toDataURL(mimeType, quality);
  return { mimeType, dataBase64: out.split(',')[1], dataUrl: out };
}
