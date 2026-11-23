import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// 正式建置時才加上 CSP 安全標頭（開發模式的熱更新需要 inline script）
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://www.instagram.com https://www.facebook.com https://www.tiktok.com https://player.vimeo.com https://drive.google.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join('; ');

function gracePwa() {
  let outDir = 'dist';
  return {
    name: 'grace-pwa',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    transformIndexHtml(html) {
      // 放在 charset 之後（charset 必須在檔案最前面 1024 bytes 內）
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      );
    },
    // 建置完成後：替換 sw.js 版本號，並把打包後的 JS/CSS 加入離線快取清單
    closeBundle() {
      const swPath = path.resolve(outDir, 'sw.js');
      if (!fs.existsSync(swPath)) return;
      const assetsDir = path.resolve(outDir, 'assets');
      const assets = fs.existsSync(assetsDir)
        ? fs.readdirSync(assetsDir).filter((f) => /\.(js|css|woff2?)$/.test(f)).map((f) => `./assets/${f}`)
        : [];
      const sw = fs.readFileSync(swPath, 'utf8')
        .replace("'__BUILD_ID__'", `'${Date.now()}'`)
        .replace('/*__PRECACHE__*/[]', JSON.stringify(assets));
      fs.writeFileSync(swPath, sw);
    }
  };
}

// base './' 讓網站不論放在 username.github.io/任何repo名稱/ 都能正確載入
export default defineConfig({
  base: './',
  plugins: [react(), gracePwa()],
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900
  }
});
