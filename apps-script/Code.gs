/**
 * ============================================================
 * GRACE CREATIVE STUDIO｜Google Apps Script 後端（Google Sheets 資料庫）
 * ============================================================
 * 使用方式（完整圖文步驟請看專案 README.md）：
 *  1. 建立一份新的 Google 試算表 → 上方選單「擴充功能 → Apps Script」
 *  2. 把這整份程式碼貼進 Code.gs（取代原本內容）→ 儲存
 *  3. 回到試算表重新整理，上方會出現「Grace 後台」選單：
 *       ① 初始化資料表   ② 設定管理員帳號密碼
 *  4. Apps Script 右上「部署 → 新增部署作業 → 網頁應用程式」
 *       執行身分：我　｜　存取權：任何人
 *     複製「網頁應用程式網址」(…/exec)，貼到網站的 public/config.js
 *
 * 安全設計：
 *  - 管理員密碼只存「加鹽雜湊值」在 Script Properties（指令碼屬性），
 *    不會出現在試算表、不會出現在網站程式碼、也不會存明文。
 *  - 登入成功發給隨機 Token（6 小時有效，閒置自動延長），所有後台操作都要帶 Token。
 *  - 同一帳號連續輸錯 5 次鎖定 15 分鐘；全站 15 分鐘內錯誤 30 次也會暫時鎖定。
 *  - 寫入試算表前會防止「公式注入」（=、+、-、@ 開頭的文字）。
 * ============================================================
 */

var SHEETS = {
  works: 'Works',
  contacts: 'Contacts',
  utm: 'UtmLinks',
  settings: 'Settings',
  audit: 'AuditLog'
};

var HEADERS = {
  Works: ['id', 'title', 'category', 'description', 'concept', 'cover_image', 'gallery_images', 'video_url',
    'video_platform', 'video_ratio', 'external_url', 'sort_order', 'is_featured', 'status', 'created_at', 'updated_at'],
  Contacts: ['id', 'created_at', 'name', 'email', 'contact_info', 'service', 'budget', 'message',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid',
    'first_source', 'first_medium', 'first_campaign', 'landing_page', 'referrer', 'status', 'note'],
  UtmLinks: ['id', 'created_at', 'name', 'base_url', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'full_url'],
  Settings: ['key', 'value', 'description'],
  AuditLog: ['time', 'event', 'email', 'detail']
};

var DEFAULT_SETTINGS = [
  ['ga4_id', '', 'GA4 評估 ID（G-XXXXXXXXXX），留空則不載入 GA4'],
  ['site_title', 'GRACE CREATIVE STUDIO｜絹・創意工作室', '網站標題'],
  ['contact_notify_email', '', '有新的諮詢表單時寄通知信到這個信箱（留空不寄）']
];

// 公開設定白名單：只有這些 key 會被前台讀到
var PUBLIC_SETTING_KEYS = ['ga4_id', 'site_title'];

var SESSION_TTL = 21600;      // Token 有效秒數（6 小時，CacheService 上限）
var LOCK_LIMIT = 5;           // 同帳號錯誤次數上限
var LOCK_SECONDS = 900;       // 鎖定秒數（15 分鐘）
var GLOBAL_FAIL_LIMIT = 30;   // 全站錯誤次數上限
var HASH_ITERATIONS = 2000;   // 密碼雜湊迭代次數
var MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
var CONTACT_RATE_LIMIT = 30;  // 每 10 分鐘最多幾筆諮詢（防灌水）

