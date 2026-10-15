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
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${episode.title} — Episode Preview & Video Player | LAMS HQ</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              500: '#6366f1',
              600: '#4f46e5',
            }
          }
        }
      }
    }
  </script>
  <style>
    body { background-color: #080c14; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .glass-panel { background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.08); }
    .active-scene-card { border-color: #6366f1 !important; background: rgba(99, 102, 241, 0.15) !important; }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <!-- Top Bar -->
  <header class="border-b border-gray-800/80 bg-gray-950/80 px-6 py-3.5 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
    <div class="flex items-center space-x-4">
      <a href="/" class="text-xs bg-gray-900 hover:bg-gray-800 text-gray-300 border border-gray-700 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5">
        <span>←</span> <span>Back to Live Cockpit</span>
      </a>
      <div class="h-4 w-px bg-gray-800"></div>
      <div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded font-mono font-bold">${episode.projectName}</span>
          <span class="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded font-mono uppercase">${episode.status}</span>
        </div>
        <h1 class="text-base font-bold text-white mt-0.5 leading-snug">${episode.title}</h1>
      </div>
    </div>

    <!-- Quick Actions Header -->
    <div class="flex items-center gap-3">
      <button onclick="triggerCapCutDraft('${episode.id}')" id="btnCapCutTop" class="bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-700 flex items-center gap-1.5 transition">
        <span>✂️</span> CapCut Draft
      </button>
      <button onclick="triggerFfmpegRender('${episode.id}')" id="btnRenderTop" class="bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-700 flex items-center gap-1.5 transition">
        <span>⚡</span> Render Master (FFmpeg)
      </button>
      <button onclick="triggerApprovePublish('${episode.id}')" id="btnApproveTop" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-lg shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition">
        <span>✓</span> Approve & Schedule
      </button>
    </div>
  </header>

  <!-- Main Grid Layout -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-12 gap-6">
    <!-- Left Column: Video Player & Filmstrip (7 cols) -->
    <div class="col-span-7 space-y-5">
      <!-- Player Card -->
      <div class="glass-panel p-4 rounded-2xl border border-gray-800/80 shadow-2xl">
        <div class="relative bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center border border-gray-900 shadow-inner">
          ${initialVideoUrl ? `
            <video id="mainVideoPlayer" controls autoplay playsinline class="w-full h-full object-contain">
              <source src="${initialVideoUrl}" type="video/mp4">
              Your browser does not support the video tag.
            </video>
          ` : `
            <div class="text-center p-8 text-gray-500">
              <div class="text-4xl mb-2">🎬</div>
              <p class="text-sm font-medium">No rendered scene video clips available yet.</p>
              <p class="text-xs text-gray-600 mt-1">Scenes are still generating in PixVerse.</p>
            </div>
          `}
        </div>

        <!-- Video Info Ribbon -->
        <div class="mt-3 flex items-center justify-between text-xs text-gray-400">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span id="playerCurrentLabel" class="font-medium text-gray-200">
              ${exportedVideo ? `Master Export: ${exportedVideo.fileName}` : (scenesWithVideo[0] ? `Scene 1: ${scenesWithVideo[0].title}` : 'No Video Loaded')}
            </span>
          </div>
          <div class="font-mono text-[11px] text-gray-500">
            ${episode.completedScenesCount} of ${episode.scenes.length} Scenes Ready
          </div>
        </div>
      </div>

      <!-- Scene Filmstrip / Playlist -->
      <div class="glass-panel p-4 rounded-2xl border border-gray-800/80 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-xs uppercase font-semibold tracking-wider text-gray-400">Scene Filmstrip & Audio Sequence</h2>
          <span class="text-[11px] text-indigo-400 font-mono">Click any scene to stream</span>
        </div>

        <div class="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
          ${episode.scenes.map((sc, idx) => `
            <div 
              id="scene-card-${sc.id}"
              onclick="playScene('${sc.videoUrl}', '${sc.sceneNumber}', '${encodeURIComponent(sc.title)}', '${sc.id}')"
              class="p-3 bg-gray-950/60 border border-gray-800/80 hover:border-indigo-500/50 rounded-xl cursor-pointer transition flex items-start gap-3.5 group ${idx === 0 && !exportedVideo ? 'active-scene-card' : ''}"
            >
              <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center font-mono text-xs font-bold text-gray-300 group-hover:border-indigo-500 group-hover:text-indigo-400 transition">
                #${sc.sceneNumber}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <div class="text-xs font-semibold text-white truncate">${sc.title}</div>
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded ${sc.videoUrl ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-gray-800 text-gray-500'}">
                    ${sc.duration}s • ${sc.videoUrl ? 'READY' : 'GENERATING'}
                  </span>
                </div>
                <p class="text-[11px] text-gray-400 mt-1 line-clamp-1">${sc.visualPrompt || 'No visual description'}</p>
              </div>
              <div class="flex-shrink-0 text-gray-600 group-hover:text-indigo-400 transition text-sm">▶</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Right Column: Metadata, Prompts, Master Export & YouTube (5 cols) -->
    <div class="col-span-5 space-y-5">
      <!-- Master Video Status Card -->
      <div class="glass-panel p-5 rounded-2xl border ${exportedVideo ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-amber-500/30 bg-amber-950/10'} space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-lg">${exportedVideo ? '🎬' : '⏳'}</span>
            <h3 class="text-xs font-bold uppercase tracking-wider ${exportedVideo ? 'text-emerald-400' : 'text-amber-400'}">
              ${exportedVideo ? 'Master MP4 Ready for Release' : 'Awaiting Master Export'}
            </h3>
          </div>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded ${exportedVideo ? 'bg-emerald-900 text-emerald-200' : 'bg-amber-900 text-amber-200'}">
            ${exportedVideo ? 'WATCHED FOLDER' : 'PENDING'}
          </span>
        </div>

        ${exportedVideo ? `
          <div class="p-3 bg-gray-950/80 rounded-xl border border-emerald-900 text-xs space-y-1 font-mono">
            <div class="text-gray-300 truncate"><strong>File:</strong> ${exportedVideo.fileName}</div>
            <div class="text-gray-400"><strong>Size:</strong> ${exportedVideo.sizeMb} MB</div>
            <div class="text-gray-500 text-[10px]">Modified: ${new Date(exportedVideo.modifiedAt).toLocaleTimeString()}</div>
          </div>
          <button onclick="playMasterVideo('${encodeURIComponent(exportedVideo.fileName)}')" class="w-full bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold py-2 rounded-xl border border-gray-700 transition">
            ▶ Play Master Video in Player
          </button>
        ` : `
          <p class="text-xs text-gray-400 leading-relaxed">
            No exported video detected in <code class="text-indigo-300 font-mono">watched_exports/</code>. You can export from CapCut, render with FFmpeg, or upload your finished MP4 below.
          </p>
        `}

        <!-- Upload Dropzone -->
        <div class="border-2 border-dashed border-gray-800 hover:border-indigo-500/60 rounded-xl p-4 text-center transition cursor-pointer" onclick="document.getElementById('videoFileInput').click()">
          <input type="file" id="videoFileInput" accept="video/mp4,video/quicktime,video/x-matroska" class="hidden" onchange="uploadMasterVideo(this, '${episode.id}')" />
          <div class="text-2xl mb-1 text-gray-500">📁</div>
          <div class="text-xs font-semibold text-gray-300">Drop your exported MP4 here</div>
          <div class="text-[10px] text-gray-500 mt-0.5">or click to browse from your computer</div>
          <div id="uploadProgress" class="hidden text-xs text-indigo-400 font-bold mt-2">Uploading master video...</div>
        </div>
      </div>

      <!-- Script & Character Dialogue Inspector -->
      <div class="glass-panel p-5 rounded-2xl border border-gray-800/80 space-y-3">
        <h3 class="text-xs uppercase font-semibold tracking-wider text-gray-400">Director & Character Prompts</h3>
        <div id="activeSceneDetails" class="p-3.5 bg-gray-950/70 rounded-xl border border-gray-800 text-xs space-y-3">
          <div>
            <div class="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Scene Synopsis & Premise</div>
            <p class="text-gray-300 mt-1 leading-relaxed text-xs">${episode.topic}</p>
          </div>
          <div class="border-t border-gray-800/80 pt-2.5">
            <div class="text-[10px] uppercase font-bold text-indigo-400 tracking-wider" id="activePromptTitle">Scene 1 Motion & Dialogue</div>
            <p class="text-gray-300 mt-1 leading-relaxed whitespace-pre-wrap font-mono text-[11px]" id="activePromptText">
              ${episode.scenes[0]?.motionPrompt || episode.scenes[0]?.visualPrompt || 'No motion prompts recorded.'}
            </p>
          </div>
        </div>
      </div>

      <!-- YouTube Status & Publishing Gate -->
      <div class="glass-panel p-5 rounded-2xl border border-gray-800/80 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-xs uppercase font-semibold tracking-wider text-gray-400">YouTube Channel Link</h3>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded ${isYouTubeConnected ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-red-950 text-red-300 border border-red-800'}">
            ${isYouTubeConnected ? 'CHANNEL LINKED' : 'NOT LINKED'}
          </span>
        </div>

        <p class="text-xs text-gray-400">
          When approved, this episode will be uploaded to YouTube Data API v3 with privacy set to <code class="text-indigo-300 font-mono">private</code> and scheduled for your audience release window.
        </p>

        <button onclick="triggerApprovePublish('${episode.id}')" id="btnMainPublish" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition">
          <span>✓</span> Approve & Publish Episode
        </button>
      </div>
    </div>
  </main>

  <script>
    const scenePrompts = ${JSON.stringify(episode.scenes.reduce((acc, s) => {
      acc[s.id] = {
        title: 'Scene ' + s.sceneNumber + ': ' + s.title,
        motion: s.motionPrompt || s.visualPrompt || 'No prompt details.',
      };
      return acc;
    }, {} as Record<string, any>))};

    function playScene(url, sceneNum, titleEnc, sceneId) {
      if (!url) {
        alert('Scene video is still generating in PixVerse. Please wait for completion.');
        return;
      }
      const player = document.getElementById('mainVideoPlayer');
      if (player) {
        player.src = url;
        player.play();
      }
      document.getElementById('playerCurrentLabel').innerText = 'Scene ' + sceneNum + ': ' + decodeURIComponent(titleEnc);

      // Update active card styling
      document.querySelectorAll('[id^="scene-card-"]').forEach(el => el.classList.remove('active-scene-card'));
      const activeCard = document.getElementById('scene-card-' + sceneId);
      if (activeCard) activeCard.classList.add('active-scene-card');

      // Update prompt box
      if (scenePrompts[sceneId]) {
        document.getElementById('activePromptTitle').innerText = scenePrompts[sceneId].title + ' Motion & Dialogue';
        document.getElementById('activePromptText').innerText = scenePrompts[sceneId].motion;
      }
    }

    function playMasterVideo(encodedFileName) {
      const player = document.getElementById('mainVideoPlayer');
      if (player) {
        player.src = '/api/exports/' + encodedFileName;
        player.play();
      }
      document.getElementById('playerCurrentLabel').innerText = 'Master Export: ' + decodeURIComponent(encodedFileName);
    }

    async function triggerCapCutDraft(id) {
      const btn = document.getElementById('btnCapCutTop');
      btn.innerText = 'Assembling...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/episodes/' + id + '/capcut', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert('✓ CapCut Draft Created!\\nDraft Path: ' + data.draftPath + '\\nTracks: ' + data.tracksCount + '\\nOpen CapCut Desktop to view timeline.');
        btn.innerText = 'CapCut Ready ✓';
      } catch (err) {
        alert('CapCut Draft Error: ' + err.message);
        btn.innerText = '✂️ CapCut Draft';
        btn.disabled = false;
      }
    }

    async function triggerFfmpegRender(id) {
      const btn = document.getElementById('btnRenderTop');
      btn.innerText = 'Rendering (FFmpeg)...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/episodes/' + id + '/render', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert('✓ Master Video Stitched and Rendered!\\nOutput: ' + data.outputPath + '\\nDuration: ' + data.durationSeconds + 's');
        window.location.reload();
      } catch (err) {
        alert('Render Error: ' + err.message);
        btn.innerText = '⚡ Render Master (FFmpeg)';
        btn.disabled = false;
      }
    }

    async function triggerApprovePublish(id) {
      const confirmed = confirm('Confirm approving episode and publishing to YouTube?\\n\\n- Writes status: Scheduled in Supabase\\n- Dispatches YouTube Publisher for master video\\n- Safe mode: privacyStatus = private');
      if (!confirmed) return;

      const btn = document.getElementById('btnMainPublish');
      btn.innerText = 'Publishing to YouTube...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/episodes/' + id + '/approve', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        alert('✓ Successfully Approved & Published!\\n\\nEpisode Status: ' + data.newStatus + '\\nYouTube Video: ' + (data.videoUrl || data.videoId || 'Scheduled') + '\\nReceipt ID: ' + data.receiptId);
        window.location.reload();
      } catch (err) {
        alert('Publishing Notice: ' + err.message);
        btn.innerText = '✓ Approve & Publish Episode';
        btn.disabled = false;
      }
    }

    async function uploadMasterVideo(input, episodeId) {
      if (!input.files || input.files.length === 0) return;
      const file = input.files[0];
      const prog = document.getElementById('uploadProgress');
      prog.classList.remove('hidden');
      prog.innerText = 'Uploading ' + file.name + ' (' + (file.size / (1024 * 1024)).toFixed(1) + ' MB)...';

      const formData = new FormData();
      formData.append('video', file);

      try {
        const res = await fetch('/api/episodes/' + episodeId + '/upload-export', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert('✓ Master video successfully imported into watched_exports!\\n' + data.fileName + ' (' + data.sizeMb + ' MB)');
        window.location.reload();
      } catch (err) {
        alert('Upload Error: ' + err.message);
        prog.classList.add('hidden');
      }
    }
  </script>
</body>
</html>
`;
}
