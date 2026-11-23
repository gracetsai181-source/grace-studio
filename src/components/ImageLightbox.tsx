// ==========================================
// 圖片放大檢視器（Lightbox）
// 電腦：滾輪縮放、雙擊放大、拖曳移動、← → 切換、Esc 關閉
// 手機：雙指縮放、點兩下放大、單指拖曳移動、左右滑動切換
// ==========================================
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { assetUrl } from '../lib/media';

const MIN = 1;
const MAX = 5;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export default function ImageLightbox({ images, startIndex = 0, title = '', onClose }: {
  images: string[];
  startIndex?: number;
  title?: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<any>(null);
  const lastTap = useRef(0);
  const count = images.length;

  const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };
  const go = useCallback((d: number) => {
    if (count < 2) return;
    setIndex((i) => (i + d + count) % count);
    setScale(1); setPos({ x: 0, y: 0 });
  }, [count]);

  // 以某個畫面座標為中心縮放
  const zoomAt = useCallback((next: number, cx?: number, cy?: number) => {
    setScale((prev) => {
      const s = clamp(next, MIN, MAX);
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect || s === 1) { setPos({ x: 0, y: 0 }); return s; }
      const ox = (cx ?? rect.left + rect.width / 2) - (rect.left + rect.width / 2);
      const oy = (cy ?? rect.top + rect.height / 2) - (rect.top + rect.height / 2);
      setPos((p) => ({ x: ox - ((ox - p.x) * s) / prev, y: oy - ((oy - p.y) * s) / prev }));
      return s;
    });
  }, []);

  // 鍵盤操作；用 capture 搶先處理 Esc，避免同時關掉後面的作品視窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['Escape', 'ArrowLeft', 'ArrowRight', '+', '=', '-'].includes(e.key)) e.stopPropagation();
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === '+' || e.key === '=') zoomAt(scale * 1.5);
      else if (e.key === '-') zoomAt(scale / 1.5);
    };
    window.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = prevOverflow; };
  }, [go, onClose, scale, zoomAt]);

  // 滾輪縮放（需要 passive: false 才能阻止頁面捲動）
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((prev) => {
        const s = clamp(prev * (e.deltaY < 0 ? 1.15 : 1 / 1.15), MIN, MAX);
        const rect = el.getBoundingClientRect();
        const ox = e.clientX - (rect.left + rect.width / 2);
        const oy = e.clientY - (rect.top + rect.height / 2);
        setPos((p) => (s === 1 ? { x: 0, y: 0 } : { x: ox - ((ox - p.x) * s) / prev, y: oy - ((oy - p.y) * s) / prev }));
        return s;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const [a, b] = pts;
      gesture.current = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    } else if (pts.length === 1) {
      gesture.current = { type: 'drag', sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(g.scale * (d / g.dist), g.cx, g.cy);
    } else if (g.type === 'drag') {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
      if (scale > 1) setPos({ x: g.px + dx, y: g.py + dy });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (g?.type === 'drag') {
      const dx = e.clientX - g.sx;
      if (scale === 1 && Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); // 沒放大時左右滑動換張
      else if (!g.moved) {
        const now = Date.now();
        if (now - lastTap.current < 300) { zoomAt(scale > 1 ? 1 : 2.5, e.clientX, e.clientY); lastTap.current = 0; }
        else lastTap.current = now;
      }
    }
    gesture.current = pointers.current.size === 1
      ? { type: 'drag', sx: [...pointers.current.values()][0].x, sy: [...pointers.current.values()][0].y, px: pos.x, py: pos.y, moved: true }
      : null;
  };

  const btn = 'w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full bg-black/60 border border-[#B89A70]/50 text-[#E9DDCC] hover:bg-[#B89A70] hover:text-[#29251F] transition-colors text-lg select-none';

  return (
    <div className="fixed inset-0 z-[90] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="圖片放大檢視">
      {/* 上方工具列 */}
      <div className="safe-pt-game px-3 sm:px-5 pb-2 flex items-center justify-between gap-3 text-[#E9DDCC] shrink-0">
        <p className="text-xs sm:text-sm truncate">
          {title}{count > 1 && <span className="ml-2 text-[#B89A70]">{index + 1} / {count}</span>}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" className={btn} onClick={() => zoomAt(scale / 1.5)} aria-label="縮小">−</button>
          <button type="button" className={`${btn} text-xs w-14 sm:w-14 rounded-full`} onClick={reset} aria-label="還原大小">{Math.round(scale * 100)}%</button>
          <button type="button" className={btn} onClick={() => zoomAt(scale * 1.5)} aria-label="放大">＋</button>
          <button type="button" className={btn} onClick={onClose} aria-label="關閉">✕</button>
        </div>
      </div>

      {/* 圖片區 */}
      <div
        ref={stageRef}
        className={`relative flex-1 overflow-hidden ${scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          key={images[index]}
          src={assetUrl(images[index])}
          alt={`${title} ${index + 1}`}
          draggable={false}
          className="absolute inset-0 m-auto max-w-full max-h-full object-contain select-none"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: gesture.current ? 'none' : 'transform 0.15s ease-out'
          }}
        />
        {count > 1 && (
          <>
            <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(-1)} className={`${btn} absolute left-2 sm:left-5 top-1/2 -translate-y-1/2`} aria-label="上一張">‹</button>
            <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => go(1)} className={`${btn} absolute right-2 sm:right-5 top-1/2 -translate-y-1/2`} aria-label="下一張">›</button>
          </>
        )}
      </div>

      <p className="safe-pb-modal pt-2 text-center text-[11px] text-[#E9DDCC]/50 shrink-0 px-4">
        <span className="hidden sm:inline">滾輪縮放・雙擊放大・拖曳移動・Esc 關閉</span>
        <span className="sm:hidden">雙指縮放・點兩下放大・左右滑動換張</span>
      </p>
    </div>
  );
}