// ============================================================
// 試算表選單（只有在試算表裡開啟才會出現）
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Grace 後台')
    .addItem('① 初始化資料表', 'setupSheets')
    .addItem('② 設定管理員帳號密碼', 'setupAdminFromMenu')
    .addSeparator()
    .addItem('強制登出所有後台裝置', 'revokeAllSessions')
    .addToUi();
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function setupSheets() {
  var ss = getSpreadsheet_();
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    var headers = HEADERS[name];
    var current = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    // 只補上缺少的欄位，不會刪除既有資料
    headers.forEach(function (h) {
      if (current.indexOf(h) === -1) {
        current.push(h);
        sh.getRange(1, current.length).setValue(h);
      }
    });
    sh.setFrozenRows(1);
    // 全部設為「純文字」格式，避免 Google 試算表把 0912… 電話、日期、比例自動轉換
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
    sh.getRange(1, 1, 1, current.length).setFontWeight('bold').setBackground('#29251F').setFontColor('#B89A70');
  });
  var settings = ss.getSheetByName(SHEETS.settings);
  var existing = readObjects_(SHEETS.settings).map(function (r) { return r.key; });
  DEFAULT_SETTINGS.forEach(function (row) {
    if (existing.indexOf(row[0]) === -1) settings.appendRow(row);
  });
  var defaultSheet = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
  clearPublicCache_();
  try { SpreadsheetApp.getUi().alert('資料表初始化完成！下一步請執行「② 設定管理員帳號密碼」。'); } catch (e) {}
}

function setupAdminFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt('設定管理員', '請輸入管理員 Email（登入帳號）：', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var email = String(r1.getResponseText()).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ui.alert('Email 格式不正確'); return; }
  var r2 = ui.prompt('設定管理員', '請輸入新密碼（至少 10 碼，需含英文與數字）：', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var pw = String(r2.getResponseText());
  var r3 = ui.prompt('設定管理員', '請再輸入一次密碼確認：', ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() !== ui.Button.OK) return;
  if (pw !== String(r3.getResponseText())) { ui.alert('兩次輸入的密碼不一致，請重新設定'); return; }
  var err = passwordPolicyError_(pw);
  if (err) { ui.alert(err); return; }
  setAdminCredentials_(email, pw);
  ui.alert('管理員帳號已設定完成：' + email + '\n密碼只以加密雜湊保存在指令碼屬性中，請妥善記住。');
}

function revokeAllSessions() {
  PropertiesService.getScriptProperties().setProperty('SESSION_EPOCH', String(Date.now()));
  audit_('revoke_all', '', '');
  try { SpreadsheetApp.getUi().alert('已讓所有後台登入失效，需要重新登入。'); } catch (e) {}
}

// ============================================================
// 網頁應用程式進入點
// ============================================================
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'public';
  try {
    if (action === 'public') return json_(publicData_());
    if (action === 'ping') return json_({ ok: true, time: new Date().toISOString() });
    return json_({ ok: false, error: '未知的操作' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: '資料格式錯誤' });
  }
  try {
    return json_(handleAction_(body));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err), code: err.code || '' });
  }
}

function handleAction_(body) {
  var action = String(body.action || '');
  // ---- 公開操作 ----
  if (action === 'public') return publicData_();
  if (action === 'contact') return submitContact_(body);
  if (action === 'login') return login_(body);

  // ---- 以下都需要管理員 Token ----
  var session = requireSession_(body.token);
  switch (action) {
    case 'me': return { ok: true, email: session.email };
    case 'logout': return logout_(body.token);
    case 'listWorks': return { ok: true, works: readWorks_() };
    case 'saveWork': return saveWork_(body.work, session);
    case 'deleteWork': return deleteWork_(body.id, session);
    case 'bulkImport': return bulkImport_(body.works, session);
    case 'listContacts': return { ok: true, contacts: readObjects_(SHEETS.contacts).reverse() };
    case 'updateContact': return updateContact_(body, session);
    case 'deleteContact': return deleteRowById_(SHEETS.contacts, body.id, session, 'delete_contact');
    case 'listUtm': return { ok: true, links: readObjects_(SHEETS.utm).reverse() };
    case 'saveUtm': return saveUtm_(body.link, session);
    case 'deleteUtm': return deleteRowById_(SHEETS.utm, body.id, session, 'delete_utm');
    case 'getSettings': return { ok: true, settings: readObjects_(SHEETS.settings) };
    case 'saveSettings': return saveSettings_(body.settings, session);
    case 'uploadImage': return uploadImage_(body, session);
    case 'changePassword': return changePassword_(body, session);
    case 'auditLog': return { ok: true, logs: readObjects_(SHEETS.audit).slice(-200).reverse() };
    default: throw new Error('未知的操作：' + action);
  }
}

