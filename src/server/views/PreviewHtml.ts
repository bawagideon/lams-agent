import type { RealEpisodeDetails } from '../../bridge/YTEngineBridge.ts';
import type { ExportedVideoFile } from '../../adapters/media/ExportFolderWatcher.ts';
import { escapeHtml } from '../utils/htmlEscape.ts';

export function renderPreviewHtml(
  episode: RealEpisodeDetails,
  exportedVideo: ExportedVideoFile | null,
  isYouTubeConnected: boolean
): string {
  const scenesWithVideo = episode.scenes.filter(s => !!s.videoUrl);
  const initialVideoUrl = exportedVideo ? `/api/exports/${encodeURIComponent(exportedVideo.fileName)}` : (scenesWithVideo[0]?.videoUrl || '');

  return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(episode.title)} — Episode Studio | LAMS HQ</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#f5f3ff',
              100: '#ede9fe',
              500: '#6366f1',
              600: '#4f46e5',
              700: '#4338ca',
            }
          }
        }
      }
    }
  </script>
  <style>
    body { background-color: #f8fafc; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .fade-in { animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    .card-hover { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
    .card-hover:hover { transform: translateY(-2px); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); }
    .active-scene-card { border-color: #4338ca !important; background-color: #f5f3ff !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: rgba(0,0,0,0.03); }
    ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
  </style>
</head>
<body class="min-h-full flex flex-col bg-[#f8fafc] text-gray-900 antialiased">

  <!-- ============================================================ -->
  <!-- 1. TOP BAR NAVIGATION                                        -->
  <!-- ============================================================ -->
  <header class="border-b border-gray-200/80 bg-white px-8 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm backdrop-blur-md">
    <div class="flex items-center space-x-5">
      <a href="/episodes" class="text-xs bg-gray-50 hover:bg-gray-100 text-gray-700 font-semibold border border-gray-200 px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
        </svg>
        <span>Back to Studio</span>
      </a>

      <div class="h-5 w-px bg-gray-200"></div>

      <div>
        <div class="flex items-center gap-2">
          <span class="text-[11px] bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold">${escapeHtml(episode.projectName)}</span>
          <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
            episode.status === 'Review' ? 'bg-[#fef3c7] text-[#92400e]' :
            episode.status === 'Scheduled' ? 'bg-emerald-50 text-emerald-700' :
            'bg-gray-100 text-gray-600'
          }">
            ${escapeHtml(episode.status === 'Review' ? 'In review' : episode.status)}
          </span>
        </div>
        <h1 class="text-lg font-black text-gray-900 mt-0.5 leading-snug">${escapeHtml(episode.title)}</h1>
      </div>
    </div>

    <!-- Actions Header -->
    <div class="flex items-center gap-3">
      <button id="btnCapCutTop" data-episode-id="${escapeHtml(episode.id)}" class="border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm">
        ✂️ Open in CapCut
      </button>
      <button id="btnRenderTop" data-episode-id="${escapeHtml(episode.id)}" class="border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm">
        ⚡ Render Video
      </button>
      <button id="btnApproveTop" data-episode-id="${escapeHtml(episode.id)}" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-bold px-5 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition">
        <span>Go to release</span>
      </button>
    </div>
  </header>

  <!-- ============================================================ -->
  <!-- 2. MAIN WORKSPACE GRID                                       -->
  <!-- ============================================================ -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-8 grid grid-cols-12 gap-8">
    
    <!-- Left Column: Video Player & Filmstrip (7 cols) -->
    <div class="col-span-12 lg:col-span-7 space-y-6">
      
      <!-- Video Player Card -->
      <div class="bg-white border border-gray-200/80 rounded-3xl p-5 shadow-sm space-y-3">
        <div class="relative bg-black rounded-2xl overflow-hidden aspect-video flex items-center justify-center border border-gray-200 shadow-inner">
          ${initialVideoUrl ? `
            <video id="mainVideoPlayer" controls autoplay playsinline class="w-full h-full object-contain">
              <source src="${escapeHtml(initialVideoUrl)}" type="video/mp4">
              Your browser does not support the video tag.
            </video>
          ` : `
            <div class="text-center p-8 text-gray-400">
              <div class="text-4xl mb-2">🎬</div>
              <p class="text-sm font-semibold text-gray-600">No rendered video clip available yet</p>
              <p class="text-xs text-gray-400 mt-1">Scenes are generating or awaiting asset sync.</p>
            </div>
          `}
        </div>

        <!-- Player Info Ribbon -->
        <div class="flex items-center justify-between text-xs text-gray-500 pt-1 px-1">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span id="playerCurrentLabel" class="font-semibold text-gray-800 truncate">
              ${exportedVideo ? `Master Export: ${escapeHtml(exportedVideo.fileName)}` : (scenesWithVideo[0] ? `Scene 1: ${escapeHtml(scenesWithVideo[0].title)}` : 'No clip loaded')}
            </span>
          </div>
          <span class="font-medium text-gray-500">
            ${episode.completedScenesCount} of ${episode.scenes.length} Scenes Ready
          </span>
        </div>
      </div>

      <!-- Scenes Filmstrip List -->
      <div class="bg-white border border-gray-200/80 rounded-3xl p-6 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm font-bold text-gray-900">Scene Sequence</h2>
            <p class="text-xs text-gray-400">Click any scene to play its video preview</p>
          </div>
          <span class="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-semibold">
            ${episode.scenes.length} Scenes
          </span>
        </div>

        <div class="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          ${episode.scenes.map((sc, idx) => `
            <div 
              id="scene-card-${escapeHtml(sc.id)}"
              data-video-url="${escapeHtml(sc.videoUrl || '')}"
              data-scene-number="${sc.sceneNumber}"
              data-title="${escapeHtml(sc.title)}"
              data-scene-id="${escapeHtml(sc.id)}"
              data-prompt="${escapeHtml(sc.visualPrompt || '')}"
              class="scene-card-item p-4 bg-gray-50/80 border border-gray-200 hover:border-indigo-300 rounded-2xl cursor-pointer transition flex items-start gap-4 group card-hover ${idx === 0 && !exportedVideo ? 'active-scene-card' : ''}"
            >
              <div class="flex-shrink-0 w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-[#4338ca] group-hover:bg-[#4338ca] group-hover:text-white transition shadow-sm">
                #${sc.sceneNumber}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-bold text-gray-900 truncate">${escapeHtml(sc.title)}</h4>
                  <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${sc.videoUrl ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}">
                    ${sc.duration}s • ${sc.videoUrl ? 'Ready' : 'Rendering'}
                  </span>
                </div>
                <p class="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">${escapeHtml(sc.visualPrompt || 'No visual description')}</p>
              </div>
              <div class="flex-shrink-0 text-gray-400 group-hover:text-[#4338ca] transition pt-1">
                ▶
              </div>
            </div>
          `).join('')}
        </div>
      </div>

    </div>

    <!-- Right Column: Details, Narration, Master Video & Publishing (5 cols) -->
    <div class="col-span-12 lg:col-span-5 space-y-6">
      
      <!-- Episode Premise Card -->
      <div class="bg-white border border-gray-200/80 rounded-3xl p-6 shadow-sm space-y-3">
        <h3 class="text-sm font-bold text-gray-900">Episode Premise</h3>
        <p class="text-xs text-gray-600 leading-relaxed">${escapeHtml(episode.topic)}</p>
        <div class="pt-2 flex items-center justify-between text-xs text-gray-400 border-t border-gray-100">
          <span>Project: <strong class="text-gray-700">${escapeHtml(episode.projectName)}</strong></span>
          <span>Created: <strong class="text-gray-700">${new Date(episode.createdAt).toLocaleDateString()}</strong></span>
        </div>
      </div>

      <!-- Active Scene Script / Narration -->
      <div class="bg-white border border-gray-200/80 rounded-3xl p-6 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-gray-900">Visual Prompt & Narration</h3>
          <span id="activeScenePromptBadge" class="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full font-mono">
            Scene #1
          </span>
        </div>
        <div id="activeScenePromptText" class="p-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-gray-700 leading-relaxed font-normal italic">
          ${escapeHtml(episode.scenes[0]?.visualPrompt || 'Select a scene to inspect its script and visual directions.')}
        </div>
      </div>

      <!-- Master Exported Video File Card -->
      <div class="bg-white border border-gray-200/80 rounded-3xl p-6 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-bold text-gray-900">Master Export Video</h3>
            <p class="text-xs text-gray-400">File in <code class="text-indigo-600 font-mono">watched_exports/</code></p>
          </div>
          <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full ${exportedVideo ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}">
            ${exportedVideo ? 'Detected' : 'Not Found'}
          </span>
        </div>

        ${exportedVideo ? `
          <div class="p-3.5 bg-emerald-50/60 border border-emerald-100 rounded-2xl space-y-2 text-xs">
            <div class="font-bold text-emerald-950 truncate">${escapeHtml(exportedVideo.fileName)}</div>
            <div class="text-[11px] text-emerald-800">${exportedVideo.sizeMb} MB • Modified ${new Date(exportedVideo.modifiedAt).toLocaleTimeString()}</div>
            <button id="btnPlayMaster" data-url="/api/exports/${encodeURIComponent(exportedVideo.fileName)}" data-filename="${escapeHtml(exportedVideo.fileName)}" class="mt-1 w-full text-center bg-white hover:bg-emerald-50 text-emerald-800 font-semibold py-1.5 rounded-xl border border-emerald-200 transition">
              ▶ Load Master in Player
            </button>
          </div>
        ` : `
          <div class="p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-center text-xs text-gray-500 space-y-2">
            <p>No master export detected yet. After editing in CapCut, export to the <code class="text-indigo-600 font-mono">watched_exports</code> folder or click below to render via FFmpeg.</p>
            <button id="btnFfmpegFallback" data-episode-id="${escapeHtml(episode.id)}" class="bg-white hover:bg-gray-100 text-gray-800 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 transition shadow-sm">
              Render Video with FFmpeg
            </button>
          </div>
        `}
      </div>

      <!-- YouTube Channel Link Card -->
      <div class="bg-white border border-gray-200/80 rounded-3xl p-6 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-gray-900">Publishing Channel</h3>
          <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full ${isYouTubeConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}">
            ${isYouTubeConnected ? 'Linked' : 'Not Connected'}
          </span>
        </div>
        <p class="text-xs text-gray-600 leading-relaxed">
          ${isYouTubeConnected 
            ? 'Channel is ready. Releases are published privately first, so you can review before anyone else sees them.'
            : 'Sign in with your Google account on the Home screen to enable direct publishing.'}
        </p>
      </div>

    </div>

  </main>

  <!-- ============================================================ -->
  <!-- 3. STUDIO ACCESS KEY MODAL                                   -->
  <!-- ============================================================ -->
  <div id="studioKeyModal" class="hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-200 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">
            🔑
          </div>
          <div>
            <h3 class="text-base font-black text-gray-900">Studio Key Required</h3>
            <p class="text-[11px] text-gray-500">Authorize CapCut & Render pipeline</p>
          </div>
        </div>
        <button id="btnCloseKeyModal" class="text-gray-400 hover:text-gray-600 p-1 rounded-lg">✕</button>
      </div>

      <p id="studioKeyDescription" class="text-xs text-gray-600 leading-relaxed">
        Desktop operations (CapCut draft assembly and FFmpeg rendering) require creator authorization. Enter your studio key or use dev mode.
      </p>

      <div class="space-y-2">
        <label for="studioKeyInput" class="block text-[11px] font-bold text-gray-700 uppercase tracking-wider">Creator Key / Password</label>
        <div class="flex gap-2">
          <input 
            type="password" 
            id="studioKeyInput" 
            placeholder="Enter key or 'admin'" 
            class="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition"
          />
          <button id="btnDevKeyFill" type="button" class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 transition">
            Dev Key
          </button>
        </div>
        <p id="studioKeyError" class="hidden text-xs text-red-600 font-medium pt-1"></p>
      </div>

      <div class="flex items-center justify-end gap-2.5 pt-2">
        <button id="btnCancelKeyModal" type="button" class="border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition">
          Cancel
        </button>
        <button id="btnSubmitKeyModal" type="button" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm transition">
          Authorize & Continue
        </button>
      </div>
    </div>
  </div>

  <!-- ============================================================ -->
  <!-- 4. OPERATION RESULT MODAL (CapCut & FFmpeg)                  -->
  <!-- ============================================================ -->
  <div id="studioResultModal" class="hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div id="studioResultIcon" class="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">
            ✓
          </div>
          <div>
            <h3 id="studioResultTitle" class="text-base font-black text-gray-900">Operation Complete</h3>
            <p id="studioResultSubtitle" class="text-[11px] text-gray-500">Asset ready in studio</p>
          </div>
        </div>
        <button id="btnCloseResultModal" class="text-gray-400 hover:text-gray-600 p-1 rounded-lg">✕</button>
      </div>

      <div id="studioResultBody" class="text-xs text-gray-600 space-y-3"></div>

      <div id="studioResultActions" class="flex items-center justify-end gap-2.5 pt-2">
        <button id="btnDismissResultModal" class="border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition">
          Done
        </button>
      </div>
    </div>
  </div>

  <!-- ============================================================ -->
  <!-- 5. SAFE-MODE RELEASE ROOM MODAL                              -->
  <!-- ============================================================ -->
  <div id="releaseRoomModal" class="hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-white rounded-3xl max-w-lg w-full p-7 shadow-2xl border border-gray-200 space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-[11px] font-bold text-indigo-600 tracking-wide uppercase">Safe Mode Release Room</span>
          <h3 class="text-lg font-black text-gray-900">Confirm YouTube Release</h3>
        </div>
        <button data-action="close-release" class="text-gray-400 hover:text-gray-600 p-1 rounded-lg">✕</button>
      </div>

      <p class="text-xs text-gray-500 leading-relaxed">
        LAMS HQ will upload your video directly to YouTube as a <strong>Private video</strong>. It will not be visible to the public until you choose to publish it.
      </p>

      <!-- Preflight Checklist Container -->
      <div id="preflightList" class="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3 text-xs">
        <div class="text-center py-3 text-gray-400">Checking release prerequisites...</div>
      </div>

      <!-- Status or Error Message -->
      <div id="releaseStatusMessage" class="hidden text-xs rounded-xl p-3"></div>

      <!-- Modal Action Buttons -->
      <div class="flex items-center justify-end gap-3 pt-2">
        <button data-action="close-release" class="border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition">
          Cancel
        </button>
        <button id="btnConfirmRelease" disabled class="bg-[#4338ca] hover:bg-[#3730a3] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-sm transition">
          Publish as Private Release
        </button>
      </div>
    </div>
  </div>

  <!-- Interactive JavaScript -->
  <script>
    const episodeId = '${escapeHtml(episode.id)}';
    let currentApprovalToken = null;
    let pendingAction = null;
    let savedCsrfToken = null;

    async function requestWithAuth(url, options = {}) {
      const headers = options.headers || {};
      if (savedCsrfToken) {
        headers['x-csrf-token'] = savedCsrfToken;
      }
      options.headers = headers;
      options.credentials = 'same-origin';
      return await fetch(url, options);
    }

    function openKeyModal(desc, pending) {
      if (pending) pendingAction = pending;
      const modal = document.getElementById('studioKeyModal');
      const descEl = document.getElementById('studioKeyDescription');
      const errEl = document.getElementById('studioKeyError');
      const input = document.getElementById('studioKeyInput');
      if (descEl && desc) descEl.innerText = desc;
      if (errEl) {
        errEl.innerText = '';
        errEl.classList.add('hidden');
      }
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 50);
      }
      if (modal) modal.classList.remove('hidden');
    }

    function closeKeyModal() {
      const modal = document.getElementById('studioKeyModal');
      if (modal) modal.classList.add('hidden');
    }

    async function submitStudioKey() {
      const input = document.getElementById('studioKeyInput');
      const errEl = document.getElementById('studioKeyError');
      const btn = document.getElementById('btnSubmitKeyModal');
      const key = input ? input.value.trim() : '';
      if (!key) {
        if (errEl) {
          errEl.innerText = 'Please enter your studio key or use Dev Key.';
          errEl.classList.remove('hidden');
        }
        return;
      }
      if (btn) btn.innerText = 'Verifying...';
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: key }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Invalid credentials. Please try again.');
        }
        savedCsrfToken = data.csrfToken;
        closeKeyModal();
        if (pendingAction) {
          const act = pendingAction;
          pendingAction = null;
          if (act.type === 'capcut') {
            await triggerCapCutDraft(act.id);
          } else if (act.type === 'render') {
            await triggerFfmpegRender(act.id);
          }
        }
      } catch (err) {
        if (errEl) {
          errEl.innerText = err.message;
          errEl.classList.remove('hidden');
        }
      } finally {
        if (btn) btn.innerText = 'Authorize & Continue';
      }
    }

    function showCapCutSuccessModal(data) {
      const modal = document.getElementById('studioResultModal');
      const title = document.getElementById('studioResultTitle');
      const sub = document.getElementById('studioResultSubtitle');
      const body = document.getElementById('studioResultBody');
      const actions = document.getElementById('studioResultActions');

      title.innerText = 'CapCut Draft Assembled!';
      sub.innerText = 'Draft project generated with ' + (data.tracksCount || '4') + ' tracks';

      const draftPath = data.draftPath || 'data/capcut_projects/...';
      body.innerHTML = 
        '<div class="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2">' +
          '<div class="flex items-center justify-between text-gray-500">' +
            '<span class="font-bold uppercase tracking-wider text-[10px]">Project Draft Location</span>' +
            '<button id="btnCopyDraftPath" class="text-indigo-600 hover:text-indigo-800 text-[11px] font-semibold flex items-center gap-1">📋 Copy Path</button>' +
          '</div>' +
          '<code id="draftPathCode" class="block bg-white border border-gray-200 rounded-lg p-2 font-mono text-[11px] text-gray-800 break-all select-all">' + draftPath + '</code>' +
        '</div>' +
        '<div class="space-y-1.5 text-gray-600">' +
          '<p class="font-semibold text-gray-900">Next Steps in Desktop:</p>' +
          '<ol class="list-decimal list-inside space-y-1">' +
            '<li>Open <strong>CapCut Desktop</strong> on your computer.</li>' +
            '<li>The project is already in your CapCut project drafts list.</li>' +
            '<li>Review and polish cuts, animations, audio, and subtitles.</li>' +
          '</ol>' +
        '</div>';

      actions.innerHTML = 
        '<button id="btnDismissResultModal" class="border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition">Close</button>' +
        '<button id="btnTriggerRenderFromCapcut" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm transition">⚡ Render Video Now</button>';

      modal.classList.remove('hidden');

      document.getElementById('btnCopyDraftPath')?.addEventListener('click', () => {
        navigator.clipboard.writeText(draftPath).then(() => {
          const btn = document.getElementById('btnCopyDraftPath');
          if (btn) btn.innerText = '✓ Copied!';
          setTimeout(() => {
            const b = document.getElementById('btnCopyDraftPath');
            if (b) b.innerText = '📋 Copy Path';
          }, 2000);
        });
      });

      document.getElementById('btnDismissResultModal')?.addEventListener('click', () => {
        modal.classList.add('hidden');
      });

      document.getElementById('btnTriggerRenderFromCapcut')?.addEventListener('click', () => {
        modal.classList.add('hidden');
        triggerFfmpegRender(episodeId);
      });
    }

    function showRenderSuccessModal(data) {
      const modal = document.getElementById('studioResultModal');
      const title = document.getElementById('studioResultTitle');
      const sub = document.getElementById('studioResultSubtitle');
      const body = document.getElementById('studioResultBody');
      const actions = document.getElementById('studioResultActions');

      title.innerText = 'Master Video Rendered!';
      sub.innerText = 'FFmpeg render pipeline completed successfully';

      const outPath = data.outputPath || 'data/renders/...';
      body.innerHTML = 
        '<div class="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2">' +
          '<div class="flex items-center justify-between text-gray-500">' +
            '<span class="font-bold uppercase tracking-wider text-[10px]">Rendered Output File</span>' +
            '<button id="btnCopyRenderPath" class="text-indigo-600 hover:text-indigo-800 text-[11px] font-semibold flex items-center gap-1">📋 Copy Path</button>' +
          '</div>' +
          '<code id="renderPathCode" class="block bg-white border border-gray-200 rounded-lg p-2 font-mono text-[11px] text-gray-800 break-all select-all">' + outPath + '</code>' +
        '</div>' +
        '<p class="text-gray-600">Your master video has been rendered and saved. You can preview it in the player or proceed to the Safe-Mode Release Room.</p>';

      actions.innerHTML = 
        '<button id="btnDismissResultModal" class="border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition">Close</button>' +
        '<button id="btnOpenReleaseAfterRender" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm transition">🚀 Open Release Room</button>';

      modal.classList.remove('hidden');

      document.getElementById('btnCopyRenderPath')?.addEventListener('click', () => {
        navigator.clipboard.writeText(outPath).then(() => {
          const btn = document.getElementById('btnCopyRenderPath');
          if (btn) btn.innerText = '✓ Copied!';
          setTimeout(() => {
            const b = document.getElementById('btnCopyRenderPath');
            if (b) b.innerText = '📋 Copy Path';
          }, 2000);
        });
      });

      document.getElementById('btnDismissResultModal')?.addEventListener('click', () => {
        modal.classList.add('hidden');
        window.location.reload();
      });

      document.getElementById('btnOpenReleaseAfterRender')?.addEventListener('click', () => {
        modal.classList.add('hidden');
        openReleaseRoom(episodeId);
      });
    }

    function playScene(url, sceneNum, title, sceneId, prompt) {
      const player = document.getElementById('mainVideoPlayer');
      const label = document.getElementById('playerCurrentLabel');
      const promptBadge = document.getElementById('activeScenePromptBadge');
      const promptText = document.getElementById('activeScenePromptText');

      if (!url) {
        alert('Scene video is still generating or not found.');
        return;
      }

      if (player) {
        player.src = url;
        player.play().catch(() => {});
      }

      if (label) {
        label.innerText = 'Scene #' + sceneNum + ': ' + title;
      }

      if (promptBadge) {
        promptBadge.innerText = 'Scene #' + sceneNum;
      }

      if (promptText) {
        promptText.innerText = prompt || 'No prompt recorded for this scene.';
      }

      document.querySelectorAll('.scene-card-item').forEach(el => {
        el.classList.remove('active-scene-card');
      });
      const card = document.getElementById('scene-card-' + sceneId);
      if (card) card.classList.add('active-scene-card');
    }

    function playMasterVideo(url, fileName) {
      const player = document.getElementById('mainVideoPlayer');
      const label = document.getElementById('playerCurrentLabel');

      if (player) {
        player.src = url;
        player.play().catch(() => {});
      }
      if (label) {
        label.innerText = 'Master Export: ' + fileName;
      }

      document.querySelectorAll('.scene-card-item').forEach(el => {
        el.classList.remove('active-scene-card');
      });
    }

    async function triggerCapCutDraft(id) {
      const btn = document.getElementById('btnCapCutTop');
      if (btn) {
        btn.innerText = 'Assembling CapCut...';
        btn.disabled = true;
      }
      try {
        const res = await requestWithAuth('/api/episodes/' + id + '/capcut', { method: 'POST' });
        if (res.status === 401) {
          openKeyModal('CapCut draft generation requires creator authorization.', { type: 'capcut', id });
          return;
        }
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to assemble CapCut draft');
        showCapCutSuccessModal(data);
      } catch (err) {
        alert('CapCut Error: ' + err.message);
      } finally {
        if (btn) {
          btn.innerText = '✂️ Open in CapCut';
          btn.disabled = false;
        }
      }
    }

    async function triggerFfmpegRender(id) {
      const btn = document.getElementById('btnRenderTop');
      if (btn) {
        btn.innerText = 'Rendering Video...';
        btn.disabled = true;
      }
      try {
        const res = await requestWithAuth('/api/episodes/' + id + '/render', { method: 'POST' });
        if (res.status === 401) {
          openKeyModal('FFmpeg master rendering requires creator authorization.', { type: 'render', id });
          return;
        }
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to render master video');
        showRenderSuccessModal(data);
      } catch (err) {
        alert('Render Error: ' + err.message);
      } finally {
        if (btn) {
          btn.innerText = '⚡ Render Video';
          btn.disabled = false;
        }
      }
    }

    async function openReleaseRoom(epId) {
      const modal = document.getElementById('releaseRoomModal');
      const list = document.getElementById('preflightList');
      const btn = document.getElementById('btnConfirmRelease');
      const msg = document.getElementById('releaseStatusMessage');

      modal.classList.remove('hidden');
      msg.classList.add('hidden');
      list.innerHTML = '<div class="text-center py-3 text-gray-400">Checking release prerequisites & generating signed proposal...</div>';
      btn.disabled = true;
      currentApprovalToken = null;

      try {
        const res = await fetch('/api/episodes/' + epId + '/release-check');
        const check = await res.json();

        let html = '';
        html += '<div class="flex items-center justify-between">';
        html += '<span class="flex items-center gap-2">' + (check.allScenesReady ? '✅' : '⚠️') + ' <span>All Scenes Rendered</span></span>';
        html += '<span class="font-mono text-gray-500">' + check.completedScenesCount + ' / ' + check.scenesCount + '</span>';
        html += '</div>';

        html += '<div class="flex items-center justify-between border-t border-gray-200/60 pt-2">';
        html += '<span class="flex items-center gap-2">' + (check.masterVideo ? '✅' : '❌') + ' <span>Master Video Export</span></span>';
        html += '<span class="font-mono text-gray-500">' + (check.masterVideo ? check.masterVideo.fileName + ' (' + check.masterVideo.sizeMb + 'MB)' : 'Missing in watched_exports/') + '</span>';
        html += '</div>';

        html += '<div class="flex items-center justify-between border-t border-gray-200/60 pt-2">';
        html += '<span class="flex items-center gap-2">' + (check.youtube.connected ? '✅' : '❌') + ' <span>YouTube Account Connected</span></span>';
        html += '<span class="font-mono text-gray-500">' + (check.youtube.connected ? check.youtube.channelTitle : '<a href="' + check.youtube.authUrl + '" class="text-indigo-600 font-bold underline">Link Account</a>') + '</span>';
        html += '</div>';

        html += '<div class="flex items-center justify-between border-t border-gray-200/60 pt-2">';
        html += '<span class="flex items-center gap-2">🔒 <span>Privacy Setting</span></span>';
        html += '<span class="font-bold text-indigo-700">Private Release (Safe Mode)</span>';
        html += '</div>';

        list.innerHTML = html;

        if (check.canRelease) {
          // Request signed proposal from server
          const propRes = await fetch('/api/episodes/' + epId + '/propose-release', { method: 'POST' });
          const propData = await propRes.json();
          if (propData.success && propData.approvalToken) {
            currentApprovalToken = propData.approvalToken;
            btn.disabled = false;
          } else {
            btn.disabled = true;
            msg.className = 'bg-amber-50 text-amber-900 border border-amber-200 p-3 rounded-xl text-xs';
            msg.innerHTML = '<strong>Proposal creation failed:</strong> ' + (propData.error || 'Unknown error');
            msg.classList.remove('hidden');
          }
        } else {
          btn.disabled = true;
          msg.className = 'bg-amber-50 text-amber-900 border border-amber-200 p-3 rounded-xl text-xs';
          msg.innerHTML = '<strong>Prerequisites missing:</strong> ' + check.reasons.join(', ');
          msg.classList.remove('hidden');
        }
      } catch (err) {
        list.innerHTML = '<div class="text-red-500">Error loading preflight checks: ' + err.message + '</div>';
      }
    }

    function closeReleaseRoom() {
      document.getElementById('releaseRoomModal').classList.add('hidden');
    }

    async function confirmAndPublish() {
      const btn = document.getElementById('btnConfirmRelease');
      const msg = document.getElementById('releaseStatusMessage');
      btn.disabled = true;
      btn.innerText = 'Publishing Privately...';

      try {
        const res = await fetch('/api/episodes/' + episodeId + '/approve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Approval-Token': currentApprovalToken || '',
          },
          body: JSON.stringify({ approvalToken: currentApprovalToken }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        msg.className = 'bg-emerald-50 text-emerald-900 border border-emerald-200 p-3 rounded-xl text-xs space-y-1';
        msg.innerHTML = '<strong>✓ Successfully Published!</strong> Video is now private on your channel with ID: <code class="font-mono">' + data.videoId + '</code>.<br/>Status updated to ' + (data.newStatus || 'Scheduled') + ' in Supabase.';
        msg.classList.remove('hidden');

        btn.innerText = 'Release Published';
        setTimeout(() => {
          closeReleaseRoom();
          window.location.reload();
        }, 3000);
      } catch (err) {
        msg.className = 'bg-red-50 text-red-900 border border-red-200 p-3 rounded-xl text-xs';
        msg.innerHTML = '<strong>Publishing Error:</strong> ' + err.message;
        msg.classList.remove('hidden');
        btn.disabled = false;
        btn.innerText = 'Publish as Private Release';
      }
    }

    // Attach all event listeners to DOM without inline strings
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('btnCapCutTop')?.addEventListener('click', () => triggerCapCutDraft(episodeId));
      document.getElementById('btnRenderTop')?.addEventListener('click', () => triggerFfmpegRender(episodeId));
      document.getElementById('btnApproveTop')?.addEventListener('click', () => openReleaseRoom(episodeId));
      document.getElementById('btnFfmpegFallback')?.addEventListener('click', () => triggerFfmpegRender(episodeId));

      document.getElementById('btnPlayMaster')?.addEventListener('click', (e) => {
        const target = e.currentTarget;
        playMasterVideo(target.getAttribute('data-url'), target.getAttribute('data-filename'));
      });

      document.querySelectorAll('[data-action="close-release"]').forEach(el => {
        el.addEventListener('click', closeReleaseRoom);
      });

      document.getElementById('btnConfirmRelease')?.addEventListener('click', confirmAndPublish);

      // Studio Access Key Modal listeners
      document.getElementById('btnCloseKeyModal')?.addEventListener('click', closeKeyModal);
      document.getElementById('btnCancelKeyModal')?.addEventListener('click', closeKeyModal);
      document.getElementById('btnSubmitKeyModal')?.addEventListener('click', submitStudioKey);
      document.getElementById('studioKeyInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitStudioKey();
      });
      document.getElementById('btnDevKeyFill')?.addEventListener('click', () => {
        const inp = document.getElementById('studioKeyInput');
        if (inp) inp.value = 'admin';
        document.getElementById('studioKeyError')?.classList.add('hidden');
      });

      // Studio Result Modal dismiss listeners
      document.getElementById('btnCloseResultModal')?.addEventListener('click', () => {
        document.getElementById('studioResultModal')?.classList.add('hidden');
      });
      document.getElementById('btnDismissResultModal')?.addEventListener('click', () => {
        document.getElementById('studioResultModal')?.classList.add('hidden');
      });

      document.addEventListener('click', (e) => {
        const card = e.target.closest('.scene-card-item');
        if (card) {
          const url = card.getAttribute('data-video-url');
          const sceneNum = card.getAttribute('data-scene-number');
          const title = card.getAttribute('data-title');
          const sceneId = card.getAttribute('data-scene-id');
          const prompt = card.getAttribute('data-prompt');
          playScene(url, sceneNum, title, sceneId, prompt);
        }
      });
    });
  </script>
</body>
</html>
`;
}
