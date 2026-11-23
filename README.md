# GRACE CREATIVE STUDIO 官網（RWD + PWA + Google Sheets 後台）

React + Vite + Tailwind。資料存在 **Google Sheets**，後端是 **Google Apps Script**，網站部署在 **GitHub Pages**。
支援手機/平板/電腦（RWD）、可安裝到手機主畫面並離線瀏覽（PWA）、GA4 流量追蹤與 UTM 來源記錄。

```
grace-studio/
├─ apps-script/Code.gs        ← 貼到 Google Apps Script 的後端程式
├─ public/
│  ├─ config.js               ← ★ 填 Apps Script 網址、GA4 ID（部署後也能直接在 GitHub 改）
│  ├─ manifest.webmanifest    ← PWA 設定（名稱、圖示、顏色）
│  ├─ sw.js                   ← Service Worker（離線快取）
│  ├─ icons/                  ← App 圖示
│  ├─ images/ posters/ videos/ games/
├─ src/
│  ├─ App.tsx                 ← 前台網站
│  ├─ admin/AdminPortal.tsx   ← 管理後台
│  ├─ lib/api.ts              ← 連線 Apps Script
│  ├─ lib/analytics.ts        ← GA4 + UTM
│  ├─ lib/pwa.ts              ← PWA 安裝 / 更新
│  └─ data/initialWorks.ts    ← 內建 10 件作品
└─ .github/workflows/deploy.yml ← 推上 GitHub 後自動部署
```

---

## 第一步：建立 Google 試算表 + Apps Script 後端（約 10 分鐘）