// ============================================================
// 公開資料
// ============================================================
function publicData_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('public_v1');
  if (cached) return JSON.parse(cached);
  var works = readWorks_().filter(function (w) { return w.status === 'published'; });
  var settings = {};
  readObjects_(SHEETS.settings).forEach(function (r) {
    if (PUBLIC_SETTING_KEYS.indexOf(r.key) !== -1) settings[r.key] = String(r.value || '');
  });
  var data = { ok: true, works: works, settings: settings, total: works.length, generated_at: new Date().toISOString() };
  var str = JSON.stringify(data);
  if (str.length < 95000) cache.put('public_v1', str, 300);
  return data;
}

function clearPublicCache_() {
  CacheService.getScriptCache().remove('public_v1');
}

// ============================================================
// 聯絡表單（含 UTM）
// ============================================================
function submitContact_(b) {
  if (b.hp) return { ok: true }; // 機器人填了隱藏欄位：假裝成功，不寫入
  if (Number(b.elapsed || 0) < 2500) throw new Error('送出太快了，請稍後再試');
  var name = clip_(b.name, 100), email = clip_(b.email, 150), message = clip_(b.message, 3000);
  if (!name || !email || !message) throw new Error('請完整填寫姓名、信箱與需求內容');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email 格式不正確');

  var cache = CacheService.getScriptCache();
  var count = Number(cache.get('contact_rate') || 0);
  if (count >= CONTACT_RATE_LIMIT) throw new Error('目前表單送出量過多，請稍後再試');
  cache.put('contact_rate', String(count + 1), 600);

  var utm = b.utm || {};
  var first = b.firstTouch || {};
  var row = {
    id: 'c-' + Utilities.getUuid().slice(0, 8),
    created_at: new Date().toISOString(),
    name: name, email: email,
    contact_info: clip_(b.contactInfo, 100),
    service: clip_(b.service, 100),
    budget: clip_(b.budget, 50),
    message: message,
    utm_source: clip_(utm.utm_source, 100) || '(direct)',
    utm_medium: clip_(utm.utm_medium, 100) || '(none)',
    utm_campaign: clip_(utm.utm_campaign, 150),
    utm_term: clip_(utm.utm_term, 150),
    utm_content: clip_(utm.utm_content, 150),
    gclid: clip_(utm.gclid, 200),
    fbclid: clip_(utm.fbclid, 300),
    first_source: clip_(first.utm_source, 100),
    first_medium: clip_(first.utm_medium, 100),
    first_campaign: clip_(first.utm_campaign, 150),
    landing_page: clip_(b.landingPage, 500),
    referrer: clip_(b.referrer, 500),
    status: '新進',
    note: ''
  };
  withLock_(function () { appendObject_(SHEETS.contacts, row); });
  notifyContact_(row);
  return { ok: true, id: row.id };
}

function notifyContact_(row) {
  try {
    var to = getSetting_('contact_notify_email');
    if (!to) return;
    MailApp.sendEmail({
      to: to,
      subject: '【Grace 官網】新的專案諮詢：' + row.name,
      body: '姓名：' + row.name + '\nEmail：' + row.email + '\n聯絡方式：' + row.contact_info +
        '\n服務：' + row.service + '\n預算：' + row.budget + '\n來源：' + row.utm_source + ' / ' + row.utm_medium +
        ' / ' + row.utm_campaign + '\n\n' + row.message
    });
  } catch (e) { /* 寄信失敗不影響表單 */ }
}

function updateContact_(b, session) {
  var allowed = ['新進', '聯繫中', '已報價', '成交', '未成交', '垃圾訊息'];
  var patch = {};
  if (b.status !== undefined) {
    if (allowed.indexOf(b.status) === -1) throw new Error('狀態不正確');
    patch.status = b.status;
  }
  if (b.note !== undefined) patch.note = clip_(b.note, 1000);
  withLock_(function () { updateRowById_(SHEETS.contacts, b.id, patch); });
  audit_('update_contact', session.email, b.id);
  return { ok: true };
}

// ============================================================
// 作品 CRUD
// ============================================================
function readWorks_() {
  return readObjects_(SHEETS.works).map(normalizeWork_).sort(function (a, b) {
    return (a.sort_order || 999) - (b.sort_order || 999);
  });
}

