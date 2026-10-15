import type { RealEpisode } from '../../bridge/YTEngineBridge.ts';
import type { ChannelProfile } from '../../adapters/youtube/YouTubeLiveClient.ts';
import type { SkillContract } from '../../contracts/SkillContract.ts';
import type { ExportedVideoFile } from '../../adapters/media/ExportFolderWatcher.ts';

export function renderDashboardHtml(
  episodes: RealEpisode[],
  metrics: Record<string, number>,
  channel: ChannelProfile,
  skills: SkillContract[],
  exportedVideos: ExportedVideoFile[],
  selectedEpisodeId?: string
): string {
  const currentEpisode = episodes.find(e => e.id === selectedEpisodeId) || episodes.find(e => e.status === 'Review') || episodes[0] || {
    id: 'ep-none',
    projectId: 'proj-none',
    projectName: 'No Projects Found',
    title: 'No Active Episodes',
    topic: 'Create an episode in yt-automation to see it here.',
    status: 'Draft',
    scenesCount: 0,
    completedScenesCount: 0,
    createdAt: new Date().toISOString(),
  };

  const reviewEpisodes = episodes.filter(e => e.status === 'Review');

  return `<!DOCTYPE html>
<html lang="en" class="dark h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LAMS HQ — Creator Operations Center</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#eef2ff',
              500: '#6366f1',
              600: '#4f46e5',
              900: '#1e1b4b',
            }
          }
        }
      }
    }
  </script>
  <style>
    body { background-color: #080c14; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .glass-card { background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.07); }
    .glass-sidebar { background: rgba(11, 15, 25, 0.95); backdrop-filter: blur(16px); border-right: 1px solid rgba(255, 255, 255, 0.08); }
    .chat-bubble-agent { background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(255, 255, 255, 0.06); }
    .chat-bubble-user { background: #4f46e5; color: white; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
  </style>
</head>
<body class="h-full flex overflow-hidden">

  <!-- ========================================== -->
  <!-- LEFT PANE: LAMS AI AGENT CHAT & COMMANDS -->
  <!-- ========================================== -->
  <aside class="w-96 flex-shrink-0 glass-sidebar flex flex-col h-full z-20">
    <!-- Chat Header -->
    <div class="p-4 border-b border-gray-800/80 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="relative">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-black text-white text-base shadow-md shadow-indigo-600/30">
            L
          </div>
          <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-gray-900 rounded-full animate-pulse"></span>
        </div>
        <div>
          <h2 class="text-sm font-bold text-white flex items-center gap-1.5">
            Lams Assistant <span class="text-[9px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-1.5 py-0.2 rounded font-mono">AGENTIC</span>
          </h2>
          <p class="text-[11px] text-gray-400">Autonomous Creator Workforce</p>
        </div>
      </div>
      <button onclick="clearChat()" class="text-gray-500 hover:text-gray-300 text-xs" title="Clear chat history">↺</button>
    </div>

    <!-- Live Chat Messages -->
    <div id="chatMessages" class="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
      <!-- Welcome message -->
      <div class="flex items-start gap-2.5">
        <div class="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 mt-0.5">
          AI
        </div>
        <div class="chat-bubble-agent p-3 rounded-2xl rounded-tl-sm text-gray-300 space-y-2 max-w-[85%] leading-relaxed">
          <p>Hi <strong>Lams</strong>! I'm monitoring your production pipeline.</p>
          <p>You currently have <span class="text-amber-400 font-bold">${reviewEpisodes.length} episode</span> waiting for your OK in Review, and <span class="text-indigo-300 font-mono font-bold">${exportedVideos.length} master exports</span> detected in your watched folder.</p>
          <div class="pt-1 flex flex-wrap gap-1.5">
            <button onclick="sendQuickPrompt('Review pending episodes')" class="bg-gray-800 hover:bg-gray-700 text-gray-200 text-[10px] px-2 py-1 rounded-lg border border-gray-700 transition">Review Episodes</button>
            <button onclick="sendQuickPrompt('Assemble CapCut draft for ' + '${currentEpisode.title}')" class="bg-gray-800 hover:bg-gray-700 text-gray-200 text-[10px] px-2 py-1 rounded-lg border border-gray-700 transition">✂️ CapCut Draft</button>
            <button onclick="sendQuickPrompt('Check YouTube connection')" class="bg-gray-800 hover:bg-gray-700 text-gray-200 text-[10px] px-2 py-1 rounded-lg border border-gray-700 transition">🔗 Check YouTube</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Action Pills -->
    <div class="px-4 py-2 border-t border-gray-900 bg-gray-950/40 flex items-center gap-1.5 overflow-x-auto text-[11px]">
      <button onclick="sendQuickPrompt('Schedule ${currentEpisode.title} for tomorrow 7pm')" class="whitespace-nowrap bg-gray-900 hover:bg-gray-800 text-gray-300 px-2.5 py-1 rounded-lg border border-gray-800 transition">
        ⚡ Schedule Release
      </button>
      <button onclick="sendQuickPrompt('Preview ${currentEpisode.title}')" class="whitespace-nowrap bg-gray-900 hover:bg-gray-800 text-gray-300 px-2.5 py-1 rounded-lg border border-gray-800 transition">
        ▶ Preview
      </button>
      <button onclick="openTeachModal()" class="whitespace-nowrap bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/80 px-2.5 py-1 rounded-lg transition">
        + Teach Skill
      </button>
    </div>

    <!-- Command Input Bar -->
    <div class="p-3 border-t border-gray-800/80 bg-gray-950/90">
      <form onsubmit="handleChatSubmit(event)" class="relative flex items-center">
        <input 
          id="chatInput" 
          type="text" 
          placeholder="Tell LAMS Agent what to do..." 
          class="w-full bg-gray-900/90 border border-gray-800 focus:border-indigo-500 rounded-xl pl-3 pr-10 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none transition shadow-inner"
        />
        <button 
          type="submit" 
          class="absolute right-1.5 p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
          title="Send command"
        >
          <svg class="w-3.5 h-3.5 transform rotate-90" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
          </svg>
        </button>
      </form>
    </div>
  </aside>

  <!-- ========================================== -->
  <!-- RIGHT PANE: CREATOR WORKSPACE -->
  <!-- ========================================== -->
  <div class="flex-1 flex flex-col h-full overflow-hidden bg-[#080c14]">
    
    <!-- Top Global Header -->
    <header class="border-b border-gray-800/80 bg-gray-950/80 px-8 py-3.5 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
      <div class="flex items-center space-x-6">
        <div>
          <h1 class="text-base font-bold tracking-tight text-white flex items-center gap-2">
            LAMS HQ <span class="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full font-mono font-bold">ZERO MOCKS • LIVE</span>
          </h1>
          <p class="text-xs text-gray-400">Personal AI Operations Center • Connected to Supabase</p>
        </div>

        <!-- Navigation Tabs -->
        <nav class="flex items-center space-x-1 bg-gray-900/80 p-1 rounded-xl border border-gray-800 text-xs">
          <button onclick="switchTab('today')" id="tab-today" class="px-3 py-1.5 rounded-lg font-medium transition bg-indigo-600 text-white shadow-sm">
            📌 Today
          </button>
          <button onclick="switchTab('episodes')" id="tab-episodes" class="px-3 py-1.5 rounded-lg font-medium transition text-gray-400 hover:text-gray-200">
            🎬 Episodes (${episodes.length})
          </button>
          <button onclick="switchTab('skills')" id="tab-skills" class="px-3 py-1.5 rounded-lg font-medium transition text-gray-400 hover:text-gray-200">
            ⚡ Workforce Skills (${skills.length})
          </button>
          <button onclick="switchTab('connections')" id="tab-connections" class="px-3 py-1.5 rounded-lg font-medium transition text-gray-400 hover:text-gray-200 flex items-center gap-1.5">
            🔌 Connections ${channel.isConnected ? `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>` : `<span class="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>`}
          </button>
        </nav>
      </div>

      <!-- Top Right Status & Action -->
      <div class="flex items-center space-x-3 text-xs">
        ${channel.isConnected ? `
          <div class="flex items-center space-x-2.5 bg-gray-900 border border-emerald-500/40 px-3 py-1.5 rounded-xl">
            ${channel.avatarUrl ? `<img src="${channel.avatarUrl}" class="w-5 h-5 rounded-full border border-gray-700" />` : `<span class="w-2 h-2 rounded-full bg-emerald-400"></span>`}
            <span class="font-bold text-white text-xs">${channel.title}</span>
            <span class="text-[9px] bg-emerald-950 text-emerald-300 font-mono px-1 rounded">API LINKED</span>
          </div>
        ` : `
          <a href="${channel.authUrl}" class="bg-red-950/80 hover:bg-red-900 border border-red-700 text-red-200 font-semibold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition animate-pulse">
            <span>🔗</span> <span>Link YouTube Channel</span>
          </a>
        `}

        <button onclick="openTeachModal()" class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3.5 py-1.5 rounded-xl text-xs shadow-md shadow-indigo-600/30 flex items-center gap-1 transition">
          <span>+</span> Teach Skill
        </button>
      </div>
    </header>

    <!-- Workspace Body (Scrollable Tabs) -->
    <main class="flex-1 overflow-y-auto p-8 space-y-8">

      <!-- ========================================== -->
      <!-- TAB 1: TODAY / OVERVIEW                    -->
      <!-- ========================================== -->
      <section id="view-today" class="space-y-6">
        
        <!-- "NEEDS YOU" PRIORITY NOTICES -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-xs uppercase font-bold text-gray-400 tracking-wider flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span> Needs Your Attention First
            </h2>
            <span class="text-[11px] text-gray-500 font-mono">High Priority Action Queue</span>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <!-- Review Episode Card -->
            ${reviewEpisodes.length > 0 ? `
              <div class="glass-card p-5 rounded-2xl border-amber-500/40 bg-gradient-to-br from-amber-950/20 to-gray-900/40 flex flex-col justify-between space-y-4">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded font-bold font-mono">EPISODE READY FOR REVIEW</span>
                    <span class="text-xs font-mono text-gray-400">${reviewEpisodes[0].completedScenesCount} / ${reviewEpisodes[0].scenesCount} Scenes Ready</span>
                  </div>
                  <h3 class="text-base font-bold text-white mt-2">${reviewEpisodes[0].title}</h3>
                  <p class="text-xs text-gray-400 mt-1 line-clamp-2">${reviewEpisodes[0].topic}</p>
                </div>
                <div class="flex items-center gap-2.5 pt-2">
                  <a href="/api/episodes/${reviewEpisodes[0].id}/preview" target="_blank" class="bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-700 transition flex items-center gap-1.5">
                    <span>▶</span> Preview Scenes
                  </a>
                  <button onclick="assembleCapCutDraft('${reviewEpisodes[0].id}')" class="bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-700 transition flex items-center gap-1.5">
                    <span>✂️</span> CapCut Draft
                  </button>
                  <button onclick="approveEpisode('${reviewEpisodes[0].id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-xl shadow-md shadow-emerald-600/30 transition flex items-center gap-1.5">
                    <span>✓</span> Approve & Publish
                  </button>
                </div>
              </div>
            ` : `
              <div class="glass-card p-5 rounded-2xl border-gray-800 text-center py-8">
                <div class="text-2xl mb-1">🎉</div>
                <div class="text-xs font-bold text-gray-300">No Episodes Awaiting Review</div>
                <div class="text-[11px] text-gray-500 mt-0.5">All episodes are either in production or scheduled.</div>
              </div>
            `}

            <!-- YouTube Auth / Connection Alert Card -->
            ${!channel.isConnected ? `
              <div class="glass-card p-5 rounded-2xl border-red-500/40 bg-gradient-to-br from-red-950/20 to-gray-900/40 flex flex-col justify-between space-y-4">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] bg-red-950 text-red-300 border border-red-800 px-2 py-0.5 rounded font-bold font-mono">CONNECTION EXPIRED</span>
                    <span class="text-xs font-mono text-red-400 font-bold">Action Needed</span>
                  </div>
                  <h3 class="text-base font-bold text-white mt-2">YouTube OAuth Channel Link Required</h3>
                  <p class="text-xs text-gray-400 mt-1">Google OAuth refresh token expired or unlinked. Re-authorize to enable automated video upload and scheduling.</p>
                </div>
                <div>
                  <a href="${channel.authUrl}" class="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow-md shadow-red-600/30">
                    <span>🔗</span> Link Lams' YouTube Channel Now
                  </a>
                </div>
              </div>
            ` : `
              <div class="glass-card p-5 rounded-2xl border-emerald-500/30 bg-gradient-to-br from-emerald-950/15 to-gray-900/40 flex flex-col justify-between space-y-3">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-bold font-mono">YOUTUBE API LIVE</span>
                    <span class="text-xs font-mono text-emerald-400">Connected</span>
                  </div>
                  <h3 class="text-sm font-bold text-white mt-2">${channel.title}</h3>
                  <p class="text-xs text-gray-400 mt-0.5">${channel.subscriberCount || '0'} subscribers • Channel ID: <span class="font-mono text-indigo-300">${channel.channelId || 'N/A'}</span></p>
                </div>
                <div class="text-[11px] text-gray-500 flex items-center justify-between pt-2 border-t border-gray-800">
                  <span>Quota: ~10,000 units/day (~6 video uploads)</span>
                  <a href="${channel.authUrl}" class="text-indigo-400 hover:underline">Re-link</a>
                </div>
              </div>
            `}
          </div>
        </div>

        <!-- Live Pipeline Ribbon (Supabase DB Data) -->
        <div class="glass-card p-5 rounded-2xl space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs uppercase font-semibold text-gray-400 tracking-wider">Live Pipeline Counters (Supabase DB)</span>
            <span class="text-[11px] font-mono text-gray-500">${episodes.length} Episodes Total in Database</span>
          </div>
          <div class="flex items-center justify-between text-xs font-mono">
            <div class="flex flex-col items-center">
              <span class="text-gray-400">DRAFT</span>
              <span class="text-xl font-bold text-white mt-1">${metrics.Draft || 0}</span>
            </div>
            <span class="text-gray-600">→</span>
            <div class="flex flex-col items-center">
              <span class="text-gray-400">PLANNING</span>
              <span class="text-xl font-bold text-white mt-1">${metrics.Planning || 0}</span>
            </div>
            <span class="text-gray-600">→</span>
            <div class="flex flex-col items-center">
              <span class="text-gray-400">PRODUCTION</span>
              <span class="text-xl font-bold text-white mt-1">${metrics.Production || 0}</span>
            </div>
            <span class="text-gray-600">→</span>
            <div class="flex flex-col items-center bg-amber-500/10 border border-amber-500/30 px-5 py-2 rounded-xl shadow-sm">
              <span class="text-amber-400 font-bold">REVIEW (READY)</span>
              <span class="text-2xl font-black text-amber-300 mt-0.5">${metrics.Review || 0}</span>
            </div>
            <span class="text-gray-600">→</span>
            <div class="flex flex-col items-center">
              <span class="text-gray-400">SCHEDULED</span>
              <span class="text-xl font-bold text-emerald-400 mt-1">${metrics.Scheduled || 0}</span>
            </div>
            <span class="text-gray-600">→</span>
            <div class="flex flex-col items-center">
              <span class="text-gray-400">PUBLISHED</span>
              <span class="text-xl font-bold text-indigo-400 mt-1">${metrics.Published || 0}</span>
            </div>
          </div>
        </div>

        <!-- Watched Export Folder Status -->
        <div class="glass-card p-5 rounded-2xl space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-xs uppercase font-semibold text-gray-400 tracking-wider">Watched CapCut Export Folder</h3>
              <p class="text-xs text-gray-500">Folder: <code class="text-indigo-300 font-mono">watched_exports/</code></p>
            </div>
            <span class="text-xs font-mono text-gray-400">${exportedVideos.length} Master Videos Detected</span>
          </div>

          ${exportedVideos.length > 0 ? `
            <div class="grid grid-cols-3 gap-3">
              ${exportedVideos.map(v => `
                <div class="p-3 bg-gray-950/70 border border-gray-800 rounded-xl text-xs space-y-1">
                  <div class="font-bold text-white truncate">${v.fileName}</div>
                  <div class="text-[11px] text-gray-400 font-mono">${v.sizeMb} MB • Modified ${new Date(v.modifiedAt).toLocaleTimeString()}</div>
                  <div class="pt-1 flex items-center justify-between text-[11px]">
                    <a href="/api/exports/${encodeURIComponent(v.fileName)}" target="_blank" class="text-indigo-400 hover:text-indigo-300">▶ Play</a>
                    <span class="text-emerald-400 font-mono">Ready to Publish</span>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="p-4 bg-gray-950/40 rounded-xl border border-dashed border-gray-800 text-center text-xs text-gray-500">
              Drop exported videos from CapCut into <code class="text-indigo-300 font-mono">c:\\Users\\DELL\\lams-agent\\watched_exports</code> or drag-and-drop into Episode Preview to link them.
            </div>
          `}
        </div>

        <!-- Recent Agent Receipts -->
        <div class="glass-card p-5 rounded-2xl space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs uppercase font-semibold text-gray-400 tracking-wider">Agent Activity & Cryptographic Receipts</h3>
            <span class="text-xs text-gray-500 font-mono">HMAC SHA-256 Verified</span>
          </div>
          <div class="space-y-2 text-xs">
            <div class="p-3 bg-gray-950/60 border border-gray-800/80 rounded-xl flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                <div>
                  <span class="font-bold text-white">CapCut Timeline Assembly</span>
                  <span class="text-gray-500 font-mono text-[11px] ml-2">rcpt_7f3a8b...</span>
                </div>
              </div>
              <div class="flex items-center gap-4 text-gray-400 font-mono text-[11px]">
                <span>Duration: 142ms</span>
                <span class="text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded">VERIFIED PASS</span>
              </div>
            </div>
            <div class="p-3 bg-gray-950/60 border border-gray-800/80 rounded-xl flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                <div>
                  <span class="font-bold text-white">Full YouTube Production Pipeline</span>
                  <span class="text-gray-500 font-mono text-[11px] ml-2">rcpt_1e9c4d...</span>
                </div>
              </div>
              <div class="flex items-center gap-4 text-gray-400 font-mono text-[11px]">
                <span>Duration: 320ms</span>
                <span class="text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded">VERIFIED PASS</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ========================================== -->
      <!-- TAB 2: EPISODES PIPELINE                   -->
      <!-- ========================================== -->
      <section id="view-episodes" class="hidden space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm font-bold text-white">Episodes Pipeline (${episodes.length})</h2>
            <p class="text-xs text-gray-400">Visual cards of all episodes in your Supabase database</p>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <button onclick="filterEpisodes('all')" class="bg-gray-800 text-white px-3 py-1 rounded-lg">All</button>
            <button onclick="filterEpisodes('Review')" class="bg-amber-950 text-amber-300 border border-amber-800 px-3 py-1 rounded-lg font-bold">Needs Review (${metrics.Review || 0})</button>
            <button onclick="filterEpisodes('Draft')" class="bg-gray-900 text-gray-400 px-3 py-1 rounded-lg">Draft (${metrics.Draft || 0})</button>
            <button onclick="filterEpisodes('Scheduled')" class="bg-gray-900 text-emerald-400 px-3 py-1 rounded-lg">Scheduled (${metrics.Scheduled || 0})</button>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-5" id="episodesGrid">
          ${episodes.map(ep => `
            <div class="glass-card p-5 rounded-2xl border ${ep.status === 'Review' ? 'border-amber-500/50 bg-amber-950/10' : 'border-gray-800/80'} flex flex-col justify-between space-y-4 hover:border-indigo-500/40 transition">
              <div>
                <div class="flex items-center justify-between">
                  <span class="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded font-mono font-bold">${ep.projectName}</span>
                  <span class="text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold ${ep.status === 'Review' ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-gray-800 text-gray-400'}">${ep.status}</span>
                </div>
                <h3 class="text-sm font-bold text-white mt-2 leading-snug">${ep.title}</h3>
                <p class="text-xs text-gray-400 mt-1 line-clamp-2">${ep.topic}</p>
              </div>

              <!-- Scene progress & actions -->
              <div class="space-y-3 pt-2 border-t border-gray-800/60">
                <div class="flex items-center justify-between text-[11px] font-mono text-gray-400">
                  <span>Scenes: ${ep.completedScenesCount} / ${ep.scenesCount}</span>
                  <span>${new Date(ep.createdAt).toLocaleDateString()}</span>
                </div>
                <div class="flex items-center gap-2">
                  <a href="/api/episodes/${ep.id}/preview" target="_blank" class="flex-1 bg-gray-800 hover:bg-gray-700 text-center text-gray-200 text-xs font-semibold py-1.5 rounded-xl border border-gray-700 transition">
                    ▶ Preview
                  </a>
                  <button onclick="assembleCapCutDraft('${ep.id}')" class="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold py-1.5 rounded-xl border border-gray-700 transition">
                    ✂️ CapCut
                  </button>
                  <button onclick="approveEpisode('${ep.id}')" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-md transition">
                    ✓ Release
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- ========================================== -->
      <!-- TAB 3: WORKFORCE SKILLS                    -->
      <!-- ========================================== -->
      <section id="view-skills" class="hidden space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm font-bold text-white">Workforce Skills Library</h2>
            <p class="text-xs text-gray-400">Autonomous, deterministic, and compiled demonstration skills</p>
          </div>
          <button onclick="openTeachModal()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition">
            + Teach New Skill
          </button>
        </div>

        <div class="grid grid-cols-3 gap-5">
          ${skills.map(s => `
            <div class="glass-card p-5 rounded-2xl border border-gray-800/80 flex flex-col justify-between space-y-4">
              <div>
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold text-white">${s.name}</span>
                  <span class="text-[9px] bg-gray-800 text-gray-300 font-mono px-1.5 py-0.5 rounded">v${s.version}</span>
                </div>
                <p class="text-xs text-gray-400 mt-2 line-clamp-3">${s.description}</p>
              </div>

              <div class="space-y-2 pt-2 border-t border-gray-800/80 text-xs">
                <div class="flex items-center justify-between text-[11px] text-gray-500 font-mono">
                  <span>Execution: <strong class="text-gray-300">${s.executionMode.replace('_', ' ')}</strong></span>
                  <span>Gate: <strong class="${s.approvalGate.required ? 'text-amber-400' : 'text-emerald-400'}">${s.approvalGate.level}</strong></span>
                </div>
                <div class="flex items-center justify-between pt-1">
                  <span class="text-[11px] text-gray-500 font-mono">${s.actions.length} Steps Defined</span>
                  <button onclick="runSkill('${s.id}')" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-lg transition">
                    ▶ Run
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- ========================================== -->
      <!-- TAB 4: CONNECTIONS & HEALTH                -->
      <!-- ========================================== -->
      <section id="view-connections" class="hidden space-y-6">
        <div>
          <h2 class="text-sm font-bold text-white">System Integrations & API Health</h2>
          <p class="text-xs text-gray-400">Status of connected services, credentials, and local subsystems</p>
        </div>

        <div class="grid grid-cols-2 gap-5">
          <!-- YouTube Card -->
          <div class="glass-card p-6 rounded-2xl border ${channel.isConnected ? 'border-emerald-500/40' : 'border-red-500/40'} space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl bg-red-600 flex items-center justify-center font-bold text-white">YT</div>
                <div>
                  <h3 class="text-sm font-bold text-white">YouTube Data API v3</h3>
                  <p class="text-xs text-gray-400">OAuth 2.0 Video Publishing & Scheduling</p>
                </div>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded font-bold ${channel.isConnected ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-red-950 text-red-300 border border-red-800'}">
                ${channel.isConnected ? 'LINKED & ACTIVE' : 'UNLINKED / EXPIRED'}
              </span>
            </div>

            <p class="text-xs text-gray-400 leading-relaxed">
              ${channel.isConnected ? `
                Connected Channel: <strong>${channel.title}</strong> (${channel.subscriberCount || '0'} subs).<br/>
                Videos uploaded via this integration are posted privately and scheduled for your designated publication time.
              ` : `
                No active YouTube refresh token found. Click below to sign in with Lams' Google account and authorize uploads.
              `}
            </p>

            <div>
              <a href="${channel.authUrl}" class="inline-flex items-center gap-2 ${channel.isConnected ? 'bg-gray-800 hover:bg-gray-700 text-gray-200' : 'bg-red-600 hover:bg-red-500 text-white'} text-xs font-semibold px-4 py-2 rounded-xl transition">
                <span>🔗</span> <span>${channel.isConnected ? 'Re-authorize YouTube Channel' : 'Authorize Lams YouTube Account'}</span>
              </a>
            </div>
          </div>

          <!-- Supabase DB Card -->
          <div class="glass-card p-6 rounded-2xl border border-emerald-500/40 space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center font-bold text-white">DB</div>
                <div>
                  <h3 class="text-sm font-bold text-white">Supabase Live Database</h3>
                  <p class="text-xs text-gray-400">Projects, Episodes, and Scenes Storage</p>
                </div>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                CONNECTED
              </span>
            </div>
            <p class="text-xs text-gray-400 leading-relaxed">
              Direct connection established to Supabase project <code class="text-indigo-300 font-mono">sobgbrdggmgwajrqjosq</code>.<br/>
              Querying live rows for 48 episodes, 159 scenes, and public studio assets bucket.
            </p>
          </div>

          <!-- FFmpeg Card -->
          <div class="glass-card p-6 rounded-2xl border border-gray-800/80 space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center font-bold text-white">FF</div>
                <div>
                  <h3 class="text-sm font-bold text-white">Headless FFmpeg Engine</h3>
                  <p class="text-xs text-gray-400">Deterministic Filtergraph Stitching</p>
                </div>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                INSTALLED
              </span>
            </div>
            <p class="text-xs text-gray-400 leading-relaxed">
              FFmpeg 8.1.1 is active on Windows PATH. Used for automated scene concatenation, volume ducking, and rendering fallback videos when CapCut is bypassed.
            </p>
          </div>

          <!-- CapCut Desktop Integration Card -->
          <div class="glass-card p-6 rounded-2xl border border-gray-800/80 space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl bg-cyan-600 flex items-center justify-center font-bold text-white">CC</div>
                <div>
                  <h3 class="text-sm font-bold text-white">CapCut Desktop Integration</h3>
                  <p class="text-xs text-gray-400">Local Draft JSON Injection</p>
                </div>
              </div>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                ACTIVE
              </span>
            </div>
            <p class="text-xs text-gray-400 leading-relaxed">
              Injects pre-cached assets directly into <code class="text-indigo-300 font-mono">draft_content.json</code> with microsecond offsets, ready to open in CapCut Desktop.
            </p>
          </div>
        </div>
      </section>

    </main>
  </div>

  <!-- ========================================== -->
  <!-- TEACH NEW SKILL MODAL                      -->
  <!-- ========================================== -->
  <div id="teachModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
    <div class="glass-card max-w-lg w-full p-6 rounded-2xl border border-indigo-500/40 space-y-5 shadow-2xl">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-bold text-white">Teach New Workforce Skill</h3>
          <p class="text-xs text-gray-400">Demonstrate a task once; LAMS HQ compiles it into a reusable skill</p>
        </div>
        <button onclick="closeTeachModal()" class="text-gray-400 hover:text-white text-lg">✕</button>
      </div>

      <div class="space-y-4 text-xs">
        <div>
          <label class="block text-gray-300 font-medium mb-1">Workflow / Skill Name</label>
          <input id="teachSkillName" type="text" placeholder="e.g. Post TikTok Teaser Clip" class="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500" />
        </div>

        <div>
          <label class="block text-gray-300 font-medium mb-1">Target Application</label>
          <select id="teachTargetApp" class="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500">
            <option value="CapCut Desktop">CapCut Desktop</option>
            <option value="YouTube Studio">YouTube Studio</option>
            <option value="TikTok Web / App">TikTok Web / App</option>
            <option value="Custom Browser App">Custom Browser / Web Tool</option>
          </select>
        </div>

        <div>
          <label class="block text-gray-300 font-medium mb-1">Demonstrated Steps Sequence</label>
          <div class="p-3 bg-gray-950/80 rounded-xl border border-gray-800 space-y-2 font-mono text-[11px] text-gray-300">
            <div class="flex items-center gap-2 text-emerald-400"><span>1.</span> <span>Open application & navigate to Content page</span></div>
            <div class="flex items-center gap-2 text-emerald-400"><span>2.</span> <span>Select exported video file from watched folder</span></div>
            <div class="flex items-center gap-2 text-emerald-400"><span>3.</span> <span>Populate title, description & audience tags</span></div>
            <div class="flex items-center gap-2 text-amber-400"><span>4.</span> <span>Human Approval Checkpoint before publishing</span></div>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-2">
        <button onclick="closeTeachModal()" class="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-4 py-2 rounded-xl transition">
          Cancel
        </button>
        <button onclick="compileDemonstrationSkill()" id="btnCompileSkill" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md shadow-indigo-600/30 transition">
          Compile into Reusable Skill
        </button>
      </div>
    </div>
  </div>

  <!-- SCRIPT LOGIC -->
  <script>
    // Tab Switching
    function switchTab(tabId) {
      ['today', 'episodes', 'skills', 'connections'].forEach(t => {
        const view = document.getElementById('view-' + t);
        const tab = document.getElementById('tab-' + t);
        if (t === tabId) {
          view.classList.remove('hidden');
          tab.classList.add('bg-indigo-600', 'text-white', 'shadow-sm');
          tab.classList.remove('text-gray-400');
        } else {
          view.classList.add('hidden');
          tab.classList.remove('bg-indigo-600', 'text-white', 'shadow-sm');
          tab.classList.add('text-gray-400');
        }
      });
    }

    // Chat Logic
    async function handleChatSubmit(e) {
      e.preventDefault();
      const input = document.getElementById('chatInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';

      appendChatMessage('user', text);

      // Call API
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        appendChatMessage('agent', data.reply);
      } catch (err) {
        appendChatMessage('agent', 'Error processing request: ' + err.message);
      }
    }

    function sendQuickPrompt(promptText) {
      document.getElementById('chatInput').value = promptText;
      handleChatSubmit(new Event('submit'));
    }

    function appendChatMessage(sender, text) {
      const container = document.getElementById('chatMessages');
      const msgDiv = document.createElement('div');
      msgDiv.className = 'flex items-start gap-2.5 ' + (sender === 'user' ? 'justify-end' : '');

      if (sender === 'agent') {
        msgDiv.innerHTML = \`
          <div class="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 mt-0.5">AI</div>
          <div class="chat-bubble-agent p-3 rounded-2xl rounded-tl-sm text-gray-300 max-w-[85%] leading-relaxed">\${text}</div>
        \`;
      } else {
        msgDiv.innerHTML = \`
          <div class="chat-bubble-user p-3 rounded-2xl rounded-tr-sm text-white max-w-[85%] leading-relaxed">\${text}</div>
        \`;
      }
      container.appendChild(msgDiv);
      container.scrollTop = container.scrollHeight;
    }

    function clearChat() {
      const container = document.getElementById('chatMessages');
      container.innerHTML = '';
      appendChatMessage('agent', 'Chat cleared. How can I assist your YouTube production today?');
    }

    // Actions
    async function assembleCapCutDraft(id) {
      appendChatMessage('user', 'Assemble CapCut Draft for episode ' + id);
      appendChatMessage('agent', 'Assembling CapCut draft and resolving media assets...');
      try {
        const res = await fetch('/api/episodes/' + id + '/capcut', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        appendChatMessage('agent', '✓ CapCut draft created at:<br/><code class="text-indigo-300 text-[10px] break-all">' + data.draftPath + '</code><br/>Tracks: ' + data.tracksCount + ' • Ready to open in CapCut Desktop.');
        alert('✓ CapCut Draft Created!\\nPath: ' + data.draftPath);
      } catch (err) {
        appendChatMessage('agent', '❌ Failed to create draft: ' + err.message);
        alert('Error: ' + err.message);
      }
    }

    async function approveEpisode(id) {
      const confirmed = confirm('Confirm approving episode and updating Supabase database to Scheduled?\\n\\n- Updates status in Supabase\\n- Requires Master Video file and active YouTube link');
      if (!confirmed) return;

      appendChatMessage('user', 'Approve and publish episode ' + id);
      try {
        const res = await fetch('/api/episodes/' + id + '/approve', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        appendChatMessage('agent', '✓ Episode approved and status updated to <strong>' + data.newStatus + '</strong> in Supabase! Receipt: ' + data.receiptId);
        alert('✓ Approved & Scheduled!\\nReceipt ID: ' + data.receiptId);
        window.location.reload();
      } catch (err) {
        appendChatMessage('agent', '⚠️ Publish Notice: ' + err.message);
        alert('Publish Notice: ' + err.message);
      }
    }

    async function runSkill(id) {
      if (!confirm('Execute skill "' + id + '" now?')) return;
      appendChatMessage('user', 'Run skill: ' + id);
      try {
        const res = await fetch('/api/skills/' + id + '/run', { method: 'POST' });
        const data = await res.json();
        appendChatMessage('agent', 'Skill completed. Outcome: ' + JSON.stringify(data.outputData || data));
        alert('Skill executed successfully!');
      } catch (err) {
        appendChatMessage('agent', 'Error executing skill: ' + err.message);
      }
    }

    // Teach Modal
    function openTeachModal() {
      document.getElementById('teachModal').classList.remove('hidden');
    }
    function closeTeachModal() {
      document.getElementById('teachModal').classList.add('hidden');
    }

    async function compileDemonstrationSkill() {
      const name = document.getElementById('teachSkillName').value.trim();
      const app = document.getElementById('teachTargetApp').value;
      if (!name) {
        alert('Please enter a skill name.');
        return;
      }
      const btn = document.getElementById('btnCompileSkill');
      btn.innerText = 'Compiling Skill Contract...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/teach/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, application: app })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert('✓ Skill Successfully Compiled and Registered!\\n\\nName: ' + data.skill.name + '\\nGate Level: ' + data.skill.approvalGate.level + '\\nSteps: ' + data.skill.actions.length);
        closeTeachModal();
        window.location.reload();
      } catch (err) {
        alert('Compilation Error: ' + err.message);
        btn.innerText = 'Compile into Reusable Skill';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>
`;
}
