import type { RealEpisodeDetails } from '../../bridge/YTEngineBridge.ts';
import type { ExportedVideoFile } from '../../adapters/media/ExportFolderWatcher.ts';

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
  <title>${episode.title} — Episode Studio | LAMS HQ</title>
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
          <span class="text-[11px] bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold">${episode.projectName}</span>
          <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
            episode.status === 'Review' ? 'bg-[#fef3c7] text-[#92400e]' :
            episode.status === 'Scheduled' ? 'bg-emerald-50 text-emerald-700' :
            'bg-gray-100 text-gray-600'
          }">
            ${episode.status === 'Review' ? 'In review' : episode.status}
          </span>
        </div>
        <h1 class="text-lg font-black text-gray-900 mt-0.5 leading-snug">${episode.title}</h1>
      </div>
    </div>

    <!-- Actions Header -->
    <div class="flex items-center gap-3">
      <button onclick="triggerCapCutDraft('${episode.id}')" id="btnCapCutTop" class="border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm">
        ✂️ Open in CapCut
      </button>
      <button onclick="triggerFfmpegRender('${episode.id}')" id="btnRenderTop" class="border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm">
        ⚡ Render Video
      </button>
      <button onclick="openReleaseRoom('${episode.id}')" id="btnApproveTop" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-bold px-5 py-2 rounded-xl shadow-sm flex items-center gap-1.5 transition">
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
              <source src="${initialVideoUrl}" type="video/mp4">
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
              ${exportedVideo ? `Master Export: ${exportedVideo.fileName}` : (scenesWithVideo[0] ? `Scene 1: ${scenesWithVideo[0].title}` : 'No clip loaded')}
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
              id="scene-card-${sc.id}"
              onclick="playScene('${sc.videoUrl}', '${sc.sceneNumber}', '${encodeURIComponent(sc.title)}', '${sc.id}', '${encodeURIComponent(sc.visualPrompt || '')}')"
              class="p-4 bg-gray-50/80 border border-gray-200 hover:border-indigo-300 rounded-2xl cursor-pointer transition flex items-start gap-4 group card-hover ${idx === 0 && !exportedVideo ? 'active-scene-card' : ''}"
            >
              <div class="flex-shrink-0 w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-[#4338ca] group-hover:bg-[#4338ca] group-hover:text-white transition shadow-sm">
                #${sc.sceneNumber}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-bold text-gray-900 truncate">${sc.title}</h4>
                  <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${sc.videoUrl ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}">
                    ${sc.duration}s • ${sc.videoUrl ? 'Ready' : 'Rendering'}
                  </span>
                </div>
                <p class="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">${sc.visualPrompt || 'No visual description'}</p>
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
        <p class="text-xs text-gray-600 leading-relaxed">${episode.topic}</p>
        <div class="pt-2 flex items-center justify-between text-xs text-gray-400 border-t border-gray-100">
          <span>Project: <strong class="text-gray-700">${episode.projectName}</strong></span>
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
          ${episode.scenes[0]?.visualPrompt || 'Select a scene to inspect its script and visual directions.'}
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
            <div class="font-bold text-emerald-950 truncate">${exportedVideo.fileName}</div>
            <div class="text-[11px] text-emerald-800">${exportedVideo.sizeMb} MB • Modified ${new Date(exportedVideo.modifiedAt).toLocaleTimeString()}</div>
            <button onclick="playMasterVideo('/api/exports/${encodeURIComponent(exportedVideo.fileName)}', '${encodeURIComponent(exportedVideo.fileName)}')" class="mt-1 w-full text-center bg-white hover:bg-emerald-50 text-emerald-800 font-semibold py-1.5 rounded-xl border border-emerald-200 transition">
              ▶ Load Master in Player
            </button>
          </div>
        ` : `
          <div class="p-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-center text-xs text-gray-500 space-y-2">
            <p>No master export detected yet. After editing in CapCut, export to the <code class="text-indigo-600 font-mono">watched_exports</code> folder or click below to render via FFmpeg.</p>
            <button onclick="triggerFfmpegRender('${episode.id}')" class="bg-white hover:bg-gray-100 text-gray-800 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 transition shadow-sm">
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
  <!-- 3. SAFE MODE RELEASE ROOM MODAL                              -->
  <!-- ============================================================ -->
  <div id="releaseRoomModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div class="bg-white max-w-xl w-full p-6 rounded-3xl border border-gray-200 space-y-5 shadow-2xl">
      <!-- Modal Header -->
      <div class="flex items-center justify-between pb-3 border-b border-gray-100">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">SAFE MODE PUBLISHING</span>
          <h3 class="text-lg font-black text-gray-900">Release Room: ${episode.title}</h3>
          <p class="text-xs text-gray-500">Every upload starts private. Nothing goes public without your schedule.</p>
        </div>
        <button onclick="closeReleaseRoom()" class="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
      </div>

      <!-- Preflight Checklist -->
      <div class="space-y-3">
        <h4 class="text-xs font-bold text-gray-800 uppercase tracking-wider">Preflight Checklist</h4>
        <div id="preflightList" class="bg-gray-50 border border-gray-200/80 rounded-2xl p-4 space-y-3 text-xs">
          <div class="text-center py-3 text-gray-400">Loading checklist...</div>
        </div>
      </div>

      <!-- Schedule Time -->
      <div class="space-y-2">
        <label class="block text-xs font-bold text-gray-800">Publication Time (Go Live)</label>
        <div class="grid grid-cols-2 gap-3">
          <input id="releaseDate" type="date" class="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 focus:outline-none focus:border-indigo-500" />
          <input id="releaseTime" type="time" value="19:00" class="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 focus:outline-none focus:border-indigo-500" />
        </div>
      </div>

      <!-- Notice -->
      <div id="releaseStatusMessage" class="hidden p-3 rounded-xl text-xs font-medium"></div>

      <!-- Footer Buttons -->
      <div class="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        <button onclick="closeReleaseRoom()" class="border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition">
          Cancel
        </button>
        <button id="btnConfirmRelease" onclick="confirmAndPublish()" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm transition">
          Publish as Private Release
        </button>
      </div>
    </div>
  </div>

  <!-- ============================================================ -->
  <!-- 4. SCRIPT LOGIC                                              -->
  <!-- ============================================================ -->
  <script>
    const episodeId = '${episode.id}';

    // Set default tomorrow date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('releaseDate').value = tomorrow.toISOString().split('T')[0];

    function playScene(url, sceneNum, encodedTitle, sceneId, encodedPrompt) {
      if (!url) {
        alert('Scene #' + sceneNum + ' is still generating.');
        return;
      }
      const player = document.getElementById('mainVideoPlayer');
      const label = document.getElementById('playerCurrentLabel');
      player.src = url;
      player.play();
      label.innerText = 'Scene #' + sceneNum + ': ' + decodeURIComponent(encodedTitle);

      // Highlight card
      document.querySelectorAll('[id^="scene-card-"]').forEach(c => c.classList.remove('active-scene-card'));
      const activeCard = document.getElementById('scene-card-' + sceneId);
      if (activeCard) activeCard.classList.add('active-scene-card');

      // Update script preview box
      if (encodedPrompt) {
        document.getElementById('activeScenePromptText').innerText = decodeURIComponent(encodedPrompt);
        document.getElementById('activeScenePromptBadge').innerText = 'Scene #' + sceneNum;
      }
    }

    function playMasterVideo(url, fileName) {
      const player = document.getElementById('mainVideoPlayer');
      player.src = url;
      player.play();
      document.getElementById('playerCurrentLabel').innerText = 'Master Export: ' + decodeURIComponent(fileName);
      document.querySelectorAll('[id^="scene-card-"]').forEach(c => c.classList.remove('active-scene-card'));
    }

    async function triggerCapCutDraft(id) {
      const btn = document.getElementById('btnCapCutTop');
      btn.innerText = 'Assembling...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/episodes/' + id + '/capcut', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert('✓ CapCut Draft Created!\\nPath: ' + data.draftPath + '\\nTracks: ' + data.tracksCount);
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btn.innerText = '✂️ Open in CapCut';
        btn.disabled = false;
      }
    }

    async function triggerFfmpegRender(id) {
      const btn = document.getElementById('btnRenderTop');
      btn.innerText = 'Rendering Video...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/episodes/' + id + '/render', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert('✓ Master Video Rendered!\\nSaved to: ' + data.outputPath);
        window.location.reload();
      } catch (err) {
        alert('Render Error: ' + err.message);
      } finally {
        btn.innerText = '⚡ Render Video';
        btn.disabled = false;
      }
    }

    async function openReleaseRoom(epId) {
      const modal = document.getElementById('releaseRoomModal');
      const list = document.getElementById('preflightList');
      const btn = document.getElementById('btnConfirmRelease');
      const msg = document.getElementById('releaseStatusMessage');

      modal.classList.remove('hidden');
      msg.classList.add('hidden');
      list.innerHTML = '<div class="text-center py-3 text-gray-400">Checking release prerequisites...</div>';
      btn.disabled = true;

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
        html += '<span class="font-bold text-indigo-700">Private Release (Safe)</span>';
        html += '</div>';

        list.innerHTML = html;

        if (check.canRelease) {
          btn.disabled = false;
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
        const res = await fetch('/api/episodes/' + episodeId + '/approve', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        msg.className = 'bg-emerald-50 text-emerald-900 border border-emerald-200 p-3 rounded-xl text-xs space-y-1';
        msg.innerHTML = '<strong>✓ Successfully Published!</strong> Video is now private on your channel with ID: <code class="font-mono">' + data.videoId + '</code>.<br/>Status updated to Scheduled in Supabase.';
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
  </script>
</body>
</html>
`;
}