function normalizeWork_(r) {
  var gallery = [];
  try { gallery = r.gallery_images ? JSON.parse(r.gallery_images) : []; } catch (e) { gallery = []; }
  return {
    id: String(r.id),
    title: String(r.title || ''),
    category: String(r.category || ''),
    description: String(r.description || ''),
    concept: String(r.concept || ''),
    cover_image: String(r.cover_image || ''),
    gallery_images: Array.isArray(gallery) ? gallery : [],
    video_url: String(r.video_url || ''),
    video_platform: String(r.video_platform || 'none'),
    video_ratio: String(r.video_ratio || 'auto'),
    external_url: String(r.external_url || ''),
    sort_order: Number(r.sort_order) || 0,
    is_featured: r.is_featured === true || String(r.is_featured).toUpperCase() === 'TRUE',
    status: r.status === 'draft' ? 'draft' : 'published',
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at || ''),
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at || '')
  };
}

function validateWork_(w) {
  if (!w || typeof w !== 'object') throw new Error('作品資料錯誤');
  var title = clip_(w.title, 200);
  if (!title) throw new Error('請填寫作品名稱');
  var description = clip_(w.description, 2000);
  if (!description) throw new Error('請填寫作品介紹');
  var cover = clip_(w.cover_image, 1000);
  if (!cover || !isSafeAssetUrl_(cover)) throw new Error('封面圖片網址不正確（需為 https 網址或站內路徑）');
  var gallery = Array.isArray(w.gallery_images) ? w.gallery_images.slice(0, 30).map(function (g) { return clip_(g, 1000); }) : [];
  gallery = gallery.filter(isSafeAssetUrl_);
  var video = clip_(w.video_url, 1000);
  if (video && !isSafeAssetUrl_(video)) throw new Error('影片網址不正確');
  var ext = clip_(w.external_url, 1000);
  if (ext && !isSafeAssetUrl_(ext)) throw new Error('外部連結網址不正確');
  // 影片比例：auto 自動 / portrait 直式 9:16 / landscape 橫式 16:9 / square 方形 1:1
  var ratio = ['auto', 'portrait', 'landscape', 'square'].indexOf(w.video_ratio) !== -1 ? w.video_ratio : 'auto';
  return {
    id: /^[\w-]{1,80}$/.test(String(w.id || '')) ? String(w.id) : 'work-' + Date.now() + '-' + Utilities.getUuid().slice(0, 4),
    title: title,
    category: clip_(w.category, 60) || '未分類',
    description: description,
    concept: clip_(w.concept, 2000),
    cover_image: cover,
    gallery_images: JSON.stringify(gallery.length ? gallery : [cover]),
    video_url: video,
    video_platform: clip_(w.video_platform, 20) || 'none',
    video_ratio: ratio,
    external_url: ext,
    sort_order: Math.max(0, Math.min(9999, Number(w.sort_order) || 0)),
    is_featured: Boolean(w.is_featured),
    status: w.status === 'draft' ? 'draft' : 'published'
  };
}

function saveWork_(w, session) {
  var clean = validateWork_(w);
  var now = new Date().toISOString();
  var created = false;
  withLock_(function () {
    var found = findRowById_(SHEETS.works, clean.id);
    clean.updated_at = now;
    if (found) {
      updateRowById_(SHEETS.works, clean.id, clean);
    } else {
      clean.created_at = w.created_at && String(w.created_at).length < 40 ? String(w.created_at) : now;
      appendObject_(SHEETS.works, clean);
      created = true;
    }
  });
  clearPublicCache_();
  audit_(created ? 'create_work' : 'update_work', session.email, clean.id + ' ' + clean.title);
  return { ok: true, work: normalizeWork_(clean), created: created };
}

function deleteWork_(id, session) {
  var res = deleteRowById_(SHEETS.works, id, session, 'delete_work');
  clearPublicCache_();
  return res;
}

