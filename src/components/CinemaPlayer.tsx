import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Subtitles,
  Settings,
  X,
  SkipForward,
  SkipBack,
  Check,
  Upload,
  ListVideo,
  PictureInPicture2,
  Globe,
  RotateCcw,
  RotateCw,
  Zap,
  ExternalLink,
  Copy,
  AlertTriangle,
  RefreshCw,
  PlayCircle,
  Download,
  Film,
} from 'lucide-react';
import { ParsedFtpItem, convertSrtToVtt, resolvePublicBdixGatewayUrl } from '../utils/ftpParser';
import { IS_CAPACITOR } from '../utils/platform';
import {
  probeVideoStreams,
  ProbedAudioTrack,
  ProbedSubtitleTrack,
  SeasonFolderInfo,
  resolvePlayableFromFolder,
  getCachedPlayableUrl,
  saveCachedPlayableUrl,
  isVercelHost,
  fetchItemMetadata,
} from '../services/ftpClient';

export interface CinemaPlayerProps {
  video: ParsedFtpItem;
  playlist: ParsedFtpItem[];
  subtitles: ParsedFtpItem[];
  seasons?: SeasonFolderInfo[];
  initialStartTime?: number;
  onSelectSeason?: (season: SeasonFolderInfo) => void;
  onClose: () => void;
  onSelectVideo: (item: ParsedFtpItem) => void;
  onProgressUpdate?: (currentTime: number, duration: number) => void;
}

type AspectMode = 'contain' | 'cover' | 'fill' | '21:9';

function parseRuntimeToSeconds(runtime?: string): number {
  if (!runtime) return 0;
  const clean = runtime.trim().toLowerCase();

  // Match "2h 21m", "2h", "1h 45m", "2 hr 21 min", "2 hrs"
  const hMatch = clean.match(/(\d+)\s*(?:h|hr|hours?)/);
  const mMatch = clean.match(/(\d+)\s*(?:m|min|minutes?)/);
  if (hMatch || mMatch) {
    const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
    const minutes = mMatch ? parseInt(mMatch[1], 10) : 0;
    return hours * 3600 + minutes * 60;
  }

  // Match "120 min", "120 mins", or plain numbers
  const minOnly = clean.match(/^(\d+)\s*(?:min|mins|minutes)?$/);
  if (minOnly) {
    const val = parseInt(minOnly[1], 10);
    if (val > 0) return val * 60;
  }

  return 0;
}