1. 到 [Google 試算表](https://sheets.new) 建立一份新的試算表，命名為「Grace 官網資料庫」。
2. 上方選單 **擴充功能 → Apps Script**。
3. 把左邊 `Code.gs` 原本的內容全部刪掉，貼上本專案 `apps-script/Code.gs` 的全部內容 → 按 💾 儲存。
4. 回到試算表分頁，**重新整理網頁**，上方會出現 **「Grace 後台」** 選單。
5. 點 **Grace 後台 → ① 初始化資料表**
   - 第一次會要求授權：選你的帳號 →「進階」→「前往（不安全）」→「允許」
     （這是你自己寫的程式，Google 才會這樣提示；需要權限是為了寫入試算表、把上傳圖片存到你的雲端硬碟、寄新詢問通知信）
   - 完成後會出現 5 個工作表：`Works`（作品）、`Contacts`（詢問名單）、`UtmLinks`、`Settings`（設定）、`AuditLog`（操作紀錄）
6. 點 **Grace 後台 → ② 設定管理員帳號密碼**：輸入你的 Email 與密碼（至少 10 碼，含英文和數字）。
   > 密碼只會以「加鹽雜湊」存在 Apps Script 的「指令碼屬性」，**不會出現在試算表，也不會出現在網站程式碼裡**。
7. 回到 Apps Script 頁面 → 右上 **部署 → 新增部署作業**
   - 齒輪選 **網頁應用程式**
   - 執行身分：**我**
   - 具有存取權的使用者：**任何人**
   - 按「部署」→ 複製 **網頁應用程式網址**（`https://script.google.com/macros/s/……/exec`）

> ⚠️ 之後如果修改了 `Code.gs`，要到 **部署 → 管理部署作業 → ✏️ 編輯 → 版本選「新版本」→ 部署**，網址不變，新程式才會生效。

## 第二步：填入連線設定

打開 `public/config.js`，把剛剛的網址貼進 `gasUrl`：

```js
window.GRACE_CONFIG = {
  gasUrl: 'https://script.google.com/macros/s/AKfycbx……/exec',
  ga4Id: ''   // 可以留空，之後在後台「網站設定」填
};
```

## 第三步：上傳到 GitHub 並部署

1. 在 GitHub 建立新 repo（例如 `grace-studio`），**不要**勾選加入 README。
2. 在本資料夾執行：
   ```bash
   git init
   git add .
   git commit -m "first commit"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/grace-studio.git
   git push -u origin main
   ```
   （不想用指令也可以：在 repo 頁面按「uploading an existing file」，把資料夾內所有檔案拖進去，**包含 `.github` 資料夾**。）
3. repo 的 **Settings → Pages → Source** 選 **GitHub Actions**。
4. 到 **Actions** 分頁，等綠色勾勾出現（約 1～2 分鐘）。
5. 網址：`https://<你的帳號>.github.io/grace-studio/`
6. 後台：`https://<你的帳號>.github.io/grace-studio/#/admin`（頁尾也有「管理員登入」）

## 第四步：第一次登入後台

1. 用第一步設定的 Email + 密碼登入。
2. 「總覽」會提示 `Works` 是空的 → 按 **一鍵匯入內建作品**，原本網站上的 10 件作品就會寫進試算表，之後都能在後台編輯。
3. 「網站設定」填入 GA4 評估 ID（見下方）、需要的話填「新詢問通知信箱」。

---

## 後台功能

| 分頁 | 功能 |
|---|---|
| 總覽 | 作品數、詢問數、成交數；詢問來源（UTM source/medium）與活動（campaign）排行 |
| 作品管理 | 新增 / 編輯 / 刪除 / 草稿與發布切換、排序、精選；封面與細節圖上傳（自動壓縮後存到你的 Google Drive）；YouTube / IG / FB / TikTok / Vimeo / 雲端硬碟 / mp4 影片直接嵌入，貼網址即時預覽，可選 **直式 9:16 / 橫式 16:9 / 方形 / 自動** |
| 詢問名單 | 前台表單送來的資料（含 UTM 來源、首次來源、到達頁）；改處理狀態、寫備註、搜尋、匯出 CSV |
| UTM 產生器 | 選平台快速帶入、產生追蹤連結、複製、存到試算表，並顯示每個連結帶來幾筆詢問 |
| 網站設定 | GA4 評估 ID、網站標題、新詢問通知信箱（改完不用重新部署） |
| 帳號安全 | 修改密碼（其他裝置自動登出）、查看登入與操作紀錄 |

## 安全設計

- 密碼：Apps Script 指令碼屬性只存「隨機鹽 + 2000 次 HMAC-SHA256」的雜湊值。
- 登入成功取得隨機 Token（6 小時、有操作就延長），存在瀏覽器 `sessionStorage`，關閉分頁即清除；前端閒置 60 分鐘自動登出。
- 同一帳號連續錯 5 次鎖定 15 分鐘；全站 15 分鐘內錯 30 次暫停登入。
- 所有寫入都在 Apps Script 端再次驗證：只接受 `https://` 網址或站內路徑（擋掉 `javascript:` 等）、限制長度、防止試算表公式注入。
- 聯絡表單有隱藏防機器人欄位、最短填寫時間與每 10 分鐘送出上限。
- 正式網站加上 Content-Security-Policy，只允許必要的外部來源（Google 字型、GA4、Apps Script、YouTube / IG / FB / TikTok / Vimeo / 雲端硬碟影片嵌入）。
- 試算表選單「強制登出所有後台裝置」可讓所有 Token 立即失效。
- **忘記密碼**：打開試算表 → Grace 後台 → ② 設定管理員帳號密碼，重新設定即可。

> 請不要把試算表共用給他人編輯；網站訪客只能透過 Apps Script 讀到「已發布作品」和 GA4 ID，看不到詢問名單。

## GA4 與 UTM

**GA4 設定**
1. [Google Analytics](https://analytics.google.com/) →「管理」→ 建立資源 → 資料串流選「網站」→ 填你的 GitHub Pages 網址。
2. 複製「評估 ID」（`G-` 開頭）→ 貼到後台「網站設定」（或 `public/config.js` 的 `ga4Id`）。
3. 打開網站，到 GA4「報表 → 即時」確認有 1 位使用者。
4. 到 GA4「管理 → 事件」，把 `generate_lead` 標示為 **關鍵事件**（= 表單轉換）。

**網站會送出的事件**

| 事件 | 時機 |
|---|---|
| `page_view` | 進站（含 UTM 參數，GA4 自動歸因來源） |
| `view_item` | 打開作品詳情 |
| `video_start` | 播放站內影片 |
| `play_game` | 開始玩互動遊戲 |
| `click_outbound` | 點影片下方「到原平台觀看」備用連結 |
| `select_content` | 切換作品分類 |
| `generate_lead` | 成功送出專案諮詢表單 |
| `pwa_install` | 安裝到主畫面 |

後台頁面（`#/admin`）不會送任何 GA4 事件，避免自己的操作污染數據。

**UTM**
- 訪客帶著 `?utm_source=…&utm_medium=…&utm_campaign=…` 進站時，網站會記錄「首次來源」與「最後來源」（保存 90 天）。
- 沒有 UTM 但從其他網站點進來，會自動記為 `referral` 或 `organic`；Google / Meta 廣告的 `gclid`、`fbclid` 也會記錄。
- 訪客送出表單時，這些來源會一起寫進 `Contacts` 工作表，在後台「詢問名單」和「總覽」就能看到哪個管道帶來詢問。
- 從手機主畫面打開 App 會標記為 `utm_source=pwa`。

## 日常操作

- **新增作品**：後台 → 作品管理 → 新增作品（不用重新部署，存檔後網站重新整理就看得到）。
- **影片（全部直接嵌入網頁播放，不會跳到其他網站）**：後台「影片」欄可貼
  - YouTube（一般影片 / Shorts / 直播）、Instagram（貼文 / Reels）、Facebook（影片 / Reels / 分享連結 / fb.watch）、TikTok（完整網址）、Vimeo、Google 雲端硬碟影片
  - 站內影片：mp4 放進 `public/videos/` 推上 GitHub，填 `videos/檔名.mp4`（單檔小於 100MB）
  - 其他 https 開頭的 .mp4 直連網址
  - 大檔建議：上傳 YouTube 設「不公開」，或放 Google 雲端硬碟並把共用設為「知道連結的任何人」
  - 貼上網址後，後台會立即顯示網站上的實際播放效果；比例可選直式 9:16 / 橫式 16:9 / 方形 / 自動
  - Instagram / Facebook 影片必須是「公開」帳號的公開貼文才能嵌入播放
- **換 Apps Script 網址或 GA4**：直接在 GitHub 網頁上編輯 `public/config.js` → Commit，會自動重新部署。
- **改 App 名稱、顏色**：`public/manifest.webmanifest`；圖示在 `public/icons/`。
- **網站更新後**：已安裝 App 的訪客會看到「網站有新版本 → 立即更新」提示。

## 本機開發（選用）

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 產生 dist/
npm run preview  # 預覽正式版（PWA / Service Worker 只在正式版啟用）
```