function bulkImport_(list, session) {
  if (!Array.isArray(list) || list.length === 0) throw new Error('沒有要匯入的作品');
  if (list.length > 200) throw new Error('一次最多匯入 200 件');
  var now = new Date().toISOString();
  var added = 0, skipped = 0;
  withLock_(function () {
    var ids = readObjects_(SHEETS.works).map(function (r) { return String(r.id); });
    list.forEach(function (w) {
      var clean = validateWork_(w);
      if (ids.indexOf(clean.id) !== -1) { skipped++; return; }
      clean.created_at = w.created_at ? String(w.created_at).slice(0, 40) : now;
      clean.updated_at = now;
      appendObject_(SHEETS.works, clean);
      ids.push(clean.id);
      added++;
    });
  });
  clearPublicCache_();
  audit_('bulk_import', session.email, '新增 ' + added + ' 件，略過 ' + skipped + ' 件');
  return { ok: true, added: added, skipped: skipped };
}

// ============================================================
// UTM 連結
// ============================================================
function saveUtm_(l, session) {
  if (!l) throw new Error('資料錯誤');
  var base = clip_(l.base_url, 500);
  if (!/^(https:\/\/|http:\/\/localhost)/i.test(base)) throw new Error('網址需以 https:// 開頭');
  var src = clip_(l.utm_source, 100), med = clip_(l.utm_medium, 100), camp = clip_(l.utm_campaign, 150);
  if (!src || !med || !camp) throw new Error('utm_source、utm_medium、utm_campaign 為必填');
  var row = {
    id: 'u-' + Utilities.getUuid().slice(0, 8),
    created_at: new Date().toISOString(),
    name: clip_(l.name, 100),
    base_url: base,
    utm_source: src, utm_medium: med, utm_campaign: camp,
    utm_term: clip_(l.utm_term, 150), utm_content: clip_(l.utm_content, 150),
    full_url: clip_(l.full_url, 1500)
  };
  withLock_(function () { appendObject_(SHEETS.utm, row); });
  audit_('save_utm', session.email, row.full_url);
  return { ok: true, link: row };
}

// ============================================================
// 網站設定
// ============================================================
function getSetting_(key) {
  var rows = readObjects_(SHEETS.settings);
  for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return String(rows[i].value || '');
  return '';
}

function saveSettings_(settings, session) {
  if (!settings || typeof settings !== 'object') throw new Error('設定資料錯誤');
  var allowedKeys = DEFAULT_SETTINGS.map(function (r) { return r[0]; });
  if (settings.ga4_id && !/^G-[A-Z0-9]{4,15}$/i.test(String(settings.ga4_id).trim())) {
    throw new Error('GA4 評估 ID 格式應為 G-XXXXXXXXXX');
  }
  if (settings.contact_notify_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(settings.contact_notify_email).trim())) {
    throw new Error('通知信箱格式不正確');
  }
  withLock_(function () {
    var sh = getSpreadsheet_().getSheetByName(SHEETS.settings);
    var data = sh.getDataRange().getValues();
    Object.keys(settings).forEach(function (key) {
      if (allowedKeys.indexOf(key) === -1) return;
      var value = safeCell_(clip_(settings[key], 300));
      var rowIndex = -1;
      for (var i = 1; i < data.length; i++) if (data[i][0] === key) { rowIndex = i + 1; break; }
      if (rowIndex === -1) sh.appendRow([key, value, '']);
      else sh.getRange(rowIndex, 2).setValue(value);
    });
  });
  clearPublicCache_();
  audit_('save_settings', session.email, Object.keys(settings).join(','));
  return { ok: true };
}

// ============================================================
// 圖片上傳到 Google Drive
// ============================================================
function uploadImage_(b, session) {
  var okTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (okTypes.indexOf(b.mimeType) === -1) throw new Error('僅支援 JPG、PNG、WEBP、GIF');
  var bytes = Utilities.base64Decode(String(b.dataBase64 || ''));
  if (bytes.length === 0) throw new Error('檔案是空的');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('圖片不得超過 5MB');
  var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[b.mimeType];
  var name = 'grace-' + Date.now() + '-' + Utilities.getUuid().slice(0, 6) + '.' + ext;
  var folder = getUploadFolder_();
  var file = folder.createFile(Utilities.newBlob(bytes, b.mimeType, name));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  audit_('upload_image', session.email, name);
  return { ok: true, url: 'https://lh3.googleusercontent.com/d/' + file.getId(), fileId: file.getId() };
}

function getUploadFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('UPLOAD_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  var folder = DriveApp.createFolder('Grace Studio 網站圖片');
  props.setProperty('UPLOAD_FOLDER_ID', folder.getId());
  return folder;
}

// ============================================================
// 安全登入
// ============================================================
function passwordPolicyError_(pw) {
  if (!pw || pw.length < 10) return '密碼至少需要 10 碼';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return '密碼需同時包含英文字母與數字';
  if (pw.length > 128) return '密碼太長';
  return '';
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function hashPassword_(password, saltHex, iterations) {
  var key = Utilities.newBlob(saltHex).getBytes();
  var h = Utilities.computeHmacSha256Signature(Utilities.newBlob(password).getBytes(), key);
  for (var i = 1; i < iterations; i++) {
    h = Utilities.computeHmacSha256Signature(h, key);
  }
  return bytesToHex_(h);
}

function randomHex_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function sha256Hex_(str) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8));
}

function safeEqual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function setAdminCredentials_(email, password) {
  var salt = randomHex_();
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    ADMIN_EMAIL: email,
    ADMIN_SALT: salt,
    ADMIN_HASH: hashPassword_(password, salt, HASH_ITERATIONS),
    ADMIN_ITER: String(HASH_ITERATIONS),
    SESSION_EPOCH: String(Date.now()) // 改密碼後舊的登入全部失效
  });
  audit_('set_credentials', email, '');
}

function login_(b) {
  var props = PropertiesService.getScriptProperties();
  var adminEmail = props.getProperty('ADMIN_EMAIL');
  if (!adminEmail) throw new Error('後台尚未設定管理員帳號，請在試算表選單執行「② 設定管理員帳號密碼」');
  var email = clip_(b.email, 150).toLowerCase();
  var password = String(b.password || '').slice(0, 200);
  var cache = CacheService.getScriptCache();
  var lockKey = 'lock_' + sha256Hex_(email);
  var failKey = 'fail_' + sha256Hex_(email);
  if (cache.get(lockKey) || Number(cache.get('fail_global') || 0) >= GLOBAL_FAIL_LIMIT) {
    var e1 = new Error('錯誤次數過多，帳號已暫時鎖定，請 15 分鐘後再試');
    e1.code = 'LOCKED';
    throw e1;
  }
  // 一律計算雜湊，避免用回應時間猜出帳號是否正確
  var hashOk = safeEqual_(hashPassword_(password, props.getProperty('ADMIN_SALT'), Number(props.getProperty('ADMIN_ITER') || HASH_ITERATIONS)), props.getProperty('ADMIN_HASH'));
  var ok = safeEqual_(email, adminEmail) && hashOk;
  if (!ok) {
    var fails = Number(cache.get(failKey) || 0) + 1;
    cache.put(failKey, String(fails), LOCK_SECONDS);
    cache.put('fail_global', String(Number(cache.get('fail_global') || 0) + 1), LOCK_SECONDS);
    if (fails >= LOCK_LIMIT) cache.put(lockKey, '1', LOCK_SECONDS);
    audit_('login_fail', email, '第 ' + fails + ' 次');
    Utilities.sleep(600);
    var e2 = new Error(fails >= LOCK_LIMIT ? '錯誤次數過多，帳號已暫時鎖定 15 分鐘' : '帳號或密碼錯誤（剩餘 ' + (LOCK_LIMIT - fails) + ' 次機會）');
    e2.code = fails >= LOCK_LIMIT ? 'LOCKED' : 'BAD_CREDENTIALS';
    throw e2;
  }
  cache.remove(failKey);
  var token = randomHex_();
  var session = { email: adminEmail, epoch: props.getProperty('SESSION_EPOCH') || '0', created: Date.now() };
  cache.put('sess_' + sha256Hex_(token), JSON.stringify(session), SESSION_TTL);
  audit_('login_ok', adminEmail, '');
  return { ok: true, token: token, email: adminEmail, expires_in: SESSION_TTL };
}