export const CinemaPlayerWeb: React.FC<CinemaPlayerProps> = ({
  video,
  playlist,
  subtitles,
  seasons,
  initialStartTime = 0,
  onSelectSeason,
  onClose,
  onSelectVideo,
  onProgressUpdate,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hideControlsTimer = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isTouchDevice = useRef(false);
  const appliedInitialStartRef = useRef<string | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(initialStartTime || 0);
  const [duration, setDuration] = useState(0);
  const [probedDuration, setProbedDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const isSeekingRef = useRef(false);
  const seekTargetRef = useRef<number | null>(null);
  const transcodeOffsetRef = useRef<number>(0);
  const [transcodeStartSeconds, setTranscodeStartSeconds] = useState<number>(0);
  const [forceReencode, setForceReencode] = useState(false);
  const [probedNeedsReencode, setProbedNeedsReencode] = useState(false);
  const [streamDiag, setStreamDiag] = useState<string>('');
  const hasStartedRef = useRef(false); // true once real playback began: never auto-reroute (it would restart the movie)
  const autoRoutedUrlRef = useRef<string | null>(null);
  const desktopFallbackRef = useRef<() => void>(() => {});
  const isDesktop = typeof navigator !== 'undefined' && /Electron\//i.test(navigator.userAgent);
  const bufferTimerRef = useRef<number | null>(null);

  // Stream URL & Engine Fallback state
  const [overrideVideoUrl, setOverrideVideoUrl] = useState<string | null>(null);
  const [streamFallbackStep, setStreamFallbackStep] = useState(0);
  const [playerEngine, setPlayerEngine] = useState<'cinema' | 'bypass'>('cinema');
  const [selectedMirror, setSelectedMirror] = useState<string>('auto');
  const [enrichedRuntime, setEnrichedRuntime] = useState<string | null>(video.runtime || null);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState(0);
  const [probedAudioTracks, setProbedAudioTracks] = useState<ProbedAudioTrack[]>([]);
  const [probedSubTracks, setProbedSubTracks] = useState<ProbedSubtitleTrack[]>([]);

  // Volume state
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Audio Volume Booster (GainNode & Dialogue Compressor for optional extra amplification)
  const [audioBoostLevel, setAudioBoostLevel] = useState<number>(1.0);
  const [isBoostEnabled, setIsBoostEnabled] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const ensureAudioNodes = useCallback(() => {
    // Only engage Web Audio API if boost is explicitly turned on and greater than 100%
    if (!isBoostEnabled || audioBoostLevel <= 1.0) return;
    const v = videoRef.current;
    if (!v) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (!gainNodeRef.current) {
        const gainNode = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();

        compressor.threshold.setValueAtTime(-24, ctx.currentTime);
        compressor.knee.setValueAtTime(30, ctx.currentTime);
        compressor.ratio.setValueAtTime(3.5, ctx.currentTime);
        compressor.attack.setValueAtTime(0.005, ctx.currentTime);
        compressor.release.setValueAtTime(0.2, ctx.currentTime);

        const currentMultiplier = isBoostEnabled ? audioBoostLevel : 1.0;
        gainNode.gain.setValueAtTime(currentMultiplier, ctx.currentTime);

        if (!audioSourceRef.current) {
          try {
            audioSourceRef.current = ctx.createMediaElementSource(v);
          } catch {}
        }

        if (audioSourceRef.current) {
          try {
            audioSourceRef.current.disconnect();
          } catch {}
          audioSourceRef.current.connect(compressor);
          compressor.connect(gainNode);
          gainNode.connect(ctx.destination);
        }

        gainNodeRef.current = gainNode;
        compressorRef.current = compressor;
      } else {
        const currentMultiplier = isBoostEnabled ? audioBoostLevel : 1.0;
        gainNodeRef.current.gain.setValueAtTime(currentMultiplier, ctx.currentTime);
      }
    } catch (err) {
      console.warn('Audio booster init:', err);
    }
  }, [audioBoostLevel, isBoostEnabled]);

  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      try {
        const mult = isBoostEnabled ? audioBoostLevel : 1.0;
        gainNodeRef.current.gain.setValueAtTime(mult, audioCtxRef.current.currentTime);
      } catch {}
    }
  }, [audioBoostLevel, isBoostEnabled]);

  // Subtitles state
  const [activeSubId, setActiveSubId] = useState<string>('off');
  const [subOffset, setSubOffset] = useState(0);
  const [subFontSize, setSubFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md');
  const [customSubs, setCustomSubs] = useState<
    { id: string; label: string; rawText: string }[]
  >([]);
  const [activeVttUrl, setActiveVttUrl] = useState<string | null>(null);

  // UI state
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [aspectMode, setAspectMode] = useState<AspectMode>('contain');
  const [activeMenu, setActiveMenu] = useState<
    null | 'audio' | 'subtitles' | 'settings' | 'playlist'
  >(null);
  const [seekRipple, setSeekRipple] = useState<'left' | 'right' | null>(null);
  const [streamLoadFailed, setStreamLoadFailed] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isResolvingFolder, setIsResolvingFolder] = useState(false);
  const [folderResolutionError, setFolderResolutionError] = useState<string | null>(null);

  // Reset all playback and override states cleanly when a new video is loaded
  useEffect(() => {
    setOverrideVideoUrl(null);
    setStreamFallbackStep(0);
    setPlayerEngine('cinema');
    setSelectedMirror('auto');
    fallbackAttemptsRef.current = 0;
    isSeekingRef.current = false;
    seekTargetRef.current = null;
    transcodeOffsetRef.current = 0;
    setTranscodeStartSeconds(0);
    setForceReencode(false);
    setProbedNeedsReencode(false);
    setStreamDiag('');
    hasStartedRef.current = false;
    autoRoutedUrlRef.current = null;
    const startAt = initialStartTime || 0;
    setCurrentTime(startAt);
    setScrubTime(startAt);
    setDuration(0);
    setProbedDuration(0);
    setBufferedEnd(0);
    setIsBuffering(true);
    setStreamLoadFailed(false);
    setSelectedAudioTrack(0);
    setProbedAudioTracks([]);
    setProbedSubTracks([]);
    appliedInitialStartRef.current = null;
    setShowControls(true);

    if (video.runtime) {
      setEnrichedRuntime(video.runtime);
    } else {
      let cancelled = false;
      fetchItemMetadata(video).then((meta) => {
        if (cancelled || !meta?.runtime) return;
        setEnrichedRuntime(meta.runtime);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [video.id, video.url, video.runtime]);

  // Auto-resolve playable file with instant persistent cache lookup
  useEffect(() => {
    const isDirectVideo = /\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(video.url);
    if (isDirectVideo) {
      setOverrideVideoUrl(null);
      setIsResolvingFolder(false);
      return;
    }

    const cached = getCachedPlayableUrl(video.id) || getCachedPlayableUrl(video.url);
    if (cached) {
      setOverrideVideoUrl(cached);
      setIsResolvingFolder(false);
      return;
    }

    const isFolder =
      video.isDirectory ||
      video.url.endsWith('/') ||
      !isDirectVideo;

    if (!isFolder) {
      setOverrideVideoUrl(null);
      setIsResolvingFolder(false);
      return;
    }

    let cancelled = false;
    setIsResolvingFolder(true);
    setFolderResolutionError(null);

    resolvePlayableFromFolder(video)
      .then((playable) => {
        if (cancelled) return;
        setIsResolvingFolder(false);
        const resolvedUrl = playable?.primaryVideo?.url;
        const isValidMedia =
          resolvedUrl &&
          !resolvedUrl.endsWith('/') &&
          /\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(resolvedUrl);

        if (isValidMedia) {
          saveCachedPlayableUrl(video.id, resolvedUrl);
          saveCachedPlayableUrl(video.url, resolvedUrl);
          setOverrideVideoUrl(resolvedUrl);
          setStreamFallbackStep(0);
          setIsBuffering(true);
        } else {
          // Keep buffering: backend /api/stream proxy crawls folder and serves the video file directly!
          console.log('Folder scan finished, backend stream proxy handling stream:', video.url);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setIsResolvingFolder(false);
        console.log('Folder scan catch, backend stream proxy handling stream:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [video.id, video.url, video.isDirectory]);

  const rawVideoUrl = overrideVideoUrl || video.url;

  // When loaded on an HTTPS website (like Vercel), upgrade known public HTTP mirrors to HTTPS
  // and resolve private BDIX IPs (172.16.x) to their public HTTPS mirrors
  const safePlayableUrl = useMemo(() => {
    let u = rawVideoUrl;
    // Universally upgrade any ftpbd.net HTTP URL to HTTPS (server2, server3, server4, etc.)
    if (/^http:\/\/([^/]+\.)?ftpbd\.net/i.test(u)) {
      u = u.replace(/^http:\/\//i, 'https://');
    }
    // If it's a private BDIX IP or DhakaFlix server, resolve to public HTTPS gateway
    if (/^(http:\/\/)?(172\.(1[6-9]|2\d|3[0-1])\.|10\.|192\.168\.)/i.test(u) || u.includes('dhakaflix') || u.includes('discoveryftp')) {
      const publicGw = resolvePublicBdixGatewayUrl(u);
      if (publicGw && publicGw !== 'PORTAL_ROOT') {
        u = publicGw;
      }
    }
    if (u.includes('.ftpbd.net') && u.startsWith('http://')) {
      u = u.replace(/^http:\/\//i, 'https://');
    }
    return u;
  }, [rawVideoUrl]);

  const isHttpsOrigin = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const isDirectHttps = safePlayableUrl.startsWith('https://');
  const isVercel = isVercelHost();

  const isBdixServer = useMemo(() => {
    return (
      safePlayableUrl.includes('ftpbd.net') ||
      /^(https?:\/\/)?(172\.(1[6-9]|2\d|3[0-1])\.|10\.|192\.168\.)/i.test(safePlayableUrl) ||
      safePlayableUrl.includes('dhakaflix') ||
      safePlayableUrl.includes('discoveryftp')
    );
  }, [safePlayableUrl]);

  const isInIframeOrCloudHost = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const inIframe = window.self !== window.top;
    const hostname = window.location.hostname;
    const isCloudHost =
      hostname.includes('run.app') ||
      hostname.includes('vercel.app') ||
      hostname.includes('aistudio') ||
      hostname.includes('google.com') ||
      isVercelHost();
    return inIframe || isCloudHost;
  }, []);

  const preferProxyFirst = useMemo(() => {
    return isBdixServer && isInIframeOrCloudHost;
  }, [isBdixServer, isInIframeOrCloudHost]);

  const isTargetFolder =
    safePlayableUrl.endsWith('/') ||
    !/\.(mp4|mkv|webm|avi|mov|ts|m4v)(\?.*)?$/i.test(safePlayableUrl);

  const isMkvOrUnsupported = useMemo(() => {
    if (IS_CAPACITOR) return false; // Android: no ffmpeg remux, let the phone's player try the file directly
    return /\.(mkv|avi|ts|m2ts|flv|wmv|vob)(\?.*)?$/i.test(safePlayableUrl);
  }, [safePlayableUrl]);

  // Apply selected mirror server override if specified
  const effectiveSafeUrl = useMemo(() => {
    let u = safePlayableUrl;
    if (selectedMirror !== 'auto' && u.includes('.ftpbd.net')) {
      u = u.replace(/(server[23457]\.ftpbd\.net)/i, `${selectedMirror}.ftpbd.net`);
    }
    return u;
  }, [safePlayableUrl, selectedMirror]);

  // True only when the <video> is really playing the live ffmpeg stream (seeking then = restart ffmpeg at that second)
  const isTranscodeActive =
    !(isTargetFolder || isResolvingFolder) && playerEngine === 'cinema' && streamFallbackStep === 3;

  const streamUrl = useMemo(() => {
    // If the URL is a folder or still resolving, route through our backend /api/stream proxy which automatically resolves and streams the media file!
    if (isTargetFolder || isResolvingFolder) {
      return `/api/stream?url=${encodeURIComponent(effectiveSafeUrl)}${playerEngine === 'bypass' ? '&bypass=1' : ''}`;
    }

    // Engine 2: Ultra Stream Bypass Engine (uses direct streaming proxy with bypass flag & clean range)
    if (playerEngine === 'bypass') {
      return `/api/stream?url=${encodeURIComponent(effectiveSafeUrl)}&bypass=1`;
    }

    // STEP 0 (Cinema Turbo / Direct Domestic BDIX):
    // Connect directly from browser to media server if HTTPS (ultra-fast 100Mbps+ zero-lag BDIX in Bangladesh)
    if (streamFallbackStep === 0) {
      if (isDirectHttps || !isHttpsOrigin) {
        return effectiveSafeUrl;
      }
      return `/api/stream?url=${encodeURIComponent(effectiveSafeUrl)}`;
    }

    // STEP 1: High-Speed Range Stream Proxy
    if (streamFallbackStep === 1) {
      return `/api/stream?url=${encodeURIComponent(effectiveSafeUrl)}`;
    }

    // STEP 2: Ultra Stream Bypass Engine (Unclamped direct stream)
    if (streamFallbackStep === 2) {
      return `/api/stream?url=${encodeURIComponent(effectiveSafeUrl)}&bypass=1`;
    }

    // STEP 3: Transcode / Remux Route (/api/transcode)
    if (streamFallbackStep === 3) {
      const startParam = transcodeStartSeconds > 0 ? `&start=${transcodeStartSeconds}` : '';
      return `/api/transcode?url=${encodeURIComponent(effectiveSafeUrl)}&audioTrack=${selectedAudioTrack}${startParam}${forceReencode ? '&reencode=1' : ''}`;
    }

    return effectiveSafeUrl;
  }, [
    effectiveSafeUrl,
    playerEngine,
    streamFallbackStep,
    isResolvingFolder,
    isTargetFolder,
    isDirectHttps,
    isHttpsOrigin,
    selectedAudioTrack,
    transcodeStartSeconds,
    forceReencode,
  ]);

  const fallbackAttemptsRef = useRef(0);

  // Switch between direct stream, proxy, and transcode routes cleanly
  const advanceStreamFallback = useCallback(() => {
    setStreamFallbackStep((prev) => (prev + 1) % 4);
    setIsBuffering(true);
    setStreamLoadFailed(false);
  }, []);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    if (isDesktop) return; // desktop: no pop-up messages
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Desktop: pick the right route up-front, then fall back in a sensible order:
  // native direct stream -> live ffmpeg (copy video, AAC audio) -> live ffmpeg with video re-encode
  desktopFallbackRef.current = () => {
    const v = videoRef.current;
    const cur = Math.floor(
      (isTranscodeActive ? transcodeOffsetRef.current : 0) + (v?.currentTime || 0)
    );
    if (streamFallbackStep !== 3 || playerEngine !== 'cinema') {
      setPlayerEngine('cinema');
      transcodeOffsetRef.current = cur;
      setTranscodeStartSeconds(cur);
      setStreamFallbackStep(3);
      setIsBuffering(true);
      setStreamLoadFailed(false);
    } else if (!forceReencode) {
      transcodeOffsetRef.current = cur;
      setTranscodeStartSeconds(cur);
      setForceReencode(true);
      setIsBuffering(true);
      setStreamLoadFailed(false);
    } else {
      setIsBuffering(false);
      setStreamLoadFailed(true);
      setStreamDiag('');
    }
  };

  // Probe says HEVC / 10-bit / non-H.264 video: the window cannot decode that natively -> convert straight away
  useEffect(() => {
    if (!isDesktop || !probedNeedsReencode || hasStartedRef.current) return;
    if (isTargetFolder || isResolvingFolder) return;
    if (!forceReencode) setForceReencode(true);
    if (streamFallbackStep !== 3 || playerEngine !== 'cinema') {
      transcodeOffsetRef.current = 0;
      setTranscodeStartSeconds(0);
      setPlayerEngine('cinema');
      setStreamFallbackStep(3);
      setIsBuffering(true);
    }
  }, [isDesktop, probedNeedsReencode, isTargetFolder, isResolvingFolder]);

  useEffect(() => {
    if (!isDesktop || isTargetFolder || isResolvingFolder) return;
    if (autoRoutedUrlRef.current === safePlayableUrl) return;
    // Only audio codecs Chromium really cannot decode (5.1 AAC etc. play fine natively)
    const nonNativeAudio =
      probedAudioTracks.length > 0 &&
      /^(ac-?3|e-?ac-?3|dts.*|dca|truehd|mlp)$/i.test(String(probedAudioTracks[selectedAudioTrack]?.codec || ''));
    if (isMkvOrUnsupported || nonNativeAudio) {
      autoRoutedUrlRef.current = safePlayableUrl;
      if (!hasStartedRef.current) {
        transcodeOffsetRef.current = 0;
        setTranscodeStartSeconds(0);
        setStreamFallbackStep(3);
        setIsBuffering(true);
      }
    }
  }, [isDesktop, isTargetFolder, isResolvingFolder, safePlayableUrl, isMkvOrUnsupported, probedAudioTracks, selectedAudioTrack]);

  // Universal Buffering Watchdog (8.5 seconds):
  // Gives overseas BDIX servers enough time to connect, while ensuring auto-failover to bypass if needed
  useEffect(() => {
    if (IS_CAPACITOR) return; // Android has no ffmpeg route to fall back to
    if (hasStartedRef.current) return; // movie already started: never reroute (that restarted it from 0)
    if (!streamUrl || streamLoadFailed) return;
    if (!isBuffering && isPlaying) return;

    const timeoutDuration = isDesktop ? (streamFallbackStep === 3 ? 60000 : 12000) : 8500;
    const timer = window.setTimeout(() => {
      if (isSeekingRef.current) return;
      const v = videoRef.current;
      // If still stuck buffering with no playable frames (readyState < 2)
      if (v && v.readyState < 2) {
        if (isDesktop) {
          desktopFallbackRef.current();
          return;
        }
        console.warn(`Stream stalled on step ${streamFallbackStep}, attempting fast fallback...`);
        const maxSteps = 4;
        if (fallbackAttemptsRef.current < maxSteps) {
          fallbackAttemptsRef.current += 1;
          if (fallbackAttemptsRef.current === 2 && playerEngine === 'cinema') {
            setPlayerEngine('bypass');
            setIsBuffering(true);
            showToast('🚀 Engaged Ultra Stream Bypass Engine...');
          } else {
            const nextStep = (streamFallbackStep + 1) % 4;
            setStreamFallbackStep(nextStep);
            setIsBuffering(true);
            showToast(
              nextStep === 0
                ? '⚡ Connecting direct BDIX stream...'
                : nextStep === 1
                ? '🛡️ Switched to high-speed stream proxy...'
                : nextStep === 2
                ? '🚀 Engaging Ultra Stream Bypass Engine...'
                : '⚙️ Connecting via stream remux route...'
            );
          }
        } else {
          // All fallback routes attempted, show recovery options cleanly
          setIsBuffering(false);
          setStreamLoadFailed(true);
        }
      }
    }, timeoutDuration);

    return () => window.clearTimeout(timer);
  }, [streamUrl, streamFallbackStep, isBuffering, isPlaying, streamLoadFailed, playerEngine, preferProxyFirst, showToast, isDesktop]);


  // Autoplay handler with audio policy fallback
  useEffect(() => {
    if (!streamUrl) return;
    const v = videoRef.current;
    if (!v) return;

    const playPromise = v.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setIsBuffering(false);
        })
        .catch((err) => {
          if (err.name === 'NotAllowedError') {
            v.muted = true;
            setIsMuted(true);
            v.play().catch(() => {});
          }
        });
    }
  }, [streamUrl]);

  // Reset state on video change
  useEffect(() => {
    if (appliedInitialStartRef.current === video.id) {
      // Video hasn't changed; avoid resetting player state on re-renders
      return;
    }
    appliedInitialStartRef.current = video.id;
    fallbackAttemptsRef.current = 0;

    const startSec = initialStartTime > 5 ? Math.floor(initialStartTime) : 0;

    setCurrentTime(startSec);
    setScrubTime(startSec);
    setBufferedEnd(0);
    setDuration(0);
    setProbedDuration(0);
    setSelectedAudioTrack(0);
    setOverrideVideoUrl(null);
    setStreamFallbackStep(0);
    setStreamLoadFailed(false);
    setIsBuffering(true);

    if (subtitles.length > 0) {
      setActiveSubId(`ext-${subtitles[0].id}`);
    } else {
      setActiveSubId('off');
    }

    let cancelled = false;
    probeVideoStreams(video.url).then((info) => {
      if (cancelled) return;
      if (info) {
        if (info.duration > 0) setProbedDuration(info.duration);
        setProbedNeedsReencode(Boolean(info.video?.needsVideoTranscode));
        setProbedAudioTracks(info.audioTracks || []);
        setProbedSubTracks(info.subtitleTracks || []);
      } else {
        setProbedAudioTracks([
          {
            audioIndex: 0,
            streamIndex: 1,
            codec: 'aac',
            language: /hindi/i.test(video.rawName) ? 'hin' : 'eng',
            label: /hindi/i.test(video.rawName) ? 'Hindi' : 'English',
            channels: 2,
            isBrowserNative: true,
          },
        ]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [video.id, video.url, video.rawName, initialStartTime]);

  // Active subtitle WebVTT URL
  useEffect(() => {
    if (activeSubId === 'off') {
      setActiveVttUrl(null);
      return;
    }

    const activeSourceUrl = overrideVideoUrl || video.url;
    if (activeSubId.startsWith('ext-')) {
      const subId = activeSubId.slice(4);
      const subItem = subtitles.find((s) => s.id === subId);
      if (subItem) {
        const subApi = `/api/subtitle?url=${encodeURIComponent(subItem.url)}&offset=${subOffset}`;
        if (IS_CAPACITOR) {
          // <track src> cannot reach the on-device API, so fetch the text and hand over a blob URL
          let cancelled = false;
          let blobUrl: string | null = null;
          fetch(subApi)
            .then((r) => r.text())
            .then((vtt) => {
              if (cancelled) return;
              blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
              setActiveVttUrl(blobUrl);
            })
            .catch(() => {});
          return () => {
            cancelled = true;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
          };
        }
        setActiveVttUrl(subApi);
      }
    } else if (activeSubId.startsWith('emb-')) {
      if (IS_CAPACITOR) {
        setActiveVttUrl(null); // embedded subtitle extraction needs ffmpeg (not available on Android)
        return;
      }
      const subIndex = parseInt(activeSubId.slice(4), 10) || 0;
      setActiveVttUrl(
        `/api/embedded-subtitle?url=${encodeURIComponent(activeSourceUrl)}&subIndex=${subIndex}&start=0`
      );
    } else if (activeSubId.startsWith('custom-')) {
      const custom = customSubs.find((c) => c.id === activeSubId);
      if (custom) {
        const vtt = convertSrtToVtt(custom.rawText, subOffset);
        const blob = new Blob([vtt], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);
        setActiveVttUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    }
  }, [activeSubId, subOffset, subtitles, video.url, overrideVideoUrl, customSubs]);

  const runtimeSeconds = useMemo(
    () => parseRuntimeToSeconds(enrichedRuntime || video.runtime),
    [enrichedRuntime, video.runtime]
  );
  const defaultEstimatedDuration = useMemo(() => {
    const isSeries =
      video.mediaKind === 'series' ||
      video.mediaKind === 'episode' ||
      video.season !== undefined;
    return isSeries ? 45 * 60 : 115 * 60; // 1h 55m for movie, 45m for episode
  }, [video.mediaKind, video.season]);

  const effectiveDuration = Math.max(
    duration,
    probedDuration,
    runtimeSeconds,
    defaultEstimatedDuration
  );
  const displayedTime = isScrubbing ? scrubTime : currentTime;

  // Auto-hide controls after 4 seconds of inactivity while playing (NEVER hide while paused)
  const scheduleAutoHide = useCallback(() => {
    if (hideControlsTimer.current) {
      window.clearTimeout(hideControlsTimer.current);
    }
    setShowControls(true);
    hideControlsTimer.current = window.setTimeout(() => {
      if (isPlaying && !activeMenu && !isScrubbing) {
        setShowControls(false);
      }
    }, 4000);
  }, [isPlaying, activeMenu, isScrubbing]);

  useEffect(() => {
    scheduleAutoHide();
    return () => {
      if (hideControlsTimer.current) window.clearTimeout(hideControlsTimer.current);
    };
  }, [scheduleAutoHide]);

  const togglePlay = useCallback(() => {
    ensureAudioNodes();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, [ensureAudioNodes]);

  const handleSeek = useCallback(
    (targetSec: number) => {
      const clamped = Math.max(0, Math.min(targetSec, effectiveDuration || targetSec));
      setCurrentTime(clamped);
      setScrubTime(clamped);
      isSeekingRef.current = true;
      seekTargetRef.current = clamped;

      if (isTranscodeActive) {
        // Live ffmpeg stream: restart ffmpeg directly at the target second
        setTranscodeStartSeconds(Math.floor(clamped));
        transcodeOffsetRef.current = clamped;
        setIsBuffering(true);
      } else {
        // Native browser range seek
        if (videoRef.current) {
          try {
            videoRef.current.currentTime = clamped;
          } catch {}
        }
      }
    },
    [effectiveDuration, isTranscodeActive]
  );

  const skipRelative = useCallback(
    (delta: number) => {
      const target = Math.max(0, currentTime + delta);
      handleSeek(target);
      setSeekRipple(delta > 0 ? 'right' : 'left');
      window.setTimeout(() => setSeekRipple(null), 550);
    },
    [currentTime, handleSeek]
  );

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      }
    } catch {}
  };

  const handleSelectAudioTrack = (trackIndex: number) => {
    const chosenTrack = probedAudioTracks.find((t) => t.audioIndex === trackIndex);
    const savedTime = currentTime;

    if (chosenTrack?.companionUrl) {
      setSelectedAudioTrack(trackIndex);
      setOverrideVideoUrl(chosenTrack.companionUrl);
      setStreamFallbackStep(0);
      setIsBuffering(true);
      window.setTimeout(() => {
        if (videoRef.current && savedTime > 0) {
          try {
            videoRef.current.currentTime = savedTime;
          } catch {}
        }
      }, 350);
      setActiveMenu(null);
      return;
    }

    setOverrideVideoUrl(null);
    setSelectedAudioTrack(trackIndex);

    const v = videoRef.current as any;
    if (v && v.audioTracks && v.audioTracks.length > trackIndex) {
      for (let i = 0; i < v.audioTracks.length; i++) {
        v.audioTracks[i].enabled = i === trackIndex;
      }
    }
    setActiveMenu(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === ' ' || e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'l') {
        e.preventDefault();
        skipRelative(10);
      } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'j') {
        e.preventDefault();
        skipRelative(-10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume((v) => {
          const next = Math.min(1, Number((v + 0.1).toFixed(2)));
          if (videoRef.current) videoRef.current.volume = next;
          return next;
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume((v) => {
          const next = Math.max(0, Number((v - 0.1).toFixed(2)));
          if (videoRef.current) videoRef.current.volume = next;
          return next;
        });
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setIsMuted((m) => !m);
      } else if (e.key === 'Escape') {
        if (activeMenu) setActiveMenu(null);
        else if (!document.fullscreenElement) onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, skipRelative, toggleFullscreen, activeMenu, onClose]);

  const handleUploadSubtitleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const newId = `custom-${Date.now()}`;
      setCustomSubs((prev) => [...prev, { id: newId, label: file.name, rawText: text }]);
      setActiveSubId(newId);
    };
    reader.readAsText(file);
  };

  const formatTime = (sec: number) => {
    if (!sec || isNaN(sec) || sec < 0) return '0:00';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const currentIdx = playlist.findIndex((p) => p.id === video.id);
  const prevVideo = currentIdx > 0 ? playlist[currentIdx - 1] : null;
  const nextVideo =
    currentIdx >= 0 && currentIdx < playlist.length - 1 ? playlist[currentIdx + 1] : null;

  const progressPercent =
    effectiveDuration > 0 ? Math.min(100, (displayedTime / effectiveDuration) * 100) : 0;
  const bufferedPercent =
    effectiveDuration > 0 ? Math.min(100, (bufferedEnd / effectiveDuration) * 100) : 0;

  const subFontSizePx =
    subFontSize === 'sm'
      ? '1.05rem'
      : subFontSize === 'md'
      ? '1.35rem'
      : subFontSize === 'lg'
      ? '1.75rem'
      : '2.15rem';

  const currentAudioLabel =
    probedAudioTracks.find((t) => t.audioIndex === selectedAudioTrack)?.label ||
    probedAudioTracks[0]?.label ||
    'Audio';

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    isTouchDevice.current = true;
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;
    const start = touchStartRef.current;
    touchStartRef.current = null;

    if (e.changedTouches.length === 0) return;
    const endTouch = e.changedTouches[0];
    const dx = endTouch.clientX - start.x;
    const dy = endTouch.clientY - start.y;
    const dt = Date.now() - start.time;

    // Genuine tap: less than 24px movement and under 400ms duration
    if (Math.hypot(dx, dy) < 24 && dt < 400) {
      if (activeMenu) {
        setActiveMenu(null);
        return;
      }

      // If controls are hidden on mobile, tapping ONCE reveals them immediately!
      if (!showControls) {
        setShowControls(true);
        scheduleAutoHide();
        return;
      }

      // If controls are already visible, check for double-tap on side to skip
      const now = Date.now();
      const rect = e.currentTarget.getBoundingClientRect();
      const relX = (endTouch.clientX - rect.left) / rect.width;
      const doubleTapDelta = now - lastTapRef.current.time;

      if (doubleTapDelta < 320 && Math.abs(relX - lastTapRef.current.x) < 0.28) {
        lastTapRef.current = { time: 0, x: 0 };
        if (relX < 0.35) {
          skipRelative(-10);
        } else if (relX > 0.65) {
          skipRelative(10);
        } else {
          togglePlay();
        }
        return;
      }

      lastTapRef.current = { time: now, x: relX };
      // Single tap on background when controls are already visible toggles them off
      setShowControls(false);
    }
  };

  const handleSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If recently handled by touch event, ignore duplicate synthetic click
    if (isTouchDevice.current && Date.now() - lastTapRef.current.time < 450) {
      return;
    }

    if (activeMenu) {
      setActiveMenu(null);
      return;
    }

    // If controls are hidden, clicking reveals them immediately
    if (!showControls) {
      setShowControls(true);
      scheduleAutoHide();
      return;
    }

    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const delta = now - lastTapRef.current.time;

    // Double click to skip 10s left or right
    if (delta < 280 && Math.abs(relX - lastTapRef.current.x) < 0.25) {
      lastTapRef.current = { time: 0, x: 0 };
      if (relX < 0.35) {
        skipRelative(-10);
      } else if (relX > 0.65) {
        skipRelative(10);
      } else {
        toggleFullscreen();
      }
      return;
    }

    lastTapRef.current = { time: now, x: relX };
    setShowControls(false);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={scheduleAutoHide}
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none overflow-hidden"
    >
      <style>{`
        video::cue {
          background-color: rgba(0, 0, 0, 0.78);
          color: #ffffff;
          font-size: ${subFontSizePx};
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          line-height: 1.4;
          text-shadow: 0 2px 4px rgba(0,0,0,0.95);
        }
      `}</style>

      {/* Hidden File Input for Custom .SRT/.VTT Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.vtt"
        className="hidden"
        onChange={handleUploadSubtitleFile}
      />

      {/* Main Video Surface */}
      <div
        className="relative flex-1 w-full h-full flex items-center justify-center bg-black cursor-pointer select-none"
        onClick={handleSurfaceClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <video
          ref={videoRef}
          key={video.id}
          src={streamUrl || undefined}
          preload="auto"
          autoPlay
          playsInline
          muted={isMuted}
          onPlay={() => {
            setIsPlaying(true);
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            setIsBuffering(false);
            ensureAudioNodes();
          }}
          onPlaying={() => {
            hasStartedRef.current = true;
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            setIsBuffering(false);
          }}
          onLoadedData={() => {
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            setIsBuffering(false);
          }}
          onCanPlayThrough={() => {
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            setIsBuffering(false);
          }}
          onPause={() => {
            setIsPlaying(false);
            setShowControls(true);
          }}
          onSeeking={() => {
            isSeekingRef.current = true;
          }}
          onSeeked={(e) => {
            isSeekingRef.current = false;
            seekTargetRef.current = null;
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            setIsBuffering(false);
            const cur = isTranscodeActive
              ? transcodeOffsetRef.current + e.currentTarget.currentTime
              : e.currentTarget.currentTime;
            setCurrentTime(cur);
            setScrubTime(cur);
          }}
          onWaiting={() => {
            const v = videoRef.current;
            if (v && v.buffered && v.buffered.length > 0) {
              const end = v.buffered.end(v.buffered.length - 1);
              // If buffer already has > 1.2s ahead, this is a minor timestamp sync; avoid flashing buffer UI
              if (end - v.currentTime > 1.2) {
                return;
              }
            }
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            bufferTimerRef.current = window.setTimeout(() => {
              if (!streamLoadFailed) setIsBuffering(true);
            }, 750);
          }}
          onCanPlay={() => {
            if (bufferTimerRef.current) clearTimeout(bufferTimerRef.current);
            setIsBuffering(false);
            if (videoRef.current) {
              videoRef.current.playbackRate = playbackSpeed;
              videoRef.current.volume = volume;
              // Only seek to initialStartTime if explicitly requested for this video
              if (
                initialStartTime > 0 &&
                appliedInitialStartRef.current !== video.id &&
                Math.abs(videoRef.current.currentTime - initialStartTime) > 2
              ) {
                try {
                  videoRef.current.currentTime = initialStartTime;
                  appliedInitialStartRef.current = video.id;
                } catch {}
              }
            }
          }}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (d && isFinite(d) && d > 0) {
              setDuration(d);
            }
            if (initialStartTime > 5 && e.currentTarget.currentTime < 2) {
              try {
                e.currentTarget.currentTime = initialStartTime;
              } catch {}
            }
          }}
          onProgress={(e) => {
            const v = e.currentTarget;
            if (v.buffered && v.buffered.length > 0) {
              const bEnd = isTranscodeActive
                ? transcodeOffsetRef.current + v.buffered.end(v.buffered.length - 1)
                : v.buffered.end(v.buffered.length - 1);
              setBufferedEnd(bEnd);
            }
          }}
          onTimeUpdate={(e) => {
            if (isScrubbing) return;
            const rawCurrent = e.currentTarget.currentTime;
            // Prevent transient 0 from resetting timeline during active seek
            if (isSeekingRef.current) {
              if (seekTargetRef.current !== null && Math.abs(rawCurrent - seekTargetRef.current) > 2 && rawCurrent < 1) {
                return;
              }
              isSeekingRef.current = false;
              seekTargetRef.current = null;
            }

            const effectiveCurrent = isTranscodeActive
              ? transcodeOffsetRef.current + rawCurrent
              : rawCurrent;

            setCurrentTime(effectiveCurrent);
            setScrubTime(effectiveCurrent);
            if (onProgressUpdate && effectiveCurrent > 3) {
              onProgressUpdate(effectiveCurrent, Math.max(duration, probedDuration, 0));
            }
          }}
          onEnded={() => {
            if (nextVideo) {
              onSelectVideo(nextVideo);
            }
          }}
          onError={() => {
            const v = videoRef.current;
            if (v?.error && v.error.code === 1) {
              // MEDIA_ERR_ABORTED - caused by seek or source change, not an error!
              return;
            }
            if (isDesktop) {
              desktopFallbackRef.current();
              return;
            }
            const maxSteps = 4;
            if (fallbackAttemptsRef.current < maxSteps) {
              fallbackAttemptsRef.current += 1;
              const cur = videoRef.current?.currentTime || currentTime;
              if (fallbackAttemptsRef.current === 2 && playerEngine === 'cinema') {
                setPlayerEngine('bypass');
                showToast('🚀 Engaged Ultra Stream Bypass Engine...');
              } else {
                const nextStep = (streamFallbackStep + 1) % 4;
                setStreamFallbackStep(nextStep);
                showToast(
                  nextStep === 1
                    ? (preferProxyFirst ? 'Connecting high-speed stream...' : 'Switching to high-speed stream proxy...')
                    : nextStep === 2
                    ? 'Switching to remux stream route...'
                    : 'Switching to direct stream...'
                );
              }
              setIsBuffering(true);
              setStreamLoadFailed(false);
              window.setTimeout(() => {
                if (videoRef.current && cur > 0) {
                  try {
                    videoRef.current.currentTime = cur;
                  } catch {}
                }
              }, 300);
            } else {
              setIsBuffering(false);
              setStreamLoadFailed(true);
            }
          }}
          className={`w-full h-full transition-all duration-200 pointer-events-none ${
            aspectMode === 'cover'
              ? 'object-cover'
              : aspectMode === 'fill'
              ? 'object-fill'
              : aspectMode === '21:9'
              ? 'object-cover aspect-[21/9]'
              : 'object-contain'
          }`}
        >
          {activeVttUrl && (
            <track
              key={activeVttUrl}
              kind="subtitles"
              src={activeVttUrl}
              srcLang="en"
              label="Subtitles"
              default
            />
          )}
        </video>

        {/* Double-tap Skip Visual Feedback */}
        {seekRipple === 'left' && (
          <div className="absolute left-8 sm:left-16 top-1/2 -translate-y-1/2 bg-black/75 backdrop-blur-md px-5 py-3 rounded-2xl flex items-center gap-2 text-white font-semibold pointer-events-none shadow-2xl">
            <RotateCcw className="w-5 h-5 text-[#E50914]" />
            <span>-10s</span>
          </div>
        )}
        {seekRipple === 'right' && (
          <div className="absolute right-8 sm:right-16 top-1/2 -translate-y-1/2 bg-black/75 backdrop-blur-md px-5 py-3 rounded-2xl flex items-center gap-2 text-white font-semibold pointer-events-none shadow-2xl">
            <span>+10s</span>
            <RotateCw className="w-5 h-5 text-[#E50914]" />
          </div>
        )}

        {/* Folder Resolving Indicator */}
        {(isResolvingFolder || (isTargetFolder && !overrideVideoUrl)) && !isPlaying && isBuffering && !streamLoadFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-3 z-30 bg-black/80 backdrop-blur-sm px-4">
            <div className="w-12 h-12 border-3 border-[#E50914] border-t-transparent rounded-full animate-spin shadow-2xl" />
            <div className={`flex-col items-center gap-1.5 text-center ${isDesktop ? 'hidden' : 'flex'}`}>
              <span className="text-sm font-semibold text-white/95 tracking-wide">
                Finding stream for "{video.cleanTitle}"...
              </span>
              <span className="text-xs text-zinc-400">
                Scanning FTP mirrors and locating high-speed media stream
              </span>
            </div>
          </div>
        )}

        {/* Clean Buffering Spinner (no text, no buttons) */}
        {isBuffering && !isResolvingFolder && streamUrl && !streamLoadFailed && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="w-12 h-12 border-3 border-[#E5A00D] border-t-transparent rounded-full animate-spin shadow-lg" />
          </div>
        )}

        {/* Desktop: after every automatic attempt failed, just one quiet retry button (no technical text) */}
        {streamLoadFailed && isDesktop && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70">
            <button
              onClick={() => {
                const cur = Math.floor(transcodeOffsetRef.current + (videoRef.current?.currentTime || 0));
                transcodeOffsetRef.current = cur;
                setTranscodeStartSeconds(cur);
                setPlayerEngine('cinema');
                setForceReencode(true);
                setStreamFallbackStep(3);
                setStreamLoadFailed(false);
                setIsBuffering(true);
              }}
              className="w-14 h-14 rounded-full bg-white/15 hover:bg-white/25 border border-white/20 flex items-center justify-center text-white cursor-pointer transition-colors"
              title="Retry"
            >
              <RefreshCw className="w-6 h-6" />
            </button>
          </div>
        )}

        {/* Stream Load Failed Overlay (browser / phone) */}
        {streamLoadFailed && !isDesktop && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="max-w-md w-full bg-[#10141F] border border-amber-500/30 rounded-2xl p-6 shadow-2xl space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                <Zap className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Stream Standby / Reconnecting
                </h3>
                <p className="text-xs text-zinc-300 max-w-sm mx-auto leading-relaxed">
                  The upstream media server is slow or experiencing peering congestion. You can activate the Ultra Bypass Engine, switch server mirror, or open directly.
                </p>
                {isDesktop && streamDiag && (
                  <p className="text-[11px] text-amber-300/90 max-w-sm mx-auto leading-relaxed break-words font-mono bg-black/40 border border-amber-500/20 rounded-lg px-3 py-2 text-left">
                    {streamDiag}
                  </p>
                )}
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[11px] text-zinc-300">
                  <span>Movie Duration:</span>
                  <span className="text-amber-400 font-mono font-semibold">
                    {formatTime(effectiveDuration)}
                  </span>
                </div>
              </div>
              <div className="space-y-2 pt-1">
                {isDesktop && (
                  <button
                    onClick={() => {
                      const cur = Math.floor(transcodeOffsetRef.current + (videoRef.current?.currentTime || 0));
                      transcodeOffsetRef.current = cur;
                      setTranscodeStartSeconds(cur);
                      setPlayerEngine('cinema');
                      setForceReencode(true);
                      setStreamFallbackStep(3);
                      setStreamDiag('');
                      setStreamLoadFailed(false);
                      setIsBuffering(true);
                    }}
                    className="w-full bg-white text-black hover:bg-zinc-200 font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Try again (convert video)</span>
                  </button>
                )}
                {/* 1. Ultra Bypass Engine Button */}
                <button
                  onClick={() => {
                    setStreamLoadFailed(false);
                    fallbackAttemptsRef.current = 0;
                    setPlayerEngine('bypass');
                    setStreamFallbackStep(0);
                    setIsBuffering(true);
                    showToast('🚀 Activated Ultra Bypass Engine...');
                    window.setTimeout(() => {
                      if (videoRef.current) {
                        videoRef.current.load();
                        videoRef.current.play().catch(() => {});
                      }
                    }, 80);
                  }}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-transform hover:scale-[1.01] cursor-pointer shadow-lg shadow-amber-500/20"
                >
                  <Zap className="w-4 h-4 fill-black" />
                  <span>🚀 Activate Ultra Bypass Engine</span>
                </button>

                {/* 2. Switch Server Mirror (server2, server3, server4, server5) */}
                <button
                  onClick={() => {
                    const mirrors = ['server2', 'server3', 'server4', 'server5'];
                    const currentIdx = mirrors.indexOf(selectedMirror);
                    const nextMirror = mirrors[(currentIdx + 1) % mirrors.length];
                    setSelectedMirror(nextMirror);
                    setStreamLoadFailed(false);
                    fallbackAttemptsRef.current = 0;
                    setIsBuffering(true);
                    showToast(`🔄 Switched mirror to ${nextMirror.toUpperCase()}...`);
                    window.setTimeout(() => {
                      if (videoRef.current) {
                        videoRef.current.load();
                        videoRef.current.play().catch(() => {});
                      }
                    }, 80);
                  }}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold text-xs sm:text-sm py-2 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer border border-white/10"
                >
                  <RefreshCw className="w-4 h-4 text-emerald-400" />
                  <span>Switch Mirror Server ({selectedMirror === 'auto' ? 'AUTO ROTATE' : selectedMirror.toUpperCase()})</span>
                </button>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => {
                      const urlToCopy = effectiveSafeUrl;
                      navigator.clipboard?.writeText(urlToCopy);
                      showToast('Direct stream link copied to clipboard!');
                    }}
                    className="py-2 px-3 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Stream Link</span>
                  </button>

                  <a
                    href={effectiveSafeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="py-2 px-3 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors text-center"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in VLC</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Center Controls: Fast -10s, Big Play/Pause, Fast +10s (Prominent on Mobile & Desktop) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute inset-0 flex items-center justify-center gap-6 sm:gap-10 pointer-events-none transition-opacity duration-200 z-25 ${
            showControls && !streamLoadFailed && !isResolvingFolder
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Rewind 10s */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              skipRelative(-10);
            }}
            className="pointer-events-auto w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center text-white transition-all active:scale-90 cursor-pointer shadow-xl hover:scale-105"
            title="Rewind 10s"
          >
            <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            <span className="text-[10px] font-mono font-bold leading-none mt-0.5">-10s</span>
          </button>

          {/* Big Center Play / Pause */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="pointer-events-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#E50914] hover:bg-[#f6121d] text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-2xl shadow-red-600/50 hover:scale-105"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 sm:w-10 sm:h-10 fill-white" />
            ) : (
              <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white ml-1" />
            )}
          </button>

          {/* Fast Forward 10s */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              skipRelative(10);
            }}
            className="pointer-events-auto w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center text-white transition-all active:scale-90 cursor-pointer shadow-xl hover:scale-105"
            title="Forward 10s"
          >
            <RotateCw className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            <span className="text-[10px] font-mono font-bold leading-none mt-0.5">+10s</span>
          </button>
        </div>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#161B26] border border-amber-500/40 text-amber-300 text-xs font-semibold px-4 py-2 rounded-full shadow-2xl backdrop-blur-md">
          {toastMessage}
        </div>
      )}

      {/* Top HUD Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute top-0 inset-x-0 bg-gradient-to-b from-black/90 via-black/50 to-transparent px-4 sm:px-8 py-4 flex items-center justify-between transition-opacity duration-200 z-30 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Back to Catalog (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-lg font-display font-bold text-white truncate">
              {video.cleanTitle}
              {video.season !== undefined && video.episode !== undefined && (
                <span className="ml-2 text-xs font-mono text-[#E50914] font-semibold">
                  S{String(video.season).padStart(2, '0')}E{String(video.episode).padStart(2, '0')}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2 text-[11px] sm:text-xs text-zinc-300 truncate">
              {video.year && <span>{video.year}</span>}
              {video.quality && (
                <>
                  <span>·</span>
                  <span>{video.quality}</span>
                </>
              )}
              {currentAudioLabel && (
                <>
                  <span>·</span>
                  <span className="text-emerald-400 font-medium">{currentAudioLabel}</span>
                </>
              )}
              {video.runtime && (
                <>
                  <span>·</span>
                  <span className="text-amber-300 font-mono font-medium">{video.runtime}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Top Stream Controls & Playlist Drawer */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Right Episodes Drawer Button (if playlist has multiple episodes or seasons exist) */}
          {(playlist.length > 1 || (seasons && seasons.length > 0)) && (
            <button
              onClick={() => setActiveMenu(activeMenu === 'playlist' ? null : 'playlist')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeMenu === 'playlist'
                  ? 'bg-[#E50914] text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <ListVideo className="w-4 h-4" />
              <span>
                {seasons && seasons.length > 0 ? 'Episodes' : `(${playlist.length})`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Popover Menus (Audio Language, Subtitles, Settings, Playlist) */}
      {activeMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-24 right-4 sm:right-8 w-[calc(100vw-2rem)] sm:w-80 max-h-[65vh] overflow-y-auto bg-[#11131C]/95 backdrop-blur-xl border border-white/15 rounded-2xl p-4 shadow-2xl z-40 space-y-3"
        >
          {/* AUDIO LANGUAGE MENU */}
          {activeMenu === 'audio' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#E50914]" />
                  <h3 className="text-sm font-semibold text-white">Audio Language</h3>
                </div>
                <button
                  onClick={() => setActiveMenu(null)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                {probedAudioTracks.map((track) => {
                  const isSelected = selectedAudioTrack === track.audioIndex;
                  return (
                    <button
                      key={track.audioIndex}
                      onClick={() => handleSelectAudioTrack(track.audioIndex)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#E50914] text-white font-semibold'
                          : 'bg-white/5 hover:bg-white/10 text-zinc-200'
                      }`}
                    >
                      <span className="truncate">{track.label}</span>
                      {isSelected && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* SUBTITLES MENU */}
          {activeMenu === 'subtitles' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <Subtitles className="w-4 h-4 text-[#E50914]" />
                  <h3 className="text-sm font-semibold text-white">Subtitles & Captions</h3>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1 cursor-pointer border border-amber-500/30 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload .SRT / .VTT
                </button>
              </div>

              {/* Subtitle Tracks List */}
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                <button
                  onClick={() => {
                    setActiveSubId('off');
                    setActiveMenu(null);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                    activeSubId === 'off'
                      ? 'bg-[#E50914] text-white font-semibold'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                  }`}
                >
                  <span>Off</span>
                  {activeSubId === 'off' && <Check className="w-4 h-4" />}
                </button>

                {subtitles.map((sub) => {
                  const id = `ext-${sub.id}`;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setActiveSubId(id);
                        setActiveMenu(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                        activeSubId === id
                          ? 'bg-[#E50914] text-white font-semibold'
                          : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                      }`}
                    >
                      <span className="truncate">{sub.rawName}</span>
                      {activeSubId === id && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}

                {probedSubTracks.map((sub) => {
                  const id = `emb-${sub.subIndex}`;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setActiveSubId(id);
                        setActiveMenu(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                        activeSubId === id
                          ? 'bg-[#E50914] text-white font-semibold'
                          : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                      }`}
                    >
                      <span className="truncate">{sub.label}</span>
                      {activeSubId === id && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}

                {customSubs.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => {
                      setActiveSubId(sub.id);
                      setActiveMenu(null);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                      activeSubId === sub.id
                        ? 'bg-[#E50914] text-white font-semibold'
                        : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                    }`}
                  >
                    <span className="truncate">{sub.label}</span>
                    {activeSubId === sub.id && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                ))}

                {subtitles.length === 0 && probedSubTracks.length === 0 && customSubs.length === 0 && (
                  <p className="text-[11px] text-zinc-400 p-2 text-center bg-white/5 rounded-lg">
                    No online subtitles found. Click "Upload .SRT" to add your own subtitle file!
                  </p>
                )}
              </div>

              {/* Subtitle Timing Sync (Delay Offset) */}
              <div className="pt-2 border-t border-white/10 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Subtitle Sync / Delay</span>
                  <span className="font-mono text-amber-400">
                    {subOffset > 0 ? `+${subOffset.toFixed(1)}s` : `${subOffset.toFixed(1)}s`}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs font-mono">
                  <button
                    onClick={() => setSubOffset((o) => Number((o - 1).toFixed(1)))}
                    className="flex-1 py-1 bg-white/5 hover:bg-white/10 rounded text-zinc-300 cursor-pointer"
                  >
                    -1.0s
                  </button>
                  <button
                    onClick={() => setSubOffset((o) => Number((o - 0.5).toFixed(1)))}
                    className="flex-1 py-1 bg-white/5 hover:bg-white/10 rounded text-zinc-300 cursor-pointer"
                  >
                    -0.5s
                  </button>
                  <button
                    onClick={() => setSubOffset(0)}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-zinc-400 cursor-pointer"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => setSubOffset((o) => Number((o + 0.5).toFixed(1)))}
                    className="flex-1 py-1 bg-white/5 hover:bg-white/10 rounded text-zinc-300 cursor-pointer"
                  >
                    +0.5s
                  </button>
                  <button
                    onClick={() => setSubOffset((o) => Number((o + 1).toFixed(1)))}
                    className="flex-1 py-1 bg-white/5 hover:bg-white/10 rounded text-zinc-300 cursor-pointer"
                  >
                    +1.0s
                  </button>
                </div>
              </div>

              {/* Font Size Selector */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                <span className="text-zinc-400">Subtitle Size</span>
                <div className="flex items-center gap-1">
                  {(['sm', 'md', 'lg', 'xl'] as const).map((sz) => (
                    <button
                      key={sz}
                      onClick={() => setSubFontSize(sz)}
                      className={`px-2.5 py-1 rounded-lg uppercase font-mono text-[11px] cursor-pointer transition-colors ${
                        subFontSize === sz
                          ? 'bg-white text-black font-semibold'
                          : 'bg-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS MENU (Speed & Screen Fit) */}
          {activeMenu === 'settings' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#E50914]" />
                  <h3 className="text-sm font-semibold text-white">Player Settings</h3>
                </div>
                <button
                  onClick={() => setActiveMenu(null)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Playback Speed */}
              <div className="space-y-1.5">
                <p className="text-xs text-zinc-400">Playback Speed</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {[0.75, 1, 1.25, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => {
                        setPlaybackSpeed(spd);
                        if (videoRef.current) videoRef.current.playbackRate = spd;
                      }}
                      className={`py-1.5 rounded-lg text-xs font-mono cursor-pointer ${
                        playbackSpeed === spd
                          ? 'bg-[#E50914] text-white font-semibold'
                          : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Screen Fit */}
              <div className="space-y-1.5 pt-2 border-t border-white/10">
                <p className="text-xs text-zinc-400">Screen Fit</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'contain', label: 'Original Fit' },
                      { id: 'cover', label: 'Zoom Fill' },
                      { id: '21:9', label: '21:9 Cinema' },
                      { id: 'fill', label: 'Stretch Full' },
                    ] as const
                  ).map((asp) => (
                    <button
                      key={asp.id}
                      onClick={() => setAspectMode(asp.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                        aspectMode === asp.id
                          ? 'bg-white text-black font-semibold'
                          : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                      }`}
                    >
                      {asp.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* EPISODE / SEASON PLAYLIST MENU */}
          {activeMenu === 'playlist' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <h3 className="text-sm font-semibold text-white">
                  {seasons && seasons.length > 0
                    ? `Seasons & Episodes (${playlist.length})`
                    : `Episodes (${playlist.length})`}
                </h3>
                <button
                  onClick={() => setActiveMenu(null)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {seasons && seasons.length > 0 && onSelectSeason && (
                <div className="space-y-1.5 pb-2 border-b border-white/10">
                  <p className="text-[11px] font-mono text-zinc-400">Select Season:</p>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {seasons.map((s) => {
                      const isCurrentSeason = video.season === s.seasonNumber;
                      return (
                        <button
                          key={s.id}
                          onClick={() => onSelectSeason(s)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            isCurrentSeason
                              ? 'bg-[#E50914] text-white'
                              : 'bg-white/10 hover:bg-white/15 text-zinc-300'
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {playlist.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectVideo(item);
                      setActiveMenu(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-2 cursor-pointer ${
                      item.id === video.id
                        ? 'bg-[#E50914] text-white font-semibold'
                        : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                    }`}
                  >
                    <span className="truncate">
                      {item.episode !== undefined
                        ? `Ep ${item.episode} — ${item.cleanTitle}`
                        : `${idx + 1}. ${item.cleanTitle}`}
                    </span>
                    <span className="font-mono text-[11px] opacity-75 shrink-0">
                      {item.sizeFormatted}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Transport Controls HUD */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-4 sm:px-8 pt-10 pb-4 sm:pb-5 transition-opacity duration-200 z-30 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrubber Timeline */}
        <div className="mb-3.5 flex items-center gap-3">
          <span className="text-xs font-mono text-white font-medium w-12 sm:w-14 text-right shrink-0">
            {formatTime(displayedTime)}
          </span>

          <div className="relative flex-1 flex items-center h-5 group">
            {/* Track Background */}
            <div className="w-full h-1.5 group-hover:h-2 bg-white/20 rounded-full overflow-hidden transition-all">
              {/* Buffered Bar */}
              <div
                className="h-full bg-white/35 transition-all duration-200"
                style={{ width: `${bufferedPercent}%` }}
              />
            </div>

            {/* Active Red Progress Bar */}
            <div
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-1.5 group-hover:h-2 bg-[#E50914] rounded-full transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Thumb Indicator */}
            <div
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[#E50914] shadow-[0_0_10px_rgba(229,9,20,0.9)] ring-2 ring-white transition-transform group-hover:scale-125"
              style={{ left: `${progressPercent}%` }}
            />

            {/* Range Input */}
            <input
              type="range"
              min={0}
              max={effectiveDuration || 100}
              step={0.5}
              value={displayedTime}
              onMouseDown={() => setIsScrubbing(true)}
              onTouchStart={() => setIsScrubbing(true)}
              onChange={(e) => {
                const val = Number(e.target.value);
                setIsScrubbing(true);
                setScrubTime(val);
              }}
              onMouseUp={(e) => {
                const val = Number((e.target as HTMLInputElement).value);
                setIsScrubbing(false);
                handleSeek(val);
              }}
              onTouchEnd={(e) => {
                const val = Number((e.target as HTMLInputElement).value);
                setIsScrubbing(false);
                handleSeek(val);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-none"
            />
          </div>

          <span className="text-xs font-mono text-zinc-300 min-w-12 sm:min-w-16 shrink-0 font-medium text-left">
            {formatTime(effectiveDuration)}
          </span>
        </div>

        {/* Control Buttons Row */}
        <div className="flex items-center justify-between gap-2">
          {/* Left Transport Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-[#E50914] hover:bg-[#f6121d] text-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shrink-0"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-white" />
              ) : (
                <Play className="w-5 h-5 fill-white ml-0.5" />
              )}
            </button>

            <button
              onClick={() => skipRelative(-10)}
              className="p-2 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-xs font-mono"
              title="Rewind 10s"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden xs:inline">10s</span>
            </button>

            <button
              onClick={() => skipRelative(10)}
              className="p-2 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-xs font-mono"
              title="Forward 10s"
            >
              <RotateCw className="w-4 h-4" />
              <span className="hidden xs:inline">10s</span>
            </button>

            {prevVideo && (
              <button
                onClick={() => onSelectVideo(prevVideo)}
                className="p-2 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer hidden md:flex"
                title={`Previous: ${prevVideo.cleanTitle}`}
              >
                <SkipBack className="w-5 h-5" />
              </button>
            )}

            {nextVideo && (
              <button
                onClick={() => onSelectVideo(nextVideo)}
                className="p-2 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors cursor-pointer hidden sm:flex items-center gap-1 text-xs font-medium"
                title={`Next Episode: ${nextVideo.cleanTitle}`}
              >
                <SkipForward className="w-5 h-5" />
                <span className="hidden lg:inline">Next</span>
              </button>
            )}

            {/* Volume Control & Sound Booster */}
            <div className="flex items-center gap-1.5 sm:gap-2 ml-0.5">
              <button
                onClick={() => setIsMuted((m) => !m)}
                className="p-2 rounded-lg hover:bg-white/10 text-zinc-200 hover:text-white transition-colors cursor-pointer"
                title="Mute (M)"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5 text-rose-400" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setVolume(val);
                  setIsMuted(val === 0);
                  if (videoRef.current) videoRef.current.volume = val;
                }}
                className="hidden md:block w-16 lg:w-20 accent-[#E50914] cursor-pointer"
              />

              {/* Volume Booster (300% Clear Dialogue & Sound Boost) */}
              <button
                onClick={() => {
                  ensureAudioNodes();
                  // Cycle 1.0 (Normal 100%) -> 1.5 (150%) -> 2.0 (200%) -> 3.0 (300% Super Boost)
                  const levels = [1.0, 1.5, 2.0, 3.0];
                  const currentIndex = levels.indexOf(audioBoostLevel);
                  const nextLevel = levels[(currentIndex + 1) % levels.length] || 1.5;
                  setAudioBoostLevel(nextLevel);
                  setIsBoostEnabled(true);
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 border select-none ${
                  audioBoostLevel > 1.0
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10'
                    : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                }`}
                title="Sound Booster: Boost quiet audio & dialogue up to 300% with vocal compressor"
              >
                <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span>{Math.round(audioBoostLevel * 100)}%</span>
              </button>
            </div>
          </div>

          {/* Right Controls: Audio / Subtitles / Settings / PiP / Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Audio Language Button (only shown if multiple tracks detected) */}
            {probedAudioTracks.length > 1 && (
              <button
                onClick={() => setActiveMenu(activeMenu === 'audio' ? null : 'audio')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  activeMenu === 'audio'
                    ? 'bg-[#E50914] text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title="Change Audio Language"
              >
                <Globe className="w-4 h-4 text-[#E50914] shrink-0" />
                <span className="max-w-[95px] sm:max-w-[140px] truncate">
                  {currentAudioLabel}
                </span>
              </button>
            )}

            {/* Subtitles Button (Always visible so users can upload .SRT/.VTT, sync offset, or pick subs) */}
            <button
              onClick={() => setActiveMenu(activeMenu === 'subtitles' ? null : 'subtitles')}
              className={`px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeMenu === 'subtitles' || activeSubId !== 'off'
                  ? 'bg-[#E50914] text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              title="Subtitles & Captions"
            >
              <Subtitles className="w-4 h-4" />
              <span className="hidden sm:inline">Subtitles</span>
              {activeSubId !== 'off' && (
                <span className="w-1.5 h-1.5 rounded-full bg-white ml-0.5"></span>
              )}
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setActiveMenu(activeMenu === 'settings' ? null : 'settings')}
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                activeMenu === 'settings'
                  ? 'bg-[#E50914] text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              title="Speed & Screen Fit"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Picture-in-Picture */}
            <button
              onClick={togglePiP}
              className="hidden sm:flex p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Picture-in-Picture"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title="Fullscreen (F)"
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
