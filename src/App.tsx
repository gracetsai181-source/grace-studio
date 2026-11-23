import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Star, ChevronRight, Play, CheckCircle2 } from 'lucide-react';
import { INITIAL_WORKS } from './data/initialWorks';
import { assetUrl, safeHref, parseAndValidateVideoUrl, PLATFORM_LABEL } from './lib/media';
import VideoEmbed, { hasPlayableVideo } from './components/VideoEmbed';
import { GAS_READY, CONFIG_GA4_ID } from './lib/config';
import { callApi, fetchPublicData, readCachedPublic } from './lib/api';
import { captureUtm, getAttribution, initGA4, track, trackPageView } from './lib/analytics';
import { useUpdateAvailable, useInstallPrompt, applyUpdate } from './lib/pwa';
import AdminPortal from './admin/AdminPortal';

// ==========================================
// 通用元件：安全社群影片與多圖預覽嵌入元件 (階段四)
// ==========================================
const SafeMediaDisplay = ({ work, onOpenDetail, onPlayGame }) => {
  const [imgSrc, setImgSrc] = useState(assetUrl(work.cover_image));
  const playable = useMemo(() => hasPlayableVideo(work.video_url), [work.video_url]);

  return (
    <div className="group relative flex flex-col bg-[#1c1813] border border-[#B89A70]/15 hover:border-[#B89A70]/50 rounded-sm overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all duration-500 h-full">
      {/* 精選徽章 */}
      {work.is_featured && (
        <div className="pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-1 bg-[#29251F]/90 backdrop-blur-md border border-[#B89A70]/60 text-[#B89A70] px-2.5 py-1 text-[11px] tracking-widest uppercase rounded-sm shadow-lg">
          <Star className="w-3 h-3 fill-[#B89A70]" /> 精選作品
        </div>
      )}

      {/* 分類標籤 */}
      <div className="pointer-events-none absolute top-3 right-3 z-20 bg-[#1c1813]/85 backdrop-blur-md border border-[#E9DDCC]/20 text-[#E9DDCC] px-2.5 py-1 text-[11px] tracking-wider rounded-sm">
        {work.category}
      </div>

      {/* 媒體顯示區：有影片就直接在卡片內播放（站內影片、YouTube、IG、FB、TikTok、Vimeo、雲端硬碟） */}
      <div className="relative w-full overflow-hidden bg-[#14110e] flex items-center justify-center">
        {playable ? (
          <VideoEmbed work={work} mode="card" />
        ) : (
          <div className="relative w-full h-[260px] sm:h-[320px] overflow-hidden cursor-pointer" onClick={() => onOpenDetail(work)}>
            <img
              src={imgSrc}
              alt={work.title}
              loading="lazy"
              decoding="async"
              onError={() => {
                if (work.fallback_cover && imgSrc !== work.fallback_cover) {
                  setImgSrc(work.fallback_cover);
                } else {
                  setImgSrc('https://placehold.co/800x600/29251F/B89A70?text=GRACE+CREATIVE+STUDIO');
                }
              }}
              className="w-full h-full object-cover object-top transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1c1813] via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />
          </div>
        )}
      </div>

      {/* 作品資訊內容區 */}
      <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between bg-gradient-to-b from-[#1c1813] to-[#231f1a]">
        <div>
          <h3 
            onClick={() => onOpenDetail(work)}
            className="text-lg font-medium text-white group-hover:text-[#B89A70] transition-colors cursor-pointer mb-2 tracking-wide"
          >
            {work.title}
          </h3>
          <p className="text-[#E9DDCC]/75 text-sm font-light leading-relaxed line-clamp-3 mb-4">
            {work.description}
          </p>
        </div>

        <div className="pt-4 border-t border-[#B89A70]/10 flex items-center justify-end text-xs text-[#E9DDCC]/60">
          {work.external_url && (
            <button
              type="button"
              onClick={() => onPlayGame && onPlayGame(work)}
              className="mr-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#B89A70] text-[#29251F] font-medium tracking-wider rounded-sm hover:bg-[#d1b894] transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-[#29251F]" /> 立即試玩
            </button>
          )}
          <button
            onClick={() => onOpenDetail(work)}
            className="inline-flex items-center gap-1 text-[#B89A70] hover:text-[#E9DDCC] tracking-widest uppercase transition-colors shrink-0"
          >
            完整設定 <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 主應用程式組件
// ==========================================
export default function App() {
  // SPA 路由狀態 ('/' 為公開前台, '/admin' 為管理後台)
  const [currentPath, setCurrentPath] = useState(() => {
    return window.location.hash === '#/admin' ? '/admin' : '/';
  });

  // 導覽切換函式 (支援 History API 與 SPA 路由)
  const navigateTo = (path: string) => {
    try {
      // GitHub Pages 不支援 /admin 這種路徑 (重新整理會 404)，改用 #/admin
      window.location.hash = path === '/admin' ? '/admin' : '/';
    } catch (e) {
      // 於 iframe 沙盒環境中安全降級
    }
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(window.location.hash === '#/admin' ? '/admin' : '/');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // ==========================================
  // GA4 + UTM：config.js 有設定就立即載入，否則用後台「網站設定」的 GA4 ID
  // ==========================================
  useEffect(() => {
    captureUtm();
    if (CONFIG_GA4_ID) initGA4(CONFIG_GA4_ID);
  }, []);
  const firstPageView = useRef(true);
  useEffect(() => {
    if (firstPageView.current) { firstPageView.current = false; return; } // 第一次由 GA4 config 自動送出
    trackPageView(currentPath);
  }, [currentPath]);

  // 作品集狀態管理：先顯示上次快取（PWA 離線也能看），沒有快取就用內建作品
  const [works, setWorks] = useState(() => {
    const cached = readCachedPublic();
    return cached && Array.isArray(cached.works) && cached.works.length > 0 ? cached.works : INITIAL_WORKS;
  });
  const [dataSource, setDataSource] = useState(GAS_READY ? 'loading' : 'builtin');
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [activeWorkDetail, setActiveWorkDetail] = useState(null);
  const [playingGame, setPlayingGame] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const updateAvailable = useUpdateAvailable();
  const { canInstall, promptInstall, showIOSHint } = useInstallPrompt();
  const [showIOSTip, setShowIOSTip] = useState(false);
  const handleInstall = async () => {
    if (canInstall) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') track('pwa_install');
    } else if (showIOSHint) {
      setShowIOSTip(true);
    }
  };

  // 聯絡我們 Google Sheets 表單狀態
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    contactInfo: '',
    service: 'AI 角色 IP 設計與虛擬主播製作',
    budget: '2000-10000',
    message: ''
  });
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const formStartedAt = useRef(Date.now());

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3200);
  };

  // 處理聯絡表單送出至 Google Sheets
  const handleContactSubmit = async (e) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      showToast('請完整填寫姓名、信箱與專案需求內容');
      return;
    }
    if (!GAS_READY) {
      showToast('表單尚未連線 Google Sheets，請直接來信聯絡我們');
      return;
    }

    setIsSubmittingContact(true);
    const attribution = getAttribution();
    try {
      await callApi('contact', {
        name: contactForm.name.trim(),
        email: contactForm.email.trim(),
        contactInfo: contactForm.contactInfo.trim(),
        service: contactForm.service,
        budget: contactForm.budget,
        message: contactForm.message.trim(),
        hp: honeypot,
        elapsed: Date.now() - formStartedAt.current,
        ...attribution
      });
      track('generate_lead', {
        lead_source: 'contact_form',
        service: contactForm.service,
        budget: contactForm.budget,
        campaign_source: attribution.utm.utm_source || '(direct)'
      });
      setContactSubmitted(true);
      setContactForm({
        name: '',
        email: '',
        contactInfo: '',
        service: 'AI 角色 IP 設計與虛擬主播製作',
        budget: '2000-10000',
        message: ''
      });
      showToast('感謝您的諮詢！我們已收到您的需求');
    } catch (err: any) {
      showToast(err?.message || '送出時發生異常，請稍後再試或直接來信');
    } finally {
      setIsSubmittingContact(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 按 Esc 關閉遊戲視窗
  useEffect(() => {
    if (!playingGame) return;
    const onKey = (e) => { if (e.key === 'Escape') setPlayingGame(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playingGame]);

  // 按 Esc 關閉作品詳情視窗
  useEffect(() => {
    if (!activeWorkDetail) return;
    const onKey = (e) => { if (e.key === 'Escape') setActiveWorkDetail(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeWorkDetail]);

  // 從 Google Sheets 讀取公開作品與設定（GA4 ID 可在後台修改，不用重新部署）
  const refreshPublic = async () => {
    const data = await fetchPublicData();
    if (!data) { setDataSource(GAS_READY ? 'offline' : 'builtin'); return; }
    if (Array.isArray(data.works) && data.works.length > 0) setWorks(data.works);
    else if (!data.fromCache) setWorks(INITIAL_WORKS);
    setDataSource(data.fromCache ? 'offline' : data.works.length > 0 ? 'sheets' : 'builtin');
    if (!CONFIG_GA4_ID && data.settings?.ga4_id) initGA4(data.settings.ga4_id);
  };
  useEffect(() => { refreshPublic(); }, []);

  const openWorkDetail = (work) => {
    setActiveWorkDetail(work);
    track('view_item', { item_id: work.id, item_name: work.title, item_category: work.category });
  };
  const openGame = (work) => {
    setPlayingGame(work);
    track('play_game', { item_id: work.id, item_name: work.title });
  };

  // 公開訪客僅能看到 status === 'published' 的作品，並依 sort_order 排序
  const publishedWorks = useMemo(() => {
    return works
      .filter(w => w.status === 'published')
      .sort((a, b) => (Number(a.sort_order) || 99) - (Number(b.sort_order) || 99));
  }, [works]);

  const filteredPublicWorks = useMemo(() => {
    if (selectedCategory === '全部') return publishedWorks;
    return publishedWorks.filter(w => w.category === selectedCategory);
  }, [publishedWorks, selectedCategory]);

  const categories = useMemo(() => {
    return ['全部', ...Array.from(new Set(publishedWorks.map(w => w.category).filter(Boolean)))];
  }, [publishedWorks]);

  const detailVideo = useMemo(() => parseAndValidateVideoUrl(activeWorkDetail?.video_url || ''), [activeWorkDetail]);

  return (
    <div 
      className="min-h-screen bg-[#29251F] text-white antialiased selection:bg-[#B89A70] selection:text-[#29251F]"
      style={{ fontFamily: '"Noto Sans TC", sans-serif' }}
    >
      {/* 內嵌原版視覺特效 CSS */}
      <style>{`
        .font-serif-grace { font-family: "Playfair Display", serif; }
        .text-gradient-gold {
          background: linear-gradient(to right, #B89A70, #E9DDCC, #B89A70);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          background-size: 200% auto;
          animation: graceShine 4s linear infinite;
        }
        @keyframes graceShine {
          to { background-position: 200% center; }
        }
        .bg-hero-glow {
          background: radial-gradient(circle at center, rgba(184, 154, 112, 0.16) 0%, rgba(41, 37, 31, 1) 70%);
        }
      `}</style>

      {/* 根據路由渲染「/admin 真正管理後台」或「保留原版視覺的公開前台」 */}
      {currentPath === '/admin' ? (
        <AdminPortal
          showToast={showToast}
          navigateTo={navigateTo}
          onPublicChanged={refreshPublic}
        />
      ) : (
        <>
          {/* ==================== 原版導覽列 Navbar ==================== */}
          <nav
            className={`sticky top-0 w-full z-40 transition-all duration-300 backdrop-blur-md border-b border-[#B89A70]/10 ${
              scrolled ? 'bg-[#29251F]/95 shadow-lg' : 'bg-[#29251F]/80'
            }`}
          >
            <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-12 h-16 md:h-20 flex items-center justify-between">
              <a
                href="#home"
                className="font-serif-grace text-2xl tracking-widest text-white hover:text-[#B89A70] transition-colors duration-300"
              >
                GRACE<span className="text-[#B89A70]">.</span>
              </a>

              {/* Desktop Menu */}
              <div className="hidden md:flex items-center space-x-10 text-sm font-medium tracking-wider text-[#E9DDCC]">
                <a href="#home" className="hover:text-[#B89A70] transition-colors duration-300 relative group">
                  關於我們
                  <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-[#B89A70] transition-all duration-300 group-hover:w-full"></span>
                </a>
                <a href="#story" className="hover:text-[#B89A70] transition-colors duration-300 relative group">
                  品牌故事
                  <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-[#B89A70] transition-all duration-300 group-hover:w-full"></span>
                </a>
                <a href="#services" className="hover:text-[#B89A70] transition-colors duration-300 relative group">
                  服務項目
                  <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-[#B89A70] transition-all duration-300 group-hover:w-full"></span>
                </a>
                <a href="#portfolio" className="hover:text-[#B89A70] transition-colors duration-300 relative group">
                  作品集
                  <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-[#B89A70] transition-all duration-300 group-hover:w-full"></span>
                </a>
                <a href="#contact" className="hover:text-[#B89A70] transition-colors duration-300 relative group">
                  聯絡我們
                  <span className="absolute -bottom-1 left-0 w-0 h-[1px] bg-[#B89A70] transition-all duration-300 group-hover:w-full"></span>
                </a>
                {(canInstall || showIOSHint) && (
                  <button
                    type="button"
                    onClick={handleInstall}
                    className="px-3 py-1.5 border border-[#B89A70]/60 text-[#B89A70] hover:bg-[#B89A70] hover:text-[#29251F] rounded-sm text-xs tracking-widest transition-colors"
                  >
                    安裝 App
                  </button>
                )}
              </div>

              {/* Mobile Menu Button */}
              <button
                className="md:hidden text-[#E9DDCC] focus:outline-none p-2 -mr-2"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="開啟選單"
                aria-expanded={mobileMenuOpen}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
              <div className="md:hidden absolute top-16 left-0 w-full bg-[#1c1813]/95 backdrop-blur-lg border-b border-[#B89A70]/10 flex flex-col items-center py-6 space-y-6 shadow-2xl">
                <a href="#home" onClick={() => setMobileMenuOpen(false)} className="text-[#E9DDCC] hover:text-[#B89A70]">關於我們</a>
                <a href="#story" onClick={() => setMobileMenuOpen(false)} className="text-[#E9DDCC] hover:text-[#B89A70]">品牌故事</a>
                <a href="#services" onClick={() => setMobileMenuOpen(false)} className="text-[#E9DDCC] hover:text-[#B89A70]">服務項目</a>
                <a href="#portfolio" onClick={() => setMobileMenuOpen(false)} className="text-[#E9DDCC] hover:text-[#B89A70]">作品集</a>
                <a href="#contact" onClick={() => setMobileMenuOpen(false)} className="text-[#E9DDCC] hover:text-[#B89A70]">聯絡我們</a>
                {(canInstall || showIOSHint) && (
                  <button type="button" onClick={() => { setMobileMenuOpen(false); handleInstall(); }} className="px-5 py-2 border border-[#B89A70] text-[#B89A70] rounded-sm text-sm tracking-widest">
                    安裝到手機主畫面
                  </button>
                )}
              </div>
            )}
          </nav>

          {/* ==================== 原版首頁主視覺 Hero Section ==================== */}
          <header id="home" className="relative min-h-[78vh] md:min-h-[88vh] py-16 flex items-center justify-center bg-[#29251F] overflow-hidden">
            <div className="absolute inset-0 z-0 opacity-20">
              <img
                src={assetUrl('images/優雅金韻品牌識別展板.png')}
                alt="Grace Creative Background"
                onError={(e) => {
                  e.currentTarget.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1920&q=80';
                }}
                className="w-full h-full object-cover object-center mix-blend-luminosity filter blur-[2px]"
              />
            </div>
            <div className="absolute inset-0 bg-hero-glow z-0" />

            <div className="relative z-10 text-center px-6 max-w-4xl mx-auto flex flex-col items-center">
              <span className="text-[#B89A70] tracking-[0.3em] text-sm md:text-base font-medium mb-6 block">
                絹・創意工作室
              </span>

              <h1 className="font-serif-grace text-[2.6rem] sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-6 leading-tight">
                <span className="text-gradient-gold">Create Beyond</span>
                <br />
                <span>Imagination.</span>
              </h1>

              <p className="text-[#E9DDCC] text-lg md:text-2xl font-light mb-4 tracking-wider">
                創意無界，讓想像成真。
              </p>

              <p className="text-[#E9DDCC]/70 text-sm md:text-base mb-12 max-w-xl mx-auto leading-relaxed">
                AI 創意設計與視覺敘事工作室。專注於打造具備電影感、精緻且極具品牌渲染力的視覺體驗。
              </p>

              <a
                href="#portfolio"
                className="inline-block px-8 sm:px-10 py-4 border border-[#B89A70] text-[#B89A70] hover:bg-[#B89A70] hover:text-[#29251F] transition-all duration-500 tracking-widest text-sm uppercase rounded-sm"
              >
                探索無限可能
              </a>
            </div>
          </header>

          {/* ==================== 品牌故事 Brand Story (品牌影片) ==================== */}
          <section id="story" className="py-16 md:py-28 bg-[#29251F] relative border-t border-[#B89A70]/10">
            <div className="max-w-6xl mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-14 items-center">
              <div className="lg:col-span-3 rounded-sm overflow-hidden border border-[#B89A70]/25 bg-black shadow-2xl">
                <video
                  onPlay={() => track('video_start', { video_title: '品牌故事', video_provider: 'file' })}
                  src={assetUrl('videos/brand-story.mp4')}
                  poster={assetUrl('posters/brand-story.jpg')}
                  controls
                  playsInline
                  preload="none"
                  title="品牌故事影片：探索無限可能"
                  className="w-full aspect-video bg-black"
                />
              </div>
              <div className="lg:col-span-2">
                <span className="text-[#B89A70] tracking-[0.3em] text-xs font-medium">BRAND STORY</span>
                <h2 className="font-serif-grace text-4xl md:text-5xl text-white mt-4 mb-6 leading-tight">
                  我們用光影說故事
                </h2>
                <p className="text-[#E9DDCC] font-light leading-relaxed mb-4">
                  當一縷微光悄悄點亮靈感，想像就有了形狀。絹・創意工作室以 AI 影像、角色設計與動態敘事，為品牌打造具電影感、有溫度的視覺語言。
                </p>
                <p className="text-[#E9DDCC]/80 font-light leading-relaxed mb-8">
                  每一個細節，都是為品牌打造的質感。從角色 IP、短影音到虛擬主播與互動體驗，讓想像成真。
                </p>
                <a
                  href="#portfolio"
                  className="inline-block px-8 py-3 border border-[#B89A70] text-[#B89A70] hover:bg-[#B89A70] hover:text-[#29251F] transition-all duration-500 tracking-widest text-sm rounded-sm"
                >
                  探索無限可能
                </a>
              </div>
            </div>
          </section>

          {/* ==================== 原版服務項目區塊 Services Section ==================== */}
          <section id="services" className="py-16 md:py-32 bg-[#1c1813] relative">
            <div className="max-w-7xl mx-auto px-6 lg:px-12 relative z-10">
              <div className="text-center mb-12 md:mb-20">
                <h2 className="font-serif-grace text-4xl md:text-5xl text-white mb-4">Our Services</h2>
                <div className="w-16 h-[1px] bg-[#B89A70] mx-auto mb-6" />
                <p className="text-[#E9DDCC] tracking-widest text-sm md:text-base">專業視覺與數位接案方案</p>
              </div>

              {/* Services Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-8">
                {/* Service Card 1: AI 角色與虛擬主播 */}
                <div className="group relative p-7 sm:p-10 bg-[#29251F] border border-[#B89A70]/10 hover:border-[#B89A70]/50 transition-all duration-500 rounded-sm hover:-translate-y-2 overflow-hidden flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full border border-[#B89A70]/30 flex items-center justify-center mb-8 text-[#B89A70] group-hover:scale-110 transition-transform duration-500 group-hover:bg-[#B89A70]/10">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M21 21v-2a4 4 0 00-3-3.87M9 3.13A4 4 0 005 7v12" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-medium text-white mb-4 tracking-wide">
                    AI 角色 IP 設計<br />
                    <span className="text-[#B89A70] text-lg">與虛擬主播製作</span>
                  </h3>
                  <p className="text-[#E9DDCC]/70 text-sm leading-relaxed font-light mb-5">
                    量身打造品牌吉祥物與虛擬代言人（Avatar），支援自然表情對話、商品導購影片與三視圖周邊延伸，為品牌注入鮮明靈魂。
                  </p>
                  <div className="mt-auto pt-4 border-t border-[#B89A70]/15 w-full flex flex-wrap justify-center gap-1.5 text-[11px] text-[#B89A70]/90">
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">角色 IP 設定</span>
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">AI 虛擬主播</span>
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">商品行銷短片</span>
                  </div>
                </div>

                {/* Service Card 2: AI 電影感短影音與原創配樂 */}
                <div className="group relative p-7 sm:p-10 bg-[#29251F] border border-[#B89A70]/10 hover:border-[#B89A70]/50 transition-all duration-500 rounded-sm hover:-translate-y-2 overflow-hidden flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full border border-[#B89A70]/30 flex items-center justify-center mb-8 text-[#B89A70] group-hover:scale-110 transition-transform duration-500 group-hover:bg-[#B89A70]/10">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-medium text-white mb-4 tracking-wide">
                    AI 電影感短影音<br />
                    <span className="text-[#B89A70] text-lg">與商用配樂製作</span>
                  </h3>
                  <p className="text-[#E9DDCC]/70 text-sm leading-relaxed font-light mb-5">
                    精準控管分鏡時間軸與畫面風格一致性，結合 AI 商用原創音樂製作，產出具備電影級張力的品牌形象片與社群短影音。
                  </p>
                  <div className="mt-auto pt-4 border-t border-[#B89A70]/15 w-full flex flex-wrap justify-center gap-1.5 text-[11px] text-[#B89A70]/90">
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">電影場景分鏡</span>
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">高一致性動畫</span>
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">AI 商用配樂</span>
                  </div>
                </div>

                {/* Service Card 3: AR/VR 虛擬實境與 360 互動體驗 */}
                <div className="group relative p-7 sm:p-10 bg-[#29251F] border border-[#B89A70]/10 hover:border-[#B89A70]/50 transition-all duration-500 rounded-sm hover:-translate-y-2 overflow-hidden flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full border border-[#B89A70]/30 flex items-center justify-center mb-8 text-[#B89A70] group-hover:scale-110 transition-transform duration-500 group-hover:bg-[#B89A70]/10">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-medium text-white mb-4 tracking-wide">
                    AR / VR 延展實境<br />
                    <span className="text-[#B89A70] text-lg">與 360 互動空間</span>
                  </h3>
                  <p className="text-[#E9DDCC]/70 text-sm leading-relaxed font-light mb-5">
                    打造 WebAR 擴增實境互動、VR 虛擬展間、360 環景導覽與邏輯互動設計，無縫串接前端網頁打造沉浸式品牌體驗。
                  </p>
                  <div className="mt-auto pt-4 border-t border-[#B89A70]/15 w-full flex flex-wrap justify-center gap-1.5 text-[11px] text-[#B89A70]/90">
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">AR / VR 體驗</span>
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">360 環景導覽</span>
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">互動邏輯串接</span>
                  </div>
                </div>

                {/* Service Card 4: 品牌官網與 PWA 網站設計 */}
                <div className="group relative p-7 sm:p-10 bg-[#29251F] border border-[#B89A70]/10 hover:border-[#B89A70]/50 transition-all duration-500 rounded-sm hover:-translate-y-2 overflow-hidden flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full border border-[#B89A70]/30 flex items-center justify-center mb-8 text-[#B89A70] group-hover:scale-110 transition-transform duration-500 group-hover:bg-[#B89A70]/10">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-medium text-white mb-4 tracking-wide">
                    品牌官網與 PWA<br />
                    <span className="text-[#B89A70] text-lg">互動網站設計</span>
                  </h3>
                  <p className="text-[#E9DDCC]/70 text-sm leading-relaxed font-light mb-5">
                    製作支援跨裝置響應式（RWD）與類 App 體驗（PWA）的高質感品牌網站與前端互動小遊戲，打造流暢且具電影感的視覺瀏覽體驗。
                  </p>
                  <div className="mt-auto pt-4 border-t border-[#B89A70]/15 w-full flex flex-wrap justify-center gap-1.5 text-[11px] text-[#B89A70]/90">
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">RWD + PWA 網站</span>
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">品牌互動遊戲</span>
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">高質感前端視覺</span>
                  </div>
                </div>

                {/* Service Card 5: LINE 官方帳號與自動化行銷系統 */}
                <div className="group relative p-7 sm:p-10 bg-[#29251F] border border-[#B89A70]/10 hover:border-[#B89A70]/50 transition-all duration-500 rounded-sm hover:-translate-y-2 overflow-hidden flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full border border-[#B89A70]/30 flex items-center justify-center mb-8 text-[#B89A70] group-hover:scale-110 transition-transform duration-500 group-hover:bg-[#B89A70]/10">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-medium text-white mb-4 tracking-wide">
                    LINE 官方帳號<br />
                    <span className="text-[#B89A70] text-lg">與自動化工作流串接</span>
                  </h3>
                  <p className="text-[#E9DDCC]/70 text-sm leading-relaxed font-light mb-5">
                    客製化多頁式圖文選單設計與 LINE Bot 開發，透過自動化流程串接 Google 試算表，輕鬆實現行銷庫存管理與機台保養提醒。
                  </p>
                  <div className="mt-auto pt-4 border-t border-[#B89A70]/15 w-full flex flex-wrap justify-center gap-1.5 text-[11px] text-[#B89A70]/90">
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">多頁圖文選單</span>
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">LINE Bot 開發</span>
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">自動化表單串接</span>
                  </div>
                </div>

                {/* Service Card 6: 社群輿情洞察、GA4 和 UTM 監測流量參數 */}
                <div className="group relative p-7 sm:p-10 bg-[#29251F] border border-[#B89A70]/10 hover:border-[#B89A70]/50 transition-all duration-500 rounded-sm hover:-translate-y-2 overflow-hidden flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full border border-[#B89A70]/30 flex items-center justify-center mb-8 text-[#B89A70] group-hover:scale-110 transition-transform duration-500 group-hover:bg-[#B89A70]/10">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-medium text-white mb-4 tracking-wide">
                    社群輿情洞察<br />
                    <span className="text-[#B89A70] text-lg">GA4 和 UTM 監測流量參數</span>
                  </h3>
                  <p className="text-[#E9DDCC]/70 text-sm leading-relaxed font-light mb-5">
                    結合 FB/IG 社群輿情與文字雲分析、GA4 訪客行為追蹤與 UTM 流量來源參數設定，精準掌握各行銷管道轉換成效。
                  </p>
                  <div className="mt-auto pt-4 border-t border-[#B89A70]/15 w-full flex flex-wrap justify-center gap-1.5 text-[11px] text-[#B89A70]/90">
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">FB/IG 輿情分析</span>
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">GA4 流量追蹤</span>
                    <span className="px-2 py-0.5 bg-[#1c1813] rounded-sm">UTM 參數監測</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ==================== 作品集 Portfolio Section (影片 / 角色 / 互動遊戲) ==================== */}
          <section id="portfolio" className="py-16 md:py-32 bg-[#29251F] relative border-t border-[#B89A70]/10">
            <div className="max-w-7xl mx-auto px-6 lg:px-12">
              <div className="text-center mb-12">
                <h2 className="font-serif-grace text-4xl md:text-5xl text-white mb-4">Selected Works</h2>
                <p className="text-[#E9DDCC]/80 font-light">作品集｜AI 角色、動態影片與互動遊戲</p>
                {dataSource === 'offline' && (
                  <p className="text-[11px] text-[#B89A70]/70 mt-2">目前離線，顯示上次載入的作品</p>
                )}
              </div>

              <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-8 sm:mb-12">
                {categories.map((cat: string) => (
                  <button
                    key={cat}
                    onClick={() => { setSelectedCategory(cat); track('select_content', { content_type: 'category', content_id: cat }); }}
                    className={`px-4 py-1.5 text-xs tracking-widest rounded-sm border transition-colors ${
                      selectedCategory === cat
                        ? 'bg-[#B89A70] text-[#29251F] border-[#B89A70]'
                        : 'text-[#E9DDCC] border-[#B89A70]/30 hover:border-[#B89A70]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-8">
                {filteredPublicWorks.map((work) => (
                  <SafeMediaDisplay key={work.id} work={work} onOpenDetail={openWorkDetail} onPlayGame={openGame} />
                ))}
              </div>
            </div>
          </section>

          {/* ==================== 聯絡我們 Contact Section (串接 Google Sheets) ==================== */}
          <section id="contact" className="py-16 md:py-32 bg-[#1c1813] relative border-t border-[#B89A70]/10">
            <div className="max-w-4xl mx-auto px-6 z-10 relative">
              <div className="text-center mb-12">
                <div className="inline-block mb-6 p-4 rounded-full bg-[#B89A70]/5">
                  <svg className="w-8 h-8 text-[#B89A70]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>

                <h2 className="font-serif-grace text-4xl md:text-5xl text-white mb-6">Let's Create Together.</h2>

                <p className="text-[#E9DDCC] text-lg md:text-xl font-light max-w-2xl mx-auto leading-relaxed">
                  專為中小企業、品牌商家、內容創作者打造的頂尖視覺升級方案。填寫下方表單，您的需求將即時同步至專案管理雲端試算表。
                </p>
              </div>

              <div className="bg-[#29251F] border border-[#B89A70]/25 rounded-sm p-5 sm:p-8 md:p-10 shadow-2xl">
                {contactSubmitted ? (
                  <div className="text-center py-10 space-y-4">
                    <CheckCircle2 className="w-12 h-12 text-[#B89A70] mx-auto" />
                    <h3 className="text-2xl font-serif-grace text-white">已收到您的專案諮詢</h3>
                    <p className="text-sm text-[#E9DDCC]/80 max-w-md mx-auto leading-relaxed">
                      我們將於 1-2 個工作天內透過 Email 或 LINE 與您聯繫。
                    </p>
                    <button
                      type="button"
                      onClick={() => { setContactSubmitted(false); formStartedAt.current = Date.now(); }}
                      className="mt-4 px-6 py-2.5 border border-[#B89A70] text-[#B89A70] hover:bg-[#B89A70] hover:text-[#29251F] text-xs tracking-widest uppercase rounded-sm transition-colors"
                    >
                      填寫另一筆需求
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleContactSubmit} className="space-y-6 text-sm" onFocus={() => { if (!formStartedAt.current) formStartedAt.current = Date.now(); }}>
                    {/* 防機器人隱藏欄位：真人看不到也不會填 */}
                    <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                      <label>
                        Website
                        <input type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
                      </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-xs tracking-wider uppercase text-[#E9DDCC]/80 mb-2">
                          您的姓名 / 品牌名稱 *
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={100}
                          autoComplete="name"
                          value={contactForm.name}
                          onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                          placeholder="請輸入您的稱呼"
                          className="w-full bg-[#1c1813] border border-[#B89A70]/25 focus:border-[#B89A70] rounded-sm p-3 text-white outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs tracking-wider uppercase text-[#E9DDCC]/80 mb-2">
                          電子信箱 Email *
                        </label>
                        <input
                          type="email"
                          required
                          maxLength={150}
                          autoComplete="email"
                          value={contactForm.email}
                          onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                          placeholder="name@company.com"
                          className="w-full bg-[#1c1813] border border-[#B89A70]/25 focus:border-[#B89A70] rounded-sm p-3 text-white outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-xs tracking-wider uppercase text-[#E9DDCC]/80 mb-2">
                          LINE ID 或聯絡電話
                        </label>
                        <input
                          type="text"
                          value={contactForm.contactInfo}
                          onChange={(e) => setContactForm({ ...contactForm, contactInfo: e.target.value })}
                          placeholder="方便快速聯繫的方式"
                          className="w-full bg-[#1c1813] border border-[#B89A70]/25 focus:border-[#B89A70] rounded-sm p-3 text-white outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs tracking-wider uppercase text-[#E9DDCC]/80 mb-2">
                          諮詢服務項目
                        </label>
                        <select
                          value={contactForm.service}
                          onChange={(e) => setContactForm({ ...contactForm, service: e.target.value })}
                          className="w-full bg-[#1c1813] border border-[#B89A70]/25 focus:border-[#B89A70] rounded-sm p-3 text-white outline-none"
                        >
                          <option value="AI 角色 IP 設計與虛擬主播製作">AI 角色 IP 設計與虛擬主播</option>
                          <option value="AI 電影感短影音與商用配樂製作">AI 電影感短影音與配樂</option>
                          <option value="AR / VR 延展實境與 360 互動空間">AR / VR 與 360 互動空間</option>
                          <option value="品牌官網與 PWA 互動網站設計">品牌官網與 PWA 網站設計</option>
                          <option value="LINE 官方帳號與自動化工作流串接">LINE 官方帳號與自動化串接</option>
                          <option value="社群輿情洞察、GA4 和 UTM 監測流量參數">GA4 和 UTM 監測流量參數</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs tracking-wider uppercase text-[#E9DDCC]/80 mb-2">
                          預計預算範圍
                        </label>
                        <select
                          value={contactForm.budget}
                          onChange={(e) => setContactForm({ ...contactForm, budget: e.target.value })}
                          className="w-full bg-[#1c1813] border border-[#B89A70]/25 focus:border-[#B89A70] rounded-sm p-3 text-white outline-none"
                        >
                          <option value="2000元以下">2000元以下</option>
                          <option value="2000-10000">2000-10000</option>
                          <option value="10000-20000">10000-20000</option>
                          <option value="30000以上">30000以上</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs tracking-wider uppercase text-[#E9DDCC]/80 mb-2">
                        專案需求與目標說明 *
                      </label>
                      <textarea
                        rows={4}
                        required
                        maxLength={3000}
                        value={contactForm.message}
                        onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                        placeholder="請簡述您的品牌背景、預期上線時程或希望達成的視覺效果..."
                        className="w-full bg-[#1c1813] border border-[#B89A70]/25 focus:border-[#B89A70] rounded-sm p-3 text-white outline-none"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                      <span className="text-xs text-[#E9DDCC]/50">
                        您的資料僅用於回覆本次諮詢
                      </span>
                      <button
                        type="submit"
                        disabled={isSubmittingContact}
                        className="w-full sm:w-auto px-10 py-4 bg-[#B89A70] text-[#29251F] hover:bg-[#d1b894] transition-all duration-300 tracking-widest text-sm uppercase rounded-sm font-medium shadow-[0_0_20px_rgba(184,154,112,0.2)] hover:shadow-[0_0_30px_rgba(184,154,112,0.4)]"
                      >
                        {isSubmittingContact ? '資料傳送中...' : '送出專案諮詢'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </section>

          {/* ==================== 頁尾 Footer (已移除點擊三次開後台，改為正式路由) ==================== */}
          <footer className="bg-[#1f1b16] pt-12 safe-pb-footer border-t border-[#B89A70]/10 relative">
            <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row justify-between items-center text-center md:text-left gap-6">
              <div>
                <a href="#home" className="font-serif-grace text-xl tracking-widest text-white">
                  GRACE<span className="text-[#B89A70]">.</span>
                </a>
                <p className="text-[#E9DDCC]/50 text-xs mt-2 font-light">絹・創意工作室 | AI 視覺敘事</p>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-4 text-[#E9DDCC]/50 text-xs font-light tracking-wide">
                <span>&copy; {new Date().getFullYear()} GRACE CREATIVE STUDIO. All rights reserved.</span>
                <button
                  onClick={() => navigateTo('/admin')}
                  className="text-[#B89A70]/50 hover:text-[#B89A70] transition-colors"
                >
                  管理員登入
                </button>
              </div>
            </div>
          </footer>
        </>
      )}

      {/* ==================== 作品完整設定集與多圖檢視 Modal ==================== */}
      {activeWorkDetail && (
        <div
          onClick={() => setActiveWorkDetail(null)}
          className="fixed inset-0 z-50 bg-[#14110e]/90 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 md:p-8 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="bg-[#1c1813] sm:border border-[#B89A70]/30 sm:rounded-sm max-w-4xl w-full overflow-hidden shadow-2xl my-auto h-full sm:h-auto sm:max-h-[90vh] flex flex-col"
          >
            <div className="px-4 py-4 sm:p-6 safe-pt-modal bg-[#29251F] border-b border-[#B89A70]/15 flex items-start sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs text-[#B89A70] tracking-widest uppercase block mb-1">
                  {activeWorkDetail.category}
                </span>
                <h3 className="text-lg sm:text-xl md:text-2xl font-medium text-white">{activeWorkDetail.title}</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setActiveWorkDetail(null);
                    try { window.location.hash = '#home'; } catch (e) {}
                  }}
                  className="hidden sm:inline-block px-3 py-1.5 bg-[#B89A70] text-[#29251F] text-xs font-medium tracking-widest rounded-sm hover:bg-[#d1b894]"
                >
                  返回首頁
                </button>
                <button
                  onClick={() => setActiveWorkDetail(null)}
                  aria-label="關閉"
                  className="px-3 py-1.5 border border-[#B89A70]/50 text-[#E9DDCC] text-xs tracking-widest rounded-sm hover:border-[#B89A70]"
                >
                  ✕ 關閉
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 md:p-8 safe-pb-modal overflow-y-auto space-y-6">
              {/* 主圖或影片 */}
              <div className="rounded-sm overflow-hidden border border-[#B89A70]/15 bg-[#14110e]">
                {hasPlayableVideo(activeWorkDetail.video_url) ? (
                  <VideoEmbed work={activeWorkDetail} mode="detail" autoPlay />
                ) : (
                <img
                  src={assetUrl(activeWorkDetail.cover_image)}
                  alt={activeWorkDetail.title}
                  onError={(e) => {
                    e.currentTarget.src = activeWorkDetail.fallback_cover || 'https://placehold.co/1200x800/29251F/B89A70?text=GRACE+CREATIVE';
                  }}
                  className="w-full max-h-[520px] object-contain mx-auto"
                />
                )}
              </div>

              {/* 多張作品圖片畫廊 */}
              {Array.isArray(activeWorkDetail.gallery_images) && activeWorkDetail.gallery_images.length > 1 && (
                <div>
                  <h4 className="text-xs tracking-widest uppercase text-[#B89A70] mb-3">更多作品細節圖 ({activeWorkDetail.gallery_images.length} 張)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                    {activeWorkDetail.gallery_images.map((imgUrl: string, i: number) => (
                      <img
                        loading="lazy"
                        key={i}
                        src={assetUrl(imgUrl)}
                        alt={`${activeWorkDetail.title} - ${i + 1}`}
                        className="w-full h-40 object-cover rounded-sm border border-[#B89A70]/20"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 詳細文字設定 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#29251F]/60 p-4 sm:p-6 border border-[#B89A70]/10 rounded-sm">
                <div>
                  <h4 className="text-xs tracking-widest uppercase text-[#B89A70] mb-2">作品介紹</h4>
                  <p className="text-sm text-[#E9DDCC]/90 leading-relaxed font-light">{activeWorkDetail.description}</p>
                </div>
                <div>
                  <h4 className="text-xs tracking-widest uppercase text-[#B89A70] mb-2">創作理念</h4>
                  <p className="text-sm text-[#E9DDCC]/90 leading-relaxed font-light">
                    {activeWorkDetail.concept || '結合品牌核心價值與高質感 AI 視覺敘事。'}
                  </p>
                </div>
              </div>

              {activeWorkDetail.external_url && (
                <div className="flex items-center justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => { openGame(activeWorkDetail); setActiveWorkDetail(null); }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#B89A70] text-[#29251F] font-medium rounded-sm hover:bg-[#d1b894]"
                  >
                    立即試玩
                  </button>
                </div>
              )}

              {detailVideo.isValid && detailVideo.kind === 'iframe' && (
                <p className="text-right text-[11px] text-[#E9DDCC]/45">
                  影片無法播放？
                  <a
                    href={safeHref(activeWorkDetail.video_url)}
                    onClick={() => track('click_outbound', { link_url: activeWorkDetail.video_url, item_id: activeWorkDetail.id })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 underline underline-offset-2 hover:text-[#B89A70]"
                  >
                    到 {PLATFORM_LABEL[detailVideo.platform]} 觀看
                  </a>
                </p>
              )}
            </div>
          </div>
        </div>
      )}


      {/* 遊戲試玩視窗：直接在網頁內玩 */}
      {playingGame && (
        <div className="fixed inset-0 z-[60] bg-[#14110e] flex flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-2 safe-pt-game border-b border-[#B89A70]/25 shrink-0">
            <p className="text-sm text-[#E9DDCC] truncate">{playingGame.title}</p>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={safeHref(playingGame.external_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-block px-3 py-1.5 border border-[#B89A70]/50 text-[#E9DDCC] text-xs tracking-widest rounded-sm hover:border-[#B89A70]"
              >
                在新分頁開啟
              </a>
              <button
                type="button"
                onClick={() => setPlayingGame(null)}
                className="px-3 py-1.5 bg-[#B89A70] text-[#29251F] text-xs font-medium tracking-widest rounded-sm hover:bg-[#d1b894]"
              >
                ✕ 關閉遊戲
              </button>
            </div>
          </div>
          <iframe
            src={safeHref(playingGame.external_url)}
            title={playingGame.title}
            sandbox="allow-scripts allow-same-origin"
            allow="autoplay"
            className="flex-1 w-full border-0 bg-[#1c1813]"
          />
        </div>
      )}

      {/* 回到首頁浮動按鈕 */}
      {currentPath !== '/admin' && scrolled && (
        <a
          href="#home"
          aria-label="回到首頁"
          className="fixed fab-safe right-4 sm:right-6 z-40 px-3 sm:px-4 py-3 bg-[#B89A70] text-[#29251F] text-xs font-medium tracking-widest rounded-sm shadow-2xl hover:bg-[#d1b894] transition-colors"
        >
          ↑ <span className="hidden sm:inline">回到首頁</span><span className="sm:hidden">TOP</span>
        </a>
      )}

      {/* 全域 Toast 通知 */}
      {/* 新版本提示 */}
      {updateAvailable && (
        <div className="fixed banner-safe left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-2rem)] max-w-md bg-[#29251F] border border-[#B89A70] text-[#E9DDCC] px-4 py-3 rounded-sm shadow-2xl flex items-center justify-between gap-3 text-sm">
          <span>網站有新版本</span>
          <button type="button" onClick={applyUpdate} className="px-3 py-1.5 bg-[#B89A70] text-[#29251F] text-xs font-medium rounded-sm">立即更新</button>
        </div>
      )}

      {/* iPhone 安裝說明 */}
      {showIOSTip && (
        <div onClick={() => setShowIOSTip(false)} className="fixed inset-0 z-[70] bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-[#29251F] border border-[#B89A70]/40 rounded-sm p-6 text-sm text-[#E9DDCC] space-y-3 mb-safe">
            <h3 className="text-base text-white font-medium">安裝到 iPhone 主畫面</h3>
            <p>1. 用 Safari 開啟本網站</p>
            <p>2. 點下方「分享」按鈕（方框加向上箭頭）</p>
            <p>3. 選「加入主畫面」→ 右上「新增」</p>
            <button type="button" onClick={() => setShowIOSTip(false)} className="w-full mt-2 py-2.5 bg-[#B89A70] text-[#29251F] rounded-sm font-medium">我知道了</button>
          </div>
        </div>
      )}

      {toastMsg && (
        <div role="status" aria-live="polite" className="fixed toast-safe left-1/2 -translate-x-1/2 z-[80] w-max max-w-[calc(100%-2rem)] bg-[#B89A70] text-[#1c1813] px-5 py-3 rounded-sm font-medium shadow-2xl flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}