function requireSession_(token) {
  if (!token || String(token).length < 32) {
    var e = new Error('請先登入'); e.code = 'AUTH'; throw e;
  }
  var cache = CacheService.getScriptCache();
  var key = 'sess_' + sha256Hex_(String(token));
  var raw = cache.get(key);
  if (!raw) { var e2 = new Error('登入已過期，請重新登入'); e2.code = 'AUTH'; throw e2; }
  var session = JSON.parse(raw);
  var epoch = PropertiesService.getScriptProperties().getProperty('SESSION_EPOCH') || '0';
  if (session.epoch !== epoch) {
    cache.remove(key);
    var e3 = new Error('登入已失效，請重新登入'); e3.code = 'AUTH'; throw e3;
  }
  cache.put(key, raw, SESSION_TTL); // 有操作就延長
  return session;
}

function logout_(token) {
  CacheService.getScriptCache().remove('sess_' + sha256Hex_(String(token)));
  return { ok: true };
}

function changePassword_(b, session) {
  var props = PropertiesService.getScriptProperties();
  var current = hashPassword_(String(b.oldPassword || ''), props.getProperty('ADMIN_SALT'), Number(props.getProperty('ADMIN_ITER') || HASH_ITERATIONS));
  if (!safeEqual_(current, props.getProperty('ADMIN_HASH'))) throw new Error('目前密碼不正確');
  var err = passwordPolicyError_(String(b.newPassword || ''));
  if (err) throw new Error(err);
  setAdminCredentials_(session.email, String(b.newPassword));
  // 改密碼後發新 Token 給目前裝置
  var token = randomHex_();
  CacheService.getScriptCache().put('sess_' + sha256Hex_(token), JSON.stringify({
    email: session.email, epoch: props.getProperty('SESSION_EPOCH'), created: Date.now()
  }), SESSION_TTL);
  return { ok: true, token: token };
}

// ============================================================
// 試算表工具函式
// ============================================================
function getSheet_(name) {
  var sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('找不到「' + name + '」工作表，請先在試算表選單執行「① 初始化資料表」');
  return sh;
}

function readObjects_(name) {
  var sh = getSheet_(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.join('') === '') continue;
    var obj = {};
    headers.forEach(function (h, j) { if (h) obj[h] = row[j]; });
    out.push(obj);
  }
  return out;
}

function appendObject_(name, obj) {
  var sh = getSheet_(name);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(headers.map(function (h) { return obj[h] === undefined ? '' : safeCell_(obj[h]); }));
}

function findRowById_(name, id) {
  if (!id) return 0;
  var sh = getSheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var col = headers.indexOf('id') + 1;
  var ids = sh.getRange(2, col, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function updateRowById_(name, id, patch) {
  var rowIndex = findRowById_(name, id);
  if (!rowIndex) throw new Error('找不到這筆資料');
  var sh = getSheet_(name);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = sh.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  headers.forEach(function (h, j) {
    if (h !== 'id' && h !== 'created_at' && patch[h] !== undefined) row[j] = safeCell_(patch[h]);
  });
  sh.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
}

function deleteRowById_(name, id, session, event) {
  withLock_(function () {
    var rowIndex = findRowById_(name, id);
    if (!rowIndex) throw new Error('找不到這筆資料');
    getSheet_(name).deleteRow(rowIndex);
  });
  audit_(event, session.email, String(id));
  return { ok: true };
}

function audit_(event, email, detail) {
  try {
    var sh = getSpreadsheet_().getSheetByName(SHEETS.audit);
    if (sh) sh.appendRow([new Date().toISOString(), event, safeCell_(email || ''), safeCell_(String(detail || '').slice(0, 300))]);
  } catch (e) {}
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('系統忙碌中，請稍後再試');
  try { return fn(); } finally { lock.releaseLock(); }
}

// 防止公式注入：=、+、-、@ 開頭的文字前面加上單引號
function safeCell_(v) {
  if (typeof v !== 'string') return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function clip_(v, max) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function isSafeAssetUrl_(u) {
  u = String(u || '').trim();
  if (!u) return false;
  if (/^https:\/\//i.test(u)) return true;
  // 站內相對路徑，例如 images/a.jpg、videos/a.mp4、games/x/index.html
  return /^[\w\-.\/一-鿿%]+$/.test(u) && u.indexOf('..') === -1 && u.indexOf('//') === -1;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
