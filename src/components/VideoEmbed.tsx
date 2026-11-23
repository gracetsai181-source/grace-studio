// ==========================================
// 影片直接嵌入元件：作品卡片、作品詳情、後台預覽共用
// 依平台與比例（直式 / 橫式 / 方形）自動調整播放器大小
// ==========================================
import React, { useMemo } from 'react';
import { parseAndValidateVideoUrl, resolveRatio, assetUrl } from '../lib/media';
import { track } from '../lib/analytics';

type Mode = 'card' | 'detail' | 'preview';

const BOX: Record<string, Record<Mode, string>> = {
  // Instagram / TikTok 官方嵌入含帳號列與說明文字，需要較高的框
  instagram: {
    card: 'w-full h-[560px]',
    detail: 'w-full max-w-[440px] mx-auto h-[82vh] max-h-[780px]',
    preview: 'w-full max-w-[360px] mx-auto h-[520px]'
  },
  tiktok: {
    card: 'w-full max-w-[340px] mx-auto h-[580px]',
    detail: 'w-full max-w-[340px] mx-auto h-[82vh] max-h-[760px]',
    preview: 'w-full max-w-[325px] mx-auto h-[560px]'
  },
  fbpost: {
    card: 'w-full h-[520px]',
    detail: 'w-full max-w-[520px] mx-auto h-[80vh] max-h-[700px]',
    preview: 'w-full max-w-[500px] mx-auto h-[480px]'
  },
  portrait: {
    card: 'h-[480px] aspect-[9/16] max-w-full mx-auto',
    detail: 'h-[78vh] max-h-[760px] aspect-[9/16] max-w-full mx-auto',
    preview: 'h-[420px] aspect-[9/16] max-w-full mx-auto'
  },
  square: {
    card: 'w-full max-w-[480px] aspect-square mx-auto',
    detail: 'h-[78vh] max-h-[720px] aspect-square max-w-full mx-auto',
    preview: 'w-full max-w-[360px] aspect-square mx-auto'
  },
  landscape: {
    card: 'w-full aspect-video',
    detail: 'w-full aspect-video',
    preview: 'w-full aspect-video'
  }
};

export function hasPlayableVideo(url: string) {
  const v = parseAndValidateVideoUrl(url);
  return v.isValid && v.kind !== 'none';
}

export default function VideoEmbed({ work, mode = 'card', autoPlay = false }: { work: any; mode?: Mode; autoPlay?: boolean }) {
  const info = useMemo(() => parseAndValidateVideoUrl(work?.video_url || ''), [work?.video_url]);
  if (!info.isValid || info.kind === 'none') return null;

  const ratio = resolveRatio(work, info);
  const isFbPost = info.platform === 'facebook' && info.embedUrl.includes('/post.php');
  const boxKey =
    info.platform === 'instagram' ? 'instagram'
      : info.platform === 'tiktok' ? 'tiktok'
        : isFbPost ? 'fbpost'
          : ratio;
  const box = (BOX[boxKey] || BOX.landscape)[mode];

  if (info.kind === 'video') {
    return (
      <div className="w-full bg-black flex items-center justify-center">
        <div className={box}>
          <video
            src={info.embedUrl}
            poster={work.cover_image ? assetUrl(work.cover_image) : undefined}
            controls
            playsInline
            autoPlay={autoPlay}
            preload="metadata"
            controlsList="nodownload"
            title={work.title}
            onPlay={() => track('video_start', { video_title: work.title, video_provider: 'file', item_id: work.id })}
            className="w-full h-full object-contain bg-black"
          />
        </div>
      </div>
    );
  }

  // Facebook 播放器需要指定寬度，依框的大小調整
  let src = info.embedUrl;
  if (info.platform === 'facebook' && !isFbPost) {
    const w = ratio === 'portrait' ? (mode === 'detail' ? 420 : 270) : 560;
    src = src.replace(/width=\d+/, `width=${w}`);
  }
  if (autoPlay && (info.platform === 'youtube' || info.platform === 'vimeo')) {
    src += (src.includes('?') ? '&' : '?') + 'autoplay=1';
  }

  return (
    <div className="w-full bg-black flex items-center justify-center">
      <div className={box}>
        <iframe
          src={src}
          title={work.title}
          loading={mode === 'card' ? 'lazy' : 'eager'}
          className="w-full h-full border-0 bg-black"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          scrolling={info.platform === 'instagram' || info.platform === 'tiktok' || isFbPost ? 'yes' : 'no'}
        />
      </div>
    </div>
  );
}
