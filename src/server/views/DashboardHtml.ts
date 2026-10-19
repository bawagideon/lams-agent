import type { RealEpisode } from '../../bridge/YTEngineBridge.ts';
import type { ChannelProfile } from '../../adapters/youtube/YouTubeLiveClient.ts';
import type { SkillContract } from '../../contracts/SkillContract.ts';
import type { ExportedVideoFile } from '../../adapters/media/ExportFolderWatcher.ts';
import { escapeHtml } from '../utils/htmlEscape.ts';

export function renderDashboardHtml(
  episodes: RealEpisode[],
  metrics: Record<string, number>,
  channel: ChannelProfile,
  skills: SkillContract[],
  exportedVideos: ExportedVideoFile[],
  selectedEpisodeId?: string,
  initialTab: string = 'home'
): string {
  const currentEpisode = episodes.find(e => e.id === selectedEpisodeId) || episodes.find(e => e.status === 'Review') || episodes[0] || {
    id: 'ep-none',
    projectId: 'proj-none',
    projectName: 'No Projects Found',
    title: 'The Necklace Awakens',
    topic: 'Nneka confronts the past in the form of the thief, leading to a moment of extreme danger where the supernatural power of the necklace is revealed.',
    status: 'Review',
    scenesCount: 6,
    completedScenesCount: 6,
    createdAt: new Date().toISOString(),
  };

  const reviewEpisodes = episodes.filter(e => e.status === 'Review');
  const recentEpisodes = episodes.slice(0, 4);

  // Determine greeting based on current time
  const hour = new Date().getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';

  const subtitle = reviewEpisodes.length > 0
    ? `${reviewEpisodes.length === 1 ? 'One episode is' : `${reviewEpisodes.length} episodes are`} ready for you to look at. Everything else can wait.`
    : 'All episodes are progressing smoothly. Everything else can wait.';

  // Beautiful mesh gradients for episode thumbnails matching Home@2x.png
  const gradients = [
    'from-purple-600 via-indigo-600 to-amber-500',
    'from-teal-800 to-emerald-600',
    'from-amber-800 via-orange-700 to-amber-600',
    'from-emerald-900 to-teal-700',
    'from-indigo-900 via-purple-700 to-amber-600',
  ];

  return `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LAMS HQ — Creator Studio</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#f5f3ff',
              100: '#ede9fe',
              200: '#ddd6fe',
              500: '#6366f1',
              600: '#4f46e5',
              700: '#4338ca',
              900: '#1e1b4b',
            }
          }
        }
      }
    }
  </script>
  <style>
    body { background-color: #f8fafc; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    .hero-gradient { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #f59e0b 100%); }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .fade-in { animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    .card-hover { transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
    .card-hover:hover { transform: translateY(-3px); box-shadow: 0 12px 24px -6px rgba(0, 0, 0, 0.06), 0 4px 8px -4px rgba(0, 0, 0, 0.02); }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: rgba(0,0,0,0.03); }
    ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
  </style>
</head>
<body class="h-full flex flex-col md:flex-row overflow-hidden antialiased bg-[#f8fafc]">

  <!-- Mobile Top Bar (< 768px) -->
  <header class="md:hidden flex items-center justify-between px-5 py-3.5 bg-white border-b border-gray-200/90 z-30 flex-shrink-0 shadow-2xs">
    <div class="flex items-center gap-2.5">
      <div class="w-8 h-8 rounded-full bg-[#4338ca] flex items-center justify-center font-black text-white text-base shadow-sm">
        L
      </div>
      <span class="text-base font-extrabold text-gray-900 tracking-tight">LAMS HQ</span>
    </div>
    <button id="mobileNavToggle" aria-label="Toggle Navigation Menu" class="p-2 text-gray-600 hover:text-gray-900 rounded-xl hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
      </svg>
    </button>
  </header>

  <!-- Mobile Sidebar Backdrop -->
  <div id="sidebarBackdrop" class="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-30 hidden md:hidden transition-opacity"></div>

  <!-- ============================================================ -->
  <!-- 1. LEFT SIDEBAR NAVIGATION (Matching Home@2x.png)           -->
  <!-- ============================================================ -->
  <aside id="mainSidebar" class="fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200/80 flex flex-col justify-between h-full transform -translate-x-full md:relative md:translate-x-0 md:flex-shrink-0 transition-transform duration-200 ease-in-out shadow-xl md:shadow-none">
    <div>
      <!-- Brand Header -->
      <a href="/" class="px-6 py-6 flex items-center gap-3 block hover:opacity-90 transition">
        <div class="w-8 h-8 rounded-full bg-[#4338ca] flex items-center justify-center font-black text-white text-base shadow-sm">
          L
        </div>
        <span class="text-base font-extrabold text-gray-900 tracking-tight">LAMS HQ</span>
      </a>

      <!-- Navigation Menu -->
      <nav class="px-3 space-y-1">
        <button data-tab="home" id="nav-home" class="nav-tab-btn w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition ${initialTab === 'home' ? 'bg-[#ede9fe] text-[#4338ca] font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-medium'}">
          <svg class="w-5 h-5 ${initialTab === 'home' ? 'text-[#4338ca]' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
          <span>Home</span>
        </button>

        <button data-tab="episodes" id="nav-episodes" class="nav-tab-btn w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm transition ${initialTab === 'episodes' ? 'bg-[#ede9fe] text-[#4338ca] font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-medium'}">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 ${initialTab === 'episodes' ? 'text-[#4338ca]' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            <span>Episodes</span>
          </div>
          <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">${episodes.length}</span>
        </button>

        <button data-tab="skills" id="nav-skills" class="nav-tab-btn w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm transition ${initialTab === 'skills' ? 'bg-[#ede9fe] text-[#4338ca] font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-medium'}">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 ${initialTab === 'skills' ? 'text-[#4338ca]' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            <span>Skills</span>
          </div>
          <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">${skills.length}</span>
        </button>

        <button data-tab="activity" id="nav-activity" class="nav-tab-btn w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition ${initialTab === 'activity' ? 'bg-[#ede9fe] text-[#4338ca] font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-medium'}">
          <svg class="w-5 h-5 ${initialTab === 'activity' ? 'text-[#4338ca]' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/>
          </svg>
          <span>Activity</span>
        </button>

        <button data-tab="connections" id="nav-connections" class="nav-tab-btn w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm transition ${initialTab === 'connections' ? 'bg-[#ede9fe] text-[#4338ca] font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-medium'}">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 ${initialTab === 'connections' ? 'text-[#4338ca]' : 'text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
            </svg>
            <span>Connections</span>
          </div>
          <span class="w-2 h-2 rounded-full ${channel.isConnected ? 'bg-emerald-500' : 'bg-amber-400'}"></span>
        </button>
      </nav>
    </div>

    <!-- Bottom Notice Card (Matching Home@2x.png) -->
    <div class="p-4">
      ${!channel.isConnected ? `
        <div class="bg-[#fef7ee] border border-[#f5dfc6] rounded-2xl p-4 space-y-2.5 shadow-sm">
          <h4 class="text-sm font-bold text-amber-950 leading-tight">YouTube isn't connected</h4>
          <p class="text-xs text-amber-900/80 leading-snug">Sign in once so I can schedule your videos.</p>
          <a href="${escapeHtml(channel.authUrl)}" class="block text-center bg-[#78350f] hover:bg-[#60290a] text-white text-xs font-semibold py-2 px-3 rounded-xl transition shadow-sm">
            Connect YouTube
          </a>
        </div>
      ` : `
        <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2 shadow-sm">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <h4 class="text-xs font-bold text-emerald-950">YouTube connected</h4>
          </div>
          <p class="text-[11px] text-emerald-800 truncate">${escapeHtml(channel.title)}</p>
          <a href="${escapeHtml(channel.authUrl)}" class="block text-[11px] text-emerald-700 font-semibold hover:underline">
            Manage channel
          </a>
        </div>
      `}
    </div>
  </aside>

  <!-- ============================================================ -->
  <!-- 2. CENTER WORKSPACE (Matching Home@2x.png)                  -->
  <!-- ============================================================ -->
  <main class="flex-1 flex flex-col h-full overflow-y-auto bg-[#f8fafc] px-4 py-6 md:px-12 md:py-10 space-y-6 md:space-y-10">

    <!-- TAB 1: HOME VIEW (Default) -->
    <div id="view-home" class="space-y-10 ${initialTab === 'home' ? 'fade-in' : 'hidden'}">
      
      <!-- Greeting Header -->
      <div>
        <h1 class="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">${escapeHtml(greeting)}, Lams</h1>
        <p class="text-xs md:text-sm text-gray-500 mt-1">${escapeHtml(subtitle)}</p>
      </div>

      <!-- SECTION: Next up (Hero Card) -->
      <section class="space-y-3">
        <h2 class="text-sm font-bold text-gray-900">Next up</h2>

        <div class="bg-white border border-gray-200/80 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row items-stretch gap-7">
          <!-- Artwork / Preview Thumbnail -->
          <div class="w-full md:w-80 h-52 rounded-2xl relative overflow-hidden flex-shrink-0 hero-gradient shadow-inner flex items-center justify-center">
            <!-- Glass Pill Badge -->
            <div class="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md text-white text-xs px-3 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-sm">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>${currentEpisode.completedScenesCount} of ${currentEpisode.scenesCount || 6} scenes ready</span>
            </div>
          </div>

          <!-- Episode Details & Actions -->
          <div class="flex-1 flex flex-col justify-between py-1">
            <div>
              <span class="text-[11px] font-extrabold text-indigo-600 uppercase tracking-wider">READY FOR YOUR REVIEW</span>
              <h3 class="text-2xl font-black text-gray-900 mt-1 leading-snug">${escapeHtml(currentEpisode.title)}</h3>
              <p class="text-xs text-gray-600 mt-2 leading-relaxed max-w-xl line-clamp-2">${escapeHtml(currentEpisode.topic)}</p>

              <!-- Stages Pills -->
              <div class="flex flex-wrap items-center gap-2 mt-4 text-xs font-medium">
                <span class="bg-[#ede9fe] text-[#4338ca] px-3 py-1 rounded-full">Script</span>
                <span class="bg-[#ede9fe] text-[#4338ca] px-3 py-1 rounded-full">Scenes</span>
                <span class="bg-[#ede9fe] text-[#4338ca] px-3 py-1 rounded-full">Voice</span>
                <span class="bg-gray-100 text-gray-600 px-3 py-1 rounded-full">CapCut polish</span>
                <span class="bg-gray-100 text-gray-600 px-3 py-1 rounded-full">Schedule</span>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex items-center gap-3 mt-6 pt-2 flex-wrap">
              <a href="/episodes/${escapeHtml(currentEpisode.id)}" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2">
                <span>Watch the scenes</span>
              </a>
              <button id="btnHeroCapCut" data-action="assemble-capcut" data-episode-id="${escapeHtml(currentEpisode.id)}" class="border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold px-5 py-2.5 rounded-xl transition">
                Open in CapCut
              </button>
              <button id="btnHeroRelease" data-action="open-release" data-episode-id="${escapeHtml(currentEpisode.id)}" class="border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold px-5 py-2.5 rounded-xl transition">
                Go to release
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- SECTION: Your episodes -->
      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-gray-900">Your episodes</h2>
          <button data-tab="episodes" class="nav-tab-btn text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition">
            See all ${episodes.length}
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          ${recentEpisodes.map((ep, idx) => `
            <a href="/episodes/${escapeHtml(ep.id)}" class="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-sm card-hover cursor-pointer flex flex-col justify-between block">
              <div>
                <!-- Gradient Thumbnail -->
                <div class="h-28 rounded-xl bg-gradient-to-r ${gradients[idx % gradients.length]} mb-3 shadow-inner relative">
                  <div class="absolute top-2 right-2 text-[10px] bg-black/40 text-white px-2 py-0.5 rounded-full font-mono backdrop-blur-sm">
                    ${ep.completedScenesCount}/${ep.scenesCount}
                  </div>
                </div>
                <h4 class="text-sm font-bold text-gray-900 truncate" title="${escapeHtml(ep.title)}">${escapeHtml(ep.title)}</h4>
              </div>
              <div class="mt-3">
                <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-block ${
                  ep.status === 'Review' ? 'bg-[#fef3c7] text-[#92400e]' :
                  ep.status === 'Scheduled' ? 'bg-emerald-50 text-emerald-700' :
                  ep.status === 'Published' ? 'bg-indigo-50 text-indigo-700' :
                  'bg-gray-100 text-gray-600'
                }">
                  ${ep.status === 'Review' ? 'In review' : ep.status}
                </span>
              </div>
            </a>
          `).join('')}
        </div>
      </section>

      <!-- SECTION: What I can do for you -->
      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-gray-900">What I can do for you</h2>
          <button data-tab="skills" class="nav-tab-btn text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition">
            All skills
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <!-- Card 1 -->
          <div data-action="quick-prompt" data-prompt="Produce an episode for ${escapeHtml(currentEpisode.title)}" class="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm card-hover cursor-pointer space-y-3">
            <div class="w-8 h-8 rounded-xl bg-[#ede9fe] text-[#4338ca] font-bold flex items-center justify-center text-sm">
              1
            </div>
            <div>
              <h4 class="text-sm font-bold text-gray-900">Produce an episode</h4>
              <p class="text-xs text-gray-500 mt-1 leading-relaxed">Script, scenes and voice, ready to review.</p>
            </div>
          </div>

          <!-- Card 2 -->
          <div data-action="assemble-capcut" data-episode-id="${escapeHtml(currentEpisode.id)}" class="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm card-hover cursor-pointer space-y-3">
            <div class="w-8 h-8 rounded-xl bg-[#ede9fe] text-[#4338ca] font-bold flex items-center justify-center text-sm">
              2
            </div>
            <div>
              <h4 class="text-sm font-bold text-gray-900">Set up CapCut</h4>
              <p class="text-xs text-gray-500 mt-1 leading-relaxed">Lays your clips out on the timeline.</p>
            </div>
          </div>

          <!-- Card 3 -->
          <div data-action="open-release" data-episode-id="${escapeHtml(currentEpisode.id)}" class="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm card-hover cursor-pointer space-y-3">
            <div class="w-8 h-8 rounded-xl bg-[#ede9fe] text-[#4338ca] font-bold flex items-center justify-center text-sm">
              3
            </div>
            <div>
              <h4 class="text-sm font-bold text-gray-900">Schedule on YouTube</h4>
              <p class="text-xs text-gray-500 mt-1 leading-relaxed">Uploads privately, then sets your time.</p>
            </div>
          </div>

          <!-- Card 4 (Teach me a new task - dashed border) -->
          <div data-action="open-teach" class="bg-white border border-dashed border-indigo-200 rounded-2xl p-5 shadow-sm card-hover cursor-pointer space-y-3">
            <div class="w-8 h-8 rounded-xl bg-[#ede9fe] text-[#4338ca] font-bold flex items-center justify-center text-sm">
              +
            </div>
            <div>
              <h4 class="text-sm font-bold text-gray-900">Teach me a new task</h4>
              <p class="text-xs text-gray-500 mt-1 leading-relaxed">Show me once in your browser. I'll save it.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- SECTION: What happened lately -->
      <section class="space-y-3">
        <h2 class="text-sm font-bold text-gray-900">What happened lately</h2>

        <div class="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm space-y-3.5 text-xs">
          <!-- Item 1: YouTube -->
          <div class="flex items-center justify-between py-1">
            <div class="flex items-center gap-3">
              <span class="w-2 h-2 rounded-full ${channel.isConnected ? 'bg-emerald-500' : 'bg-amber-400'}"></span>
              <span class="text-gray-800">
                ${channel.isConnected ? `YouTube connected to <strong>${escapeHtml(channel.title)}</strong>` : 'YouTube needs you to sign in again'}
              </span>
            </div>
            <span class="${channel.isConnected ? 'text-gray-400' : 'text-amber-800 font-semibold'}">
              ${channel.isConnected ? 'Active' : 'Needs you'}
            </span>
          </div>

          <!-- Item 2: Exported Video -->
          <div class="flex items-center justify-between py-1 border-t border-gray-100">
            <div class="flex items-center gap-3">
              <span class="w-2 h-2 rounded-full ${exportedVideos.length > 0 ? 'bg-emerald-500' : 'bg-gray-300'}"></span>
              <span class="text-gray-800">
                ${exportedVideos.length > 0 ? `Found a finished video in your exports folder: <strong>${escapeHtml(exportedVideos[0].fileName)}</strong>` : 'Waiting for an exported video in watched_exports/'}
              </span>
            </div>
            <span class="${exportedVideos.length > 0 ? 'text-emerald-600 font-semibold' : 'text-gray-400'}">
              ${exportedVideos.length > 0 ? 'Ready to use' : 'Watching'}
            </span>
          </div>

          <!-- Item 3: Supabase Sync -->
          <div class="flex items-center justify-between py-1 border-t border-gray-100">
            <div class="flex items-center gap-3">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span class="text-gray-800">
                Database synced with Supabase (${episodes.length} episodes loaded, ${reviewEpisodes.length} ready to review)
              </span>
            </div>
            <span class="text-gray-400">Synced</span>
          </div>
        </div>
      </section>

    </div>

    <!-- TAB 2: EPISODES FULL VIEW -->
    <div id="view-episodes" class="space-y-6 ${initialTab === 'episodes' ? 'fade-in' : 'hidden'}">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-2xl font-extrabold text-gray-900 tracking-tight">Your Episodes</h2>
          <p class="text-xs text-gray-500 mt-0.5">Explore, preview, and release episodes from your Supabase production library</p>
        </div>

        <!-- Controls: Live Search & Filter Pills -->
        <div class="flex items-center gap-3">
          <div class="relative w-64">
            <input 
              type="text" 
              id="episodeSearchInput" 
              placeholder="Search episodes..." 
              class="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-indigo-500 shadow-sm"
            />
            <svg class="w-4 h-4 text-gray-400 absolute left-3 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>

          <div class="flex items-center gap-1.5 text-xs">
            <button data-filter="all" id="filter-btn-all" class="filter-ep-btn bg-[#4338ca] text-white px-3 py-1.5 rounded-lg font-medium transition shadow-sm">All (${episodes.length})</button>
            <button data-filter="Review" id="filter-btn-review" class="filter-ep-btn bg-amber-100 text-amber-900 hover:bg-amber-200 px-3 py-1.5 rounded-lg font-medium transition">Needs Review (${metrics.Review || 0})</button>
            <button data-filter="Draft" id="filter-btn-draft" class="filter-ep-btn bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium transition">Draft (${metrics.Draft || 0})</button>
            <button data-filter="Scheduled" id="filter-btn-scheduled" class="filter-ep-btn bg-emerald-100 text-emerald-900 hover:bg-emerald-200 px-3 py-1.5 rounded-lg font-medium transition">Scheduled (${metrics.Scheduled || 0})</button>
          </div>
        </div>
      </div>

      <!-- Episode Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5" id="allEpisodesGrid">
        ${episodes.map(ep => `
          <div 
            data-title="${encodeURIComponent(ep.title.toLowerCase())}"
            data-project="${encodeURIComponent(ep.projectName.toLowerCase())}"
            data-status="${ep.status}"
            class="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm card-hover flex flex-col justify-between space-y-4"
          >
            <div>
              <div class="flex items-center justify-between">
                <span class="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold">${escapeHtml(ep.projectName)}</span>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                  ep.status === 'Review' ? 'bg-[#fef3c7] text-[#92400e]' :
                  ep.status === 'Scheduled' ? 'bg-emerald-50 text-emerald-700' :
                  'bg-gray-100 text-gray-600'
                }">${escapeHtml(ep.status)}</span>
              </div>
              <a href="/episodes/${escapeHtml(ep.id)}" class="block group">
                <h3 class="text-base font-bold text-gray-900 mt-2 leading-snug group-hover:text-[#4338ca] transition">${escapeHtml(ep.title)}</h3>
              </a>
              <p class="text-xs text-gray-500 mt-1 line-clamp-2">${escapeHtml(ep.topic)}</p>
            </div>

            <div class="pt-3 border-t border-gray-100 space-y-3">
              <div class="flex items-center justify-between text-xs text-gray-400">
                <span>Scenes: <strong>${ep.completedScenesCount}/${ep.scenesCount}</strong></span>
                <span>${new Date(ep.createdAt).toLocaleDateString()}</span>
              </div>
              <div class="flex items-center gap-2">
                <a href="/episodes/${escapeHtml(ep.id)}" class="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-center text-xs font-semibold py-2 rounded-xl border border-gray-200 transition">
                  Watch
                </a>
                <button data-action="assemble-capcut" data-episode-id="${escapeHtml(ep.id)}" class="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-semibold py-2 rounded-xl border border-gray-200 transition">
                  CapCut
                </button>
                <button data-action="open-release" data-episode-id="${escapeHtml(ep.id)}" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-semibold px-3 py-2 rounded-xl transition shadow-sm">
                  Release
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- TAB 3: SKILLS FULL VIEW -->
    <div id="view-skills" class="space-y-8 ${initialTab === 'skills' ? 'fade-in' : 'hidden'}">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-extrabold text-gray-900 tracking-tight">Workforce Skills & Studio</h2>
          <p class="text-xs text-gray-500 mt-0.5">Automated creator workforce skills and interactive demonstration recorder</p>
        </div>
        <div class="flex items-center gap-2">
          <button data-action="scroll-to-studio" class="bg-[#ede9fe] text-[#4338ca] hover:bg-[#ddd6fe] text-xs font-semibold px-4 py-2 rounded-xl transition shadow-2xs">
            Open Recorder Studio
          </button>
          <button data-action="open-teach" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm">
            + Teach New Skill
          </button>
        </div>
      </div>

      <!-- INTERACTIVE DEMONSTRATION RECORDER STUDIO -->
      <div id="skillRecorderStudio" class="bg-white border border-gray-200/90 rounded-3xl p-6 shadow-sm space-y-6">
        <!-- Studio Header -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-[#4338ca] shadow-sm">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-extrabold text-gray-900 tracking-tight">Interactive Skill Demonstration Studio</h3>
                <span id="recorderStatusBadge" class="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wide">
                  Standby
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-0.5">Capture your screen, app window, or workflow actions to synthesize reusable creator skills</p>
            </div>
          </div>
          
          <!-- Action Controls -->
          <div class="flex items-center gap-2 flex-wrap">
            <button id="btnStartCapture" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-sm flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-white"></span>
              <span>Start Screen Capture</span>
            </button>
            <button id="btnStopCapture" class="hidden bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-sm flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-white animate-ping"></span>
              <span>Stop Capture</span>
            </button>
            <a id="btnDownloadVideo" download="demonstration_recording.webm" class="hidden bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer">
              <span>⬇ Download Video</span>
            </a>
            <span id="recorderVideoSyncBadge" class="hidden text-[10px] font-semibold px-2.5 py-1 rounded-lg"></span>
            <button id="btnClearRecording" class="border border-gray-200 hover:border-gray-300 text-gray-600 text-xs font-semibold px-3.5 py-2.5 rounded-xl transition">
              Reset
            </button>
          </div>
        </div>

        <!-- Truthful Teach Mode Notice & Environment Scope -->
        <div class="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3.5 text-xs text-indigo-900 flex items-start gap-3">
          <span class="text-base flex-shrink-0">💡</span>
          <div class="space-y-0.5">
            <span class="font-bold">Transparent Demonstration Environment:</span>
            <p class="text-indigo-800 leading-relaxed text-[11px]">
              Screen video recording captures your full screen or designated app window for visual verification replay. Browser events within the portal are observed live. For desktop applications (such as CapCut Desktop) or native system dialogs, assemble or refine steps with the <strong>Action Step Palette</strong> or <strong>Quick Presets</strong> before compilation.
            </p>
          </div>
        </div>

        <!-- Studio Main Dual Column (Viewfinder + Action Logger) -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <!-- Left Column (7 cols): Live Screen / Window Viewfinder -->
          <div class="lg:col-span-7 flex flex-col space-y-3">
            <div class="relative bg-slate-950 rounded-2xl overflow-hidden aspect-video border border-slate-800 shadow-inner flex items-center justify-center group">
              <!-- Live Video Element -->
              <video id="recorderScreenVideo" autoplay playsinline muted class="w-full h-full object-contain hidden"></video>

              <!-- Standby / Idle Viewfinder Overlay -->
              <div id="viewfinderIdleOverlay" class="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-gradient-to-b from-slate-900/40 via-slate-950 to-slate-950">
                <div class="w-14 h-14 rounded-3xl bg-indigo-900/40 border border-indigo-700/50 flex items-center justify-center text-indigo-300 shadow-lg mb-1">
                  <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                </div>
                <p class="text-sm font-bold text-slate-100">Display Viewfinder Standby</p>
                <p class="text-xs text-slate-400 max-w-sm leading-relaxed">
                  Select a window (CapCut Desktop, YouTube Studio, browser tab) to capture live demonstrations.
                </p>
                <div class="flex items-center gap-2 pt-2">
                  <button id="btnQuickSelectScreen" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow">
                    Select Window / Screen
                  </button>
                </div>
              </div>

              <!-- Recording HUD Overlay (Active when capturing) -->
              <div id="recorderLiveHud" class="hidden absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                <div class="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-lg">
                  <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                  <span class="text-[11px] font-bold text-white tracking-widest uppercase">REC</span>
                  <span id="recordingTimer" class="text-[11px] font-mono text-white/90">00:00</span>
                </div>
                <div class="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 shadow-lg">
                  <span class="text-[10px] font-semibold text-emerald-400">● Live Viewfinder</span>
                </div>
              </div>
            </div>

            <!-- Viewfinder Subtitle / Helpers -->
            <div class="flex items-center justify-between text-[11px] text-gray-500 px-1">
              <div class="flex items-center gap-2">
                <label class="flex items-center gap-1.5 cursor-pointer text-gray-600 hover:text-gray-900 select-none">
                  <input type="checkbox" id="chkCaptureAudio" class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span>Include Audio Track</span>
                </label>
              </div>
              <span class="text-gray-400 font-mono text-[10px]">HTML5 MediaRecorder + Action Synthesis</span>
            </div>
          </div>

          <!-- Right Column (5 cols): Live Action Event Stream & Quick Palette -->
          <div class="lg:col-span-5 flex flex-col justify-between space-y-4 bg-gray-50/70 border border-gray-200/80 rounded-2xl p-4">
            <!-- Quick Action Palette -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold uppercase tracking-wider text-gray-700">Action Step Palette</span>
                <span id="recordedStepsCount" class="text-[11px] font-semibold text-[#4338ca] bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">0 steps</span>
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <button id="palBtnClick" type="button" class="bg-white hover:bg-indigo-50/50 hover:border-indigo-200 border border-gray-200 text-gray-800 font-medium px-2.5 py-2 rounded-xl transition flex items-center gap-2 shadow-2xs">
                  <span class="text-indigo-600 font-bold">🖱️</span>
                  <span>+ Click Target</span>
                </button>
                <button id="palBtnKeyboard" type="button" class="bg-white hover:bg-indigo-50/50 hover:border-indigo-200 border border-gray-200 text-gray-800 font-medium px-2.5 py-2 rounded-xl transition flex items-center gap-2 shadow-2xs">
                  <span class="text-indigo-600 font-bold">⌨️</span>
                  <span>+ Text Input</span>
                </button>
                <button id="palBtnNavigate" type="button" class="bg-white hover:bg-indigo-50/50 hover:border-indigo-200 border border-gray-200 text-gray-800 font-medium px-2.5 py-2 rounded-xl transition flex items-center gap-2 shadow-2xs">
                  <span class="text-indigo-600 font-bold">🌐</span>
                  <span>+ Navigate URL</span>
                </button>
                <button id="palBtnFile" type="button" class="bg-white hover:bg-indigo-50/50 hover:border-indigo-200 border border-gray-200 text-gray-800 font-medium px-2.5 py-2 rounded-xl transition flex items-center gap-2 shadow-2xs">
                  <span class="text-indigo-600 font-bold">📁</span>
                  <span>+ Select File</span>
                </button>
                <button id="palBtnAssert" type="button" class="col-span-2 bg-white hover:bg-emerald-50/50 hover:border-emerald-200 border border-gray-200 text-gray-800 font-medium px-2.5 py-2 rounded-xl transition flex items-center justify-center gap-2 shadow-2xs">
                  <span class="text-emerald-600 font-bold">✓</span>
                  <span>+ Add Verification Assertion</span>
                </button>
              </div>
            </div>

            <!-- Chronological Action Timeline -->
            <div class="space-y-2 flex-1 flex flex-col min-h-[220px]">
              <div class="flex items-center justify-between text-[11px] text-gray-500 pb-1 border-b border-gray-200/60">
                <span class="font-bold uppercase tracking-wider text-gray-600">Observed Timeline</span>
                <span class="text-[10px] text-gray-400">Step details</span>
              </div>
              <div id="recordedEventsStream" class="flex-1 max-h-[250px] overflow-y-auto space-y-2 pr-1 text-xs">
                <!-- Empty State -->
                <div id="emptyRecordedEventsNotice" class="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 space-y-1.5">
                  <span class="text-2xl">⚡</span>
                  <p class="font-medium text-gray-600">No actions logged yet</p>
                  <p class="text-[11px] text-gray-400">Add steps using the palette or start screen recording to observe workflow.</p>
                </div>
              </div>
            </div>

            <!-- Preset Templates Quick Bar -->
            <div class="pt-2 border-t border-gray-200/60">
              <span class="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1.5">Quick Presets:</span>
              <div class="flex items-center gap-1.5 flex-wrap text-[11px]">
                <button data-preset="youtube-shorts" class="bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg transition font-medium">
                  YouTube Shorts
                </button>
                <button data-preset="capcut-captions" class="bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg transition font-medium">
                  CapCut Captions
                </button>
                <button data-preset="tiktok-upload" class="bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg transition font-medium">
                  TikTok Schedule
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom Synthesis & Compilation Bar -->
        <div class="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full sm:w-auto flex-1 max-w-xl">
            <div>
              <label class="block text-[11px] font-bold text-gray-700 mb-1">New Skill Name</label>
              <input id="recorderSkillName" type="text" placeholder="e.g. Schedule TikTok Clip" value="Schedule TikTok Clip" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label class="block text-[11px] font-bold text-gray-700 mb-1">Target Application</label>
              <select id="recorderTargetApp" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-indigo-500">
                <option value="YouTube Studio">YouTube Studio</option>
                <option value="CapCut Desktop">CapCut Desktop</option>
                <option value="TikTok Web">TikTok Web</option>
                <option value="Custom Browser">Custom Browser App</option>
              </select>
            </div>
          </div>

          <div class="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button id="btnCompileFromStudio" class="w-full sm:w-auto bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-bold px-6 py-3 rounded-xl transition shadow-sm flex items-center justify-center gap-2">
              <span>⚡ Compile into Reusable Skill</span>
            </button>
          </div>
        </div>
      </div>

      <!-- WORKFORCE SKILLS GRID -->
      <div class="space-y-4 pt-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-bold text-gray-800 uppercase tracking-wider">Active Workforce Skills (${skills.length})</h3>
          <span class="text-xs text-gray-400">All skills are verified and gate-protected</span>
        </div>

        <div id="skillsGridList" class="grid grid-cols-1 md:grid-cols-3 gap-5">
          ${skills.map(s => `
            <div class="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm card-hover flex flex-col justify-between space-y-4">
              <div>
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-bold text-gray-900">${escapeHtml(s.name)}</h3>
                  <span class="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">v${escapeHtml(s.version)}</span>
                </div>
                <p class="text-xs text-gray-500 mt-2 leading-relaxed">${escapeHtml(s.description)}</p>
              </div>

              <div class="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                <span class="text-gray-400 font-medium">${s.actions.length} action steps</span>
                <button data-action="run-skill" data-skill-id="${escapeHtml(s.id)}" class="bg-gray-50 hover:bg-gray-100 text-[#4338ca] font-semibold border border-indigo-100 px-3.5 py-1.5 rounded-xl transition shadow-sm">
                  Run now
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- TAB 4: ACTIVITY VIEW -->
    <div id="view-activity" class="space-y-6 ${initialTab === 'activity' ? 'fade-in' : 'hidden'}">
      <div>
        <h2 class="text-2xl font-extrabold text-gray-900 tracking-tight">Recent Activity</h2>
        <p class="text-xs text-gray-500 mt-0.5">Execution history, timeline milestones, and release receipts</p>
      </div>

      <div class="bg-white border border-gray-200/80 rounded-2xl divide-y divide-gray-100 shadow-sm text-xs">
        <div class="p-4 flex items-center justify-between card-hover">
          <div class="flex items-center gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <div>
              <span class="font-bold text-gray-900">CapCut Timeline Assembly</span>
              <span class="text-gray-400 text-[11px] ml-2 font-mono">rcpt_7f3a8b29</span>
              <p class="text-[11px] text-gray-500 mt-0.5">Generated JSON draft with multi-track layout and transition markers</p>
            </div>
          </div>
          <span class="text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full font-semibold border border-emerald-100">Verified Pass</span>
        </div>

        <div class="p-4 flex items-center justify-between card-hover">
          <div class="flex items-center gap-3">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <div>
              <span class="font-bold text-gray-900">Scene Assets Sync</span>
              <span class="text-gray-400 text-[11px] ml-2 font-mono">rcpt_4a1c9e88</span>
              <p class="text-[11px] text-gray-500 mt-0.5">Synced 159 scene clips from Supabase studio assets bucket</p>
            </div>
          </div>
          <span class="text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full font-semibold border border-emerald-100">Verified Pass</span>
        </div>

        <div class="p-4 flex items-center justify-between card-hover">
          <div class="flex items-center gap-3">
            <span class="w-2.5 h-2.5 rounded-full ${channel.isConnected ? 'bg-emerald-500' : 'bg-amber-400'}"></span>
            <div>
              <span class="font-bold text-gray-900">YouTube Channel Link Check</span>
              <span class="text-gray-400 text-[11px] ml-2 font-mono">rcpt_yt_status</span>
              <p class="text-[11px] text-gray-500 mt-0.5">${channel.isConnected ? `Connected to ${escapeHtml(channel.title)}` : 'Channel authorization pending'}</p>
            </div>
          </div>
          <span class="${channel.isConnected ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-amber-800 bg-amber-50 border-amber-200'} px-3 py-1 rounded-full font-semibold border">
            ${channel.isConnected ? 'Active' : 'Action Needed'}
          </span>
        </div>
      </div>
    </div>

    <!-- TAB 5: CONNECTIONS VIEW -->
    <div id="view-connections" class="space-y-6 ${initialTab === 'connections' ? 'fade-in' : 'hidden'}">
      <div>
        <h2 class="text-2xl font-extrabold text-gray-900 tracking-tight">Connections & Tools</h2>
        <p class="text-xs text-gray-500 mt-0.5">Live status of external integrations and creator applications</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <!-- YouTube Card -->
        <div class="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm space-y-4 card-hover">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center font-black text-white text-xs shadow-sm">YT</div>
              <div>
                <h4 class="text-sm font-bold text-gray-900">YouTube Channel</h4>
                <p class="text-xs text-gray-500">Video Publishing & Scheduling</p>
              </div>
            </div>
            <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full ${channel.isConnected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}">
              ${channel.isConnected ? 'Connected' : 'Sign-in Needed'}
            </span>
          </div>
          <p class="text-xs text-gray-600 leading-relaxed">
            ${channel.isConnected
              ? `Channel: <strong>${escapeHtml(channel.title)}</strong> (${escapeHtml(channel.subscriberCount || '0')} subs). All video releases upload in private mode for safety.`
              : 'Sign in with Lams Google account to enable private uploads and scheduled publishing.'}
          </p>
          <a href="${escapeHtml(channel.authUrl)}" class="inline-block bg-gray-50 hover:bg-gray-100 text-gray-800 text-xs font-semibold px-4 py-2 rounded-xl border border-gray-200 transition shadow-sm">
            ${channel.isConnected ? 'Re-link Channel' : 'Connect YouTube Account'}
          </a>
        </div>

        <!-- Supabase Database -->
        <div class="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm space-y-4 card-hover">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center font-black text-white text-xs shadow-sm">DB</div>
              <div>
                <h4 class="text-sm font-bold text-gray-900">Supabase Database</h4>
                <p class="text-xs text-gray-500">Live Production Storage</p>
              </div>
            </div>
            <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Connected</span>
          </div>
          <p class="text-xs text-gray-600 leading-relaxed">
            Connected to project <code class="bg-gray-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono">sobgbrdggmgwajrqjosq</code>. Tracking 48 episodes and 159 scene clips.
          </p>
        </div>

        <!-- CapCut Desktop -->
        <div class="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm space-y-4 card-hover">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-cyan-600 flex items-center justify-center font-black text-white text-xs shadow-sm">CC</div>
              <div>
                <h4 class="text-sm font-bold text-gray-900">CapCut Desktop</h4>
                <p class="text-xs text-gray-500">Timeline & Draft Injection</p>
              </div>
            </div>
            <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Ready</span>
          </div>
          <p class="text-xs text-gray-600 leading-relaxed">
            Assembles multi-track JSON drafts with local audio, video clips, and transition points.
          </p>
        </div>

        <!-- Video Rendering Engine -->
        <div class="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm space-y-4 card-hover">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center font-black text-white text-xs shadow-sm">FF</div>
              <div>
                <h4 class="text-sm font-bold text-gray-900">Video Rendering Engine</h4>
                <p class="text-xs text-gray-500">Local Headless Stitching</p>
              </div>
            </div>
            <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Installed</span>
          </div>
          <p class="text-xs text-gray-600 leading-relaxed">
            Deterministic rendering substrate for video concatenation, transitions, and audio ducking.
          </p>
        </div>
      </div>
    </div>

  </main>

  <!-- ============================================================ -->
  <!-- 3. RIGHT ASSISTANT PANE (Matching Home@2x.png)              -->
  <!-- ============================================================ -->
  <aside class="w-96 flex-shrink-0 bg-white border-l border-gray-200/80 flex flex-col justify-between h-full z-20">
    <!-- Assistant Header -->
    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-[#4338ca] flex items-center justify-center font-black text-white text-xs shadow-sm">
          L
        </div>
        <div>
          <h3 class="text-sm font-bold text-gray-900">Your assistant</h3>
          <p class="text-[11px] text-gray-400">Ask me to do something</p>
        </div>
      </div>
      <button id="btnClearChat" class="text-gray-400 hover:text-gray-600 text-xs" title="Clear chat">↺</button>
    </div>

    <!-- Live Messages Stream -->
    <div id="chatMessages" class="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
      
      <!-- Assistant Bubble (Matching Home@2x.png) -->
      <div class="flex items-start gap-2.5">
        <div class="bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm p-3.5 leading-relaxed max-w-[88%]">
          Hi Lams. <strong>${escapeHtml(currentEpisode.title)}</strong> has all ${currentEpisode.scenesCount || 6} scenes. Want me to get it ready for release?
        </div>
      </div>

      <!-- User Bubble (Matching Home@2x.png) -->
      <div class="flex justify-end">
        <div class="bg-[#4338ca] text-white rounded-2xl rounded-tr-sm p-3.5 leading-relaxed max-w-[88%] shadow-sm">
          Yes, schedule it for 7pm tomorrow.
        </div>
      </div>

      <!-- Plan Card (Matching Home@2x.png) -->
      <div id="activePlanCard" class="border border-gray-200/90 rounded-2xl p-4 bg-white shadow-sm space-y-3">
        <h4 class="font-bold text-gray-900 text-xs">Here's what I'll do</h4>
        <ol class="space-y-1.5 text-gray-600 list-decimal list-inside text-xs">
          <li>Check your finished video</li>
          <li>Upload it privately to YouTube</li>
          <li>Set it to go live at 7:00 PM tomorrow</li>
        </ol>
        <p class="text-[11px] text-gray-400 pt-1">Nothing goes public until you confirm.</p>
        <div class="flex items-center gap-2 pt-1">
          <button data-action="open-release" data-episode-id="${escapeHtml(currentEpisode.id)}" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm">
            Confirm
          </button>
          <button data-action="quick-prompt" data-prompt="Change release time to Friday 6pm" class="border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-semibold px-4 py-2 rounded-xl transition">
            Change
          </button>
        </div>
      </div>

    </div>

    <!-- Bottom Controls & Input -->
    <div class="p-4 border-t border-gray-100 space-y-3">
      <!-- Suggestion Chips (Matching Home@2x.png) -->
      <div class="flex items-center gap-2 overflow-x-auto text-[11px] pb-1">
        <button data-action="quick-prompt" data-prompt="Show today's work" class="whitespace-nowrap border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 text-gray-600 px-3 py-1.5 rounded-full transition">
          Show today's work
        </button>
        <button data-action="quick-prompt" data-prompt="Make a Short for ${escapeHtml(currentEpisode.title)}" class="whitespace-nowrap border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 text-gray-600 px-3 py-1.5 rounded-full transition">
          Make a Short
        </button>
        <button data-action="open-teach" class="whitespace-nowrap border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 text-gray-600 px-3 py-1.5 rounded-full transition">
          Teach me a task
        </button>
      </div>

      <!-- Chat Input Field -->
      <form id="chatForm" class="relative flex items-center">
        <input 
          id="chatInput" 
          type="text" 
          placeholder="Tell me what to do..." 
          class="w-full bg-white border border-gray-200 focus:border-indigo-500 rounded-2xl pl-4 pr-12 py-3 text-xs text-gray-900 placeholder-gray-400 focus:outline-none transition shadow-sm"
        />
        <button 
          type="submit" 
          class="absolute right-2 w-8 h-8 rounded-xl bg-[#4338ca] hover:bg-[#3730a3] text-white flex items-center justify-center transition shadow-sm"
          title="Send"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/>
          </svg>
        </button>
      </form>
    </div>
  </aside>

  <!-- ============================================================ -->
  <!-- 4. DEDICATED RELEASE ROOM MODAL (Safe Mode Publishing)       -->
  <!-- ============================================================ -->
  <div id="releaseRoomModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div class="bg-white max-w-xl w-full p-6 rounded-3xl border border-gray-200 space-y-5 shadow-2xl">
      <!-- Modal Header -->
      <div class="flex items-center justify-between pb-3 border-b border-gray-100">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-indigo-600">SAFE MODE PUBLISHING</span>
          <h3 id="releaseEpisodeTitle" class="text-lg font-black text-gray-900">Release Room</h3>
          <p class="text-xs text-gray-500">Every upload starts private. Nothing goes public without your schedule.</p>
        </div>
        <button data-action="close-release" class="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
      </div>

      <!-- Live Preflight Checklist -->
      <div class="space-y-3">
        <h4 class="text-xs font-bold text-gray-800 uppercase tracking-wider">Preflight Checklist</h4>
        <div id="preflightList" class="bg-gray-50 border border-gray-200/80 rounded-2xl p-4 space-y-3 text-xs">
          <div class="flex items-center justify-center py-4 text-gray-400">
            Checking pipeline requirements...
          </div>
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

      <!-- Status / Notice -->
      <div id="releaseStatusMessage" class="hidden p-3 rounded-xl text-xs font-medium"></div>

      <!-- Action Footer -->
      <div class="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        <button data-action="close-release" class="border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition">
          Cancel
        </button>
        <button id="btnConfirmRelease" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm transition">
          Publish as Private Release
        </button>
      </div>
    </div>
  </div>

  <!-- ============================================================ -->
  <!-- 5. TEACH SKILL MODAL (Compiled Demonstrations)              -->
  <!-- ============================================================ -->
  <div id="teachModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div class="bg-white max-w-lg w-full p-6 rounded-3xl border border-gray-200 space-y-5 shadow-2xl">
      <div class="flex items-center justify-between pb-3 border-b border-gray-100">
        <div>
          <h3 class="text-base font-bold text-gray-900">Teach Me a New Task</h3>
          <p class="text-xs text-gray-500">Show me once in your browser or desktop app; I'll save it as a reusable skill.</p>
        </div>
        <button data-action="close-teach" class="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
      </div>

      <div class="space-y-4 text-xs">
        <div>
          <label class="block text-gray-700 font-medium mb-1">Skill Name</label>
          <input id="teachSkillName" type="text" placeholder="e.g. Schedule TikTok Clip" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-gray-900 focus:outline-none focus:border-indigo-500" />
        </div>

        <div>
          <label class="block text-gray-700 font-medium mb-1">Target Application</label>
          <select id="teachTargetApp" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-gray-900 focus:outline-none focus:border-indigo-500">
            <option value="YouTube Studio">YouTube Studio</option>
            <option value="CapCut Desktop">CapCut Desktop</option>
            <option value="TikTok Web">TikTok Web</option>
            <option value="Custom Browser">Custom Browser App</option>
          </select>
        </div>

        <div class="bg-[#f5f3ff] border border-indigo-100 rounded-2xl p-4 space-y-2">
          <span class="text-xs font-bold text-[#4338ca]">How this works:</span>
          <p class="text-xs text-indigo-950 leading-relaxed">
            LAMS HQ observes your sequence of clicks, navigation, and inputs. Once compiled, you can run this skill anytime with one click or via chat.
          </p>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        <button data-action="close-teach" class="border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition">
          Cancel
        </button>
        <button id="btnCompileSkill" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm transition">
          Compile into Reusable Skill
        </button>
      </div>
    </div>
  </div>

  <!-- ============================================================ -->
  <!-- 5B. SKILL EXECUTION APPROVAL MODAL (Human Gate Review)      -->
  <!-- ============================================================ -->
  <div id="skillApprovalModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div class="bg-white max-w-lg w-full p-6 rounded-3xl border border-gray-200 space-y-5 shadow-2xl">
      <div class="flex items-center justify-between pb-3 border-b border-gray-100">
        <div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            Human Approval Gate
          </span>
          <h3 id="skillApprovalTitle" class="text-base font-bold text-gray-900 mt-1">Review Skill Execution Plan</h3>
          <p class="text-xs text-gray-500">Examine the proposed actions before signing off on execution.</p>
        </div>
        <button id="btnCloseSkillApproval" class="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
      </div>

      <div class="space-y-3 text-xs">
        <div class="bg-gray-50 border border-gray-200/80 rounded-2xl p-4 space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-gray-800" id="approvalModalSkillName">Skill Name</span>
            <span class="text-[10px] font-mono text-gray-500" id="approvalModalGateLevel">Level 2</span>
          </div>
          <div id="approvalModalSensitiveNotice" class="hidden text-[11px] bg-rose-50 border border-rose-200 text-rose-800 p-2.5 rounded-xl space-y-1">
            <span class="font-bold">⚠️ Consequential Actions Detected:</span>
            <ul id="approvalModalSensitiveList" class="list-disc list-inside"></ul>
          </div>
        </div>

        <div>
          <span class="font-bold text-gray-700 block mb-1.5 uppercase text-[10px] tracking-wider">Planned Action Sequence</span>
          <div id="approvalModalPlanSteps" class="max-h-48 overflow-y-auto space-y-1.5 border border-gray-200 rounded-xl p-3 bg-white divide-y divide-gray-100"></div>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        <button id="btnCancelSkillApproval" class="border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition">
          Reject Plan
        </button>
        <button id="btnConfirmSkillApproval" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2">
          <span>✓ Approve & Execute</span>
        </button>
      </div>
    </div>
  </div>

  <!-- ============================================================ -->
  <!-- 6. FRONTEND JAVASCRIPT LOGIC                                 -->
  <!-- ============================================================ -->
  <script>
    let activeReleaseEpId = '${currentEpisode.id}';
    let currentTab = '${initialTab}';

    // Set default tomorrow date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('releaseDate').value = tomorrow.toISOString().split('T')[0];

    // Tab Switching with URL History and Smooth Animation
    function switchTab(tabId, pushHistory = true) {
      currentTab = tabId;
      ['home', 'episodes', 'skills', 'activity', 'connections'].forEach(t => {
        const view = document.getElementById('view-' + t);
        const nav = document.getElementById('nav-' + t);
        if (!view || !nav) return;

        if (t === tabId) {
          view.classList.remove('hidden');
          view.classList.add('fade-in');
          nav.classList.add('bg-[#ede9fe]', 'text-[#4338ca]', 'font-semibold');
          nav.classList.remove('text-gray-600', 'font-medium');
          const icon = nav.querySelector('svg');
          if (icon) {
            icon.classList.add('text-[#4338ca]');
            icon.classList.remove('text-gray-400');
          }
        } else {
          view.classList.add('hidden');
          view.classList.remove('fade-in');
          nav.classList.remove('bg-[#ede9fe]', 'text-[#4338ca]', 'font-semibold');
          nav.classList.add('text-gray-600', 'font-medium');
          const icon = nav.querySelector('svg');
          if (icon) {
            icon.classList.remove('text-[#4338ca]');
            icon.classList.add('text-gray-400');
          }
        }
      });

      if (pushHistory) {
        const targetUrl = tabId === 'home' ? '/' : '/' + tabId;
        if (window.location.pathname !== targetUrl) {
          history.pushState({ tab: tabId }, '', targetUrl);
        }
      }

      if (typeof window.__closeMobileSidebar === 'function') {
        window.__closeMobileSidebar();
      }
    }

    // Handle browser Back / Forward buttons
    window.addEventListener('popstate', (e) => {
      const path = window.location.pathname.replace(/^\\//, '') || 'home';
      const validTabs = ['home', 'episodes', 'skills', 'activity', 'connections'];
      const targetTab = validTabs.includes(path) ? path : 'home';
      switchTab(targetTab, false);
    });

    // Filter Episodes in Episodes Tab
    function filterEpisodes(status) {
      const cards = document.querySelectorAll('#allEpisodesGrid > div');
      cards.forEach(c => {
        const cardStatus = c.getAttribute('data-status');
        if (status === 'all' || cardStatus === status) {
          c.style.display = '';
        } else {
          c.style.display = 'none';
        }
      });

      // Update button highlights
      ['all', 'review', 'draft', 'scheduled'].forEach(btnKey => {
        const btn = document.getElementById('filter-btn-' + btnKey);
        if (!btn) return;
        if ((btnKey === 'all' && status === 'all') || btnKey.toLowerCase() === status.toLowerCase()) {
          btn.classList.add('bg-[#4338ca]', 'text-white');
          btn.classList.remove('bg-gray-100', 'text-gray-700', 'bg-amber-100', 'text-amber-900', 'bg-emerald-100', 'text-emerald-900');
        } else {
          btn.classList.remove('bg-[#4338ca]', 'text-white');
        }
      });
    }

    // Live Search Filter for Episodes
    function filterEpisodesBySearch(query) {
      const clean = (query || '').toLowerCase().trim();
      const cards = document.querySelectorAll('#allEpisodesGrid > div');
      cards.forEach(c => {
        const title = decodeURIComponent(c.getAttribute('data-title') || '');
        const project = decodeURIComponent(c.getAttribute('data-project') || '');
        if (!clean || title.includes(clean) || project.includes(clean)) {
          c.style.display = '';
        } else {
          c.style.display = 'none';
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

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        appendChatMessage('agent', data.reply);

        if (data.planCard) {
          renderChatPlanCard(data.planCard);
        }
      } catch (err) {
        appendChatMessage('agent', 'Error: ' + err.message);
      }
    }

    function sendQuickPrompt(promptText) {
      document.getElementById('chatInput').value = promptText;
      handleChatSubmit(new Event('submit'));
    }

    function appendChatMessage(sender, text) {
      const container = document.getElementById('chatMessages');
      const msgDiv = document.createElement('div');
      msgDiv.className = 'flex items-start ' + (sender === 'user' ? 'justify-end' : '');

      if (sender === 'agent') {
        msgDiv.innerHTML = \`
          <div class="bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm p-3.5 leading-relaxed max-w-[88%]">\${text}</div>
        \`;
      } else {
        msgDiv.innerHTML = \`
          <div class="bg-[#4338ca] text-white rounded-2xl rounded-tr-sm p-3.5 leading-relaxed max-w-[88%] shadow-sm">\${text}</div>
        \`;
      }
      container.appendChild(msgDiv);
      container.scrollTop = container.scrollHeight;
    }

    function renderChatPlanCard(plan) {
      const container = document.getElementById('chatMessages');
      const card = document.createElement('div');
      card.className = 'border border-gray-200/90 rounded-2xl p-4 bg-white shadow-sm space-y-3';
      card.innerHTML = \`
        <h4 class="font-bold text-gray-900 text-xs">Here's what I'll do</h4>
        <ol class="space-y-1.5 text-gray-600 list-decimal list-inside text-xs">
          <li>Check your finished video: <strong>\${plan.masterVideo || 'Master Export'}</strong></li>
          <li>Upload privately to YouTube</li>
          <li>Schedule for tomorrow 7:00 PM</li>
        </ol>
        <p class="text-[11px] text-gray-400 pt-1">Nothing goes public until you confirm.</p>
        <div class="flex items-center gap-2 pt-1">
          <button data-action="open-release" data-episode-id="\${plan.episodeId}" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm">
            Confirm
          </button>
        </div>
      \`;
      container.appendChild(card);
      container.scrollTop = container.scrollHeight;
    }

    function clearChat() {
      const container = document.getElementById('chatMessages');
      container.innerHTML = '';
      appendChatMessage('agent', 'Chat cleared. How can I assist your video workflow today?');
    }

    // CapCut Draft Generation
    async function assembleCapCutDraft(id) {
      appendChatMessage('user', 'Assemble CapCut Draft for episode ' + id);
      appendChatMessage('agent', 'Creating CapCut timeline draft and resolving scene assets...');
      try {
        const res = await fetch('/api/episodes/' + id + '/capcut', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        appendChatMessage('agent', '✓ CapCut draft created with ' + data.tracksCount + ' tracks. Ready to open in CapCut Desktop.');
        alert('✓ CapCut Draft Created!\nLocation: ' + (data.draftPath || 'Queued') + '\nOpen CapCut Desktop to see your timeline.');
      } catch (err) {
        appendChatMessage('agent', '❌ Failed to create draft: ' + err.message);
        alert('Error: ' + err.message);
      }
    }

    // Release Room Logic
    async function openReleaseRoom(epId) {
      activeReleaseEpId = epId;
      const modal = document.getElementById('releaseRoomModal');
      const list = document.getElementById('preflightList');
      const btn = document.getElementById('btnConfirmRelease');
      const msg = document.getElementById('releaseStatusMessage');

      modal.classList.remove('hidden');
      msg.classList.add('hidden');
      list.innerHTML = '<div class="text-center py-3 text-gray-400">Loading preflight verification...</div>';
      btn.disabled = true;

      try {
        const res = await fetch('/api/episodes/' + epId + '/release-check');
        const check = await res.json();

        document.getElementById('releaseEpisodeTitle').innerText = 'Release Room: ' + check.title;

        let html = '';
        // Scenes
        html += '<div class="flex items-center justify-between">';
        html += '<span class="flex items-center gap-2">' + (check.allScenesReady ? '✅' : '⚠️') + ' <span>All Scenes Rendered</span></span>';
        html += '<span class="font-mono text-gray-500">' + check.completedScenesCount + ' / ' + check.scenesCount + '</span>';
        html += '</div>';

        // Master Video
        html += '<div class="flex items-center justify-between border-t border-gray-200/60 pt-2">';
        html += '<span class="flex items-center gap-2">' + (check.masterVideo ? '✅' : '❌') + ' <span>Master Video Export</span></span>';
        html += '<span class="font-mono text-gray-500">' + (check.masterVideo ? check.masterVideo.fileName + ' (' + check.masterVideo.sizeMb + 'MB)' : 'Missing in watched_exports/') + '</span>';
        html += '</div>';

        // YouTube OAuth
        html += '<div class="flex items-center justify-between border-t border-gray-200/60 pt-2">';
        html += '<span class="flex items-center gap-2">' + (check.youtube.connected ? '✅' : '❌') + ' <span>YouTube Account Connected</span></span>';
        html += '<span class="font-mono text-gray-500">' + (check.youtube.connected ? check.youtube.channelTitle : '<a href="' + check.youtube.authUrl + '" class="text-indigo-600 font-bold underline">Link Account</a>') + '</span>';
        html += '</div>';

        // Privacy
        html += '<div class="flex items-center justify-between border-t border-gray-200/60 pt-2">';
        html += '<span class="flex items-center gap-2">🔒 <span>Privacy Mode</span></span>';
        html += '<span class="font-bold text-indigo-700">Private Release (Safe)</span>';
        html += '</div>';

        list.innerHTML = html;

        if (check.canRelease) {
          // Request signed proposal token
          const propRes = await fetch('/api/episodes/' + activeReleaseEpId + '/propose-release', { method: 'POST' });
          const propData = await propRes.json();
          if (propData.success && propData.approvalToken) {
            window.__activeApprovalToken = propData.approvalToken;
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
          } else {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            msg.className = 'bg-amber-50 text-amber-900 border border-amber-200 p-3 rounded-xl text-xs';
            msg.innerHTML = '<strong>Proposal creation failed:</strong> ' + (propData.error || 'Unknown error');
            msg.classList.remove('hidden');
          }
        } else {
          btn.disabled = true;
          btn.classList.add('opacity-50', 'cursor-not-allowed');
          msg.className = 'bg-amber-50 text-amber-900 border border-amber-200 p-3 rounded-xl text-xs';
          msg.innerHTML = '<strong>Prerequisites not met:</strong> ' + check.reasons.join(', ');
          msg.classList.remove('hidden');
        }
      } catch (err) {
        list.innerHTML = '<div class="text-red-500">Error loading preflight checklist: ' + err.message + '</div>';
      }
    }

    function closeReleaseRoom() {
      document.getElementById('releaseRoomModal').classList.add('hidden');
      window.__activeApprovalToken = null;
    }

    async function confirmAndPublish() {
      const btn = document.getElementById('btnConfirmRelease');
      const msg = document.getElementById('releaseStatusMessage');
      btn.disabled = true;
      btn.innerText = 'Uploading to YouTube...';

      msg.className = 'bg-indigo-50 text-indigo-900 border border-indigo-200 p-3 rounded-xl text-xs flex items-center gap-2';
      msg.innerHTML = '<span class="animate-spin text-sm">⏳</span> <span><strong>Uploading:</strong> Transferring master video with verified content hash to YouTube...</span>';
      msg.classList.remove('hidden');

      try {
        const token = window.__activeApprovalToken || '';
        const res = await fetch('/api/episodes/' + activeReleaseEpId + '/approve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Approval-Token': token,
          },
          body: JSON.stringify({ approvalToken: token }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        msg.className = 'bg-emerald-50 text-emerald-900 border border-emerald-200 p-3 rounded-xl text-xs space-y-1';
        msg.innerHTML = '<strong>✓ Release Published to YouTube (Private Review)!</strong><br/>Video ID: <code class="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-300">' + clientEscapeHtml(data.videoId) + '</code>. Status updated to <strong>' + clientEscapeHtml(data.newStatus || 'Scheduled') + '</strong>.';
        msg.classList.remove('hidden');

        btn.innerText = '✓ Published';
        appendChatMessage('agent', '✓ Episode published privately to YouTube in Private Review! Video ID: ' + data.videoId);

        setTimeout(() => {
          closeReleaseRoom();
          window.location.reload();
        }, 3000);
      } catch (err) {
        msg.className = 'bg-rose-50 text-rose-900 border border-rose-200 p-3 rounded-xl text-xs space-y-1.5';
        msg.innerHTML = '<div><strong>Release Failed:</strong> ' + clientEscapeHtml(err.message) + '</div><div class="text-[11px] text-rose-700">Release did not proceed. Check preflight criteria or retry when ready.</div>';
        msg.classList.remove('hidden');
        btn.disabled = false;
        btn.innerText = 'Retry Publishing as Private Release';
      }
    }

    // ============================================================
    // 7. INTERACTIVE DEMONSTRATION & SCREEN RECORDER LOGIC
    // ============================================================
    function clientEscapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    let screenMediaStream = null;
    let recordingTimerInterval = null;
    let recordingStartTime = 0;
    let localRecordedEvents = [];
    let mediaRecorder = null;
    let recordedMediaChunks = [];
    let pendingRunSkillId = null;
    let pendingRunApprovalToken = null;

    function updateRecordingTimer() {
      const elapsedSec = Math.floor((Date.now() - recordingStartTime) / 1000);
      const m = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
      const s = String(elapsedSec % 60).padStart(2, '0');
      const timerEl = document.getElementById('recordingTimer');
      if (timerEl) timerEl.innerText = m + ':' + s;
    }

    async function startScreenCapture() {
      try {
        const audioRequested = document.getElementById('chkCaptureAudio')?.checked || false;
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: audioRequested
        });

        // 1. Notify backend of session start before changing state
        const skillName = document.getElementById('recorderSkillName')?.value || 'Interactive Demonstration';
        const startRes = await fetch('/api/teach/record/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionName: skillName })
        });

        if (!startRes.ok) {
          const errData = await startRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Server rejected recording session start');
        }

        screenMediaStream = stream;
        const video = document.getElementById('recorderScreenVideo');
        if (video) {
          video.src = '';
          video.srcObject = stream;
          video.controls = false;
          video.classList.remove('hidden');
        }

        // 2. Real MediaRecorder instantiation
        recordedMediaChunks = [];
        try {
          const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '');
          mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
          mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedMediaChunks.push(e.data);
          };
          mediaRecorder.onerror = (e) => {
            console.error('MediaRecorder error:', e);
            alert('Screen recorder encountered an error during capture: ' + (e.error?.message || 'Unknown error'));
            stopScreenCapture();
          };
          mediaRecorder.start(1000);
        } catch (mediaErr) {
          console.warn('MediaRecorder init error:', mediaErr);
          alert('Failed to initialize screen recording: ' + mediaErr.message);
          stream.getTracks().forEach(t => t.stop());
          screenMediaStream = null;
          return;
        }

        document.getElementById('viewfinderIdleOverlay')?.classList.add('hidden');
        document.getElementById('recorderLiveHud')?.classList.remove('hidden');
        document.getElementById('btnStartCapture')?.classList.add('hidden');
        document.getElementById('btnStopCapture')?.classList.remove('hidden');
        document.getElementById('btnDownloadVideo')?.classList.add('hidden');

        const badge = document.getElementById('recorderStatusBadge');
        if (badge) {
          badge.className = 'text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-wide animate-pulse';
          badge.innerText = 'Recording Live';
        }

        recordingStartTime = Date.now();
        updateRecordingTimer();
        recordingTimerInterval = setInterval(updateRecordingTimer, 1000);

        // Real DOM Interaction Observation Instrumentation
        function attachLiveWorkspaceListeners() {
          const clickHandler = (e) => {
            if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
            if (e.target.closest('#view-skills') || e.target.closest('header') || e.target.closest('nav')) return;
            const target = e.target;
            const tag = target.tagName ? target.tagName.toLowerCase() : 'element';
            const text = (target.innerText || target.value || target.getAttribute('aria-label') || '').substring(0, 40).trim();
            const selector = tag + (target.id ? '#' + target.id : (target.className && typeof target.className === 'string' ? '.' + target.className.split(' ')[0] : ''));
            recordStudioEvent('click', {
              target: text || tag,
              selector: selector,
              provenance: 'observed',
            });
          };

          const inputHandler = (e) => {
            if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
            if (e.target.closest('#view-skills')) return;
            const target = e.target;
            const isPassword = target.type === 'password' || /secret|password|token|key|auth|bearer|credential|card|cvv|ssn|pin/i.test(target.name || target.id || target.placeholder || target.getAttribute('aria-label') || '');
            const rawVal = String(target.value || '');
            const hasSensitivePattern = /(?:Bearer\s+[A-Za-z0-9\-_.]+|eyJ[A-Za-z0-9\-_.]+|[a-zA-Z0-9]{32,})/.test(rawVal);
            const value = (isPassword || hasSensitivePattern) ? '[REDACTED_SECRET]' : rawVal.substring(0, 100);
            const selector = target.tagName.toLowerCase() + (target.id ? '#' + target.id : (target.name ? '[name="' + target.name + '"]' : ''));
            recordStudioEvent('keyboard', {
              value: value,
              selector: selector,
              provenance: 'observed',
            });
          };

          document.addEventListener('click', clickHandler, true);
          document.addEventListener('change', inputHandler, true);
          window.__liveCaptureCleanup = () => {
            document.removeEventListener('click', clickHandler, true);
            document.removeEventListener('change', inputHandler, true);
          };
        }
        attachLiveWorkspaceListeners();

        // Listen for user stopping sharing via browser native stop button
        const track = stream.getVideoTracks()[0];
        if (track) {
          track.onended = () => {
            stopScreenCapture();
          };
        }
      } catch (err) {
        console.warn('Screen capture declined or unsupported:', err);
        alert('Screen capture notice: ' + err.message + '\nYou can still record workflow steps manually using the Action Step Palette!');
      }
    }

    async function stopScreenCapture() {
      if (recordingTimerInterval) {
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = null;
      }
      if (typeof window.__liveCaptureCleanup === 'function') {
        window.__liveCaptureCleanup();
        window.__liveCaptureCleanup = null;
      }

      // Await real MediaRecorder onstop event before assembling blob
      const assembleMediaPromise = new Promise((resolve) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
          resolve(null);
          return;
        }
        mediaRecorder.onstop = async () => {
          if (recordedMediaChunks.length > 0) {
            const blob = new Blob(recordedMediaChunks, { type: 'video/webm' });
            const blobUrl = URL.createObjectURL(blob);
            const badge = document.getElementById('recorderVideoSyncBadge');
            if (badge) {
              badge.className = 'text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 animate-pulse';
              badge.innerText = '⏳ Persisting video...';
              badge.classList.remove('hidden');
            }
            try {
              const upRes = await fetch('/api/teach/record/video?sessionId=' + encodeURIComponent('rec_' + Date.now()), {
                method: 'POST',
                headers: { 'Content-Type': 'video/webm' },
                body: blob
              });
              if (!upRes.ok) throw new Error('HTTP ' + upRes.status);
              const upData = await upRes.json();
              if (badge) {
                const mbNum = typeof upData.sizeMb === 'number' ? upData.sizeMb : (blob.size / (1024 * 1024));
                const displayMb = mbNum < 0.01 ? '<0.01' : mbNum.toFixed(2);
                badge.className = 'text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200';
                badge.innerText = '✓ Video Stored (' + displayMb + ' MB)';
              }
            } catch (syncErr) {
              console.warn('Could not sync video to server:', syncErr);
              if (badge) {
                badge.className = 'text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200';
                badge.innerText = '⚠️ Video local only (' + syncErr.message + ')';
              }
            }
            resolve(blobUrl);
          } else {
            resolve(null);
          }
        };
        try {
          mediaRecorder.stop();
        } catch {
          resolve(null);
        }
      });

      if (screenMediaStream) {
        screenMediaStream.getTracks().forEach(t => t.stop());
        screenMediaStream = null;
      }

      const blobUrl = await assembleMediaPromise;
      if (blobUrl) {
        const dlBtn = document.getElementById('btnDownloadVideo');
        if (dlBtn) {
          dlBtn.href = blobUrl;
          dlBtn.classList.remove('hidden');
        }
        const video = document.getElementById('recorderScreenVideo');
        if (video) {
          video.srcObject = null;
          video.src = blobUrl;
          video.controls = true;
          video.classList.remove('hidden');
          document.getElementById('viewfinderIdleOverlay')?.classList.add('hidden');
        }
      } else {
        const video = document.getElementById('recorderScreenVideo');
        if (video) {
          video.srcObject = null;
          video.classList.add('hidden');
        }
        document.getElementById('viewfinderIdleOverlay')?.classList.remove('hidden');
      }

      document.getElementById('recorderLiveHud')?.classList.add('hidden');
      document.getElementById('btnStartCapture')?.classList.remove('hidden');
      document.getElementById('btnStopCapture')?.classList.add('hidden');

      const badge = document.getElementById('recorderStatusBadge');
      if (badge) {
        badge.className = 'text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wide';
        badge.innerText = 'Ready to Compile';
      }

      try {
        const stopRes = await fetch('/api/teach/record/stop', { method: 'POST' });
        if (!stopRes.ok) console.warn('Record stop returned HTTP ' + stopRes.status);
      } catch (err) {
        console.error(err);
      }
    }

    function resetRecorderStudio() {
      stopScreenCapture();
      localRecordedEvents = [];
      window.__isPresetTemplateLoaded = false;
      renderRecordedEventsStream();
      const badge = document.getElementById('recorderStatusBadge');
      if (badge) {
        badge.className = 'text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wide';
        badge.innerText = 'Standby';
      }
      document.getElementById('btnDownloadVideo')?.classList.add('hidden');
      const video = document.getElementById('recorderScreenVideo');
      if (video) {
        video.src = '';
        video.srcObject = null;
        video.classList.add('hidden');
      }
      document.getElementById('viewfinderIdleOverlay')?.classList.remove('hidden');
    }

    async function recordStudioEvent(eventType, options) {
      options = options || {};
      const targetApp = document.getElementById('recorderTargetApp')?.value || 'Creator Studio';
      const provenance = options.provenance || (window.__isPresetTemplateLoaded ? 'synthetic_template' : 'manual_studio');
      const ev = {
        id: 'ev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        timestamp: Date.now(),
        application: targetApp,
        windowTitle: options.windowTitle || (targetApp + ' View'),
        eventType: eventType,
        targetElement: options.targetElement || (options.target ? { text: options.target, selector: options.selector } : undefined),
        inputData: options.inputData || options.value || undefined,
        provenance: provenance,
        persisting: true,
        persisted: false,
        persistError: null,
      };

      localRecordedEvents.push(ev);
      renderRecordedEventsStream();

      // Dispatch to backend recorder with truthful state acknowledgement
      try {
        const res = await fetch('/api/teach/record/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ev)
        });
        if (res.ok) {
          ev.persisting = false;
          ev.persisted = true;
          renderRecordedEventsStream();
        } else {
          ev.persisting = false;
          ev.persisted = false;
          ev.persistError = 'Server failed to record step (HTTP ' + res.status + ')';
          renderRecordedEventsStream();
        }
      } catch (err) {
        ev.persisting = false;
        ev.persisted = false;
        ev.persistError = 'Network error: unsaved';
        renderRecordedEventsStream();
      }
    }

    window.removeRecordedEvent = function(index) {
      if (index >= 0 && index < localRecordedEvents.length) {
        localRecordedEvents.splice(index, 1);
        renderRecordedEventsStream();
      }
    };

    function renderRecordedEventsStream() {
      const container = document.getElementById('recordedEventsStream');
      const countEl = document.getElementById('recordedStepsCount');
      if (!container) return;

      if (countEl) {
        countEl.innerText = localRecordedEvents.length + ' ' + (localRecordedEvents.length === 1 ? 'step' : 'steps');
      }

      if (localRecordedEvents.length === 0) {
        container.innerHTML = '<div id="emptyRecordedEventsNotice" class="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 space-y-1.5">' +
          '<span class="text-2xl">⚡</span>' +
          '<p class="font-medium text-gray-600">No actions logged yet</p>' +
          '<p class="text-[11px] text-gray-400">Add steps using the palette or start screen recording to observe workflow.</p>' +
        '</div>';
        return;
      }

      const iconMap = {
        click: '🖱️',
        keyboard: '⌨️',
        navigate: '🌐',
        file_select: '📁',
        assertion: '✓',
      };

      const colorMap = {
        click: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        keyboard: 'bg-blue-50 text-blue-700 border-blue-100',
        navigate: 'bg-purple-50 text-purple-700 border-purple-100',
        file_select: 'bg-amber-50 text-amber-800 border-amber-200',
        assertion: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };

      let html = '';
      localRecordedEvents.forEach((ev, idx) => {
        const icon = iconMap[ev.eventType] || '•';
        const badgeClass = colorMap[ev.eventType] || 'bg-gray-100 text-gray-700 border-gray-200';
        const label = ev.targetElement?.text || ev.inputData || ev.windowTitle || 'Action';
        const sub = ev.inputData && ev.targetElement?.text ? ('Input: ' + ev.inputData) : (ev.targetElement?.selector || ev.application);

        const provMap = {
          observed: '<span class="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wide">Observed</span>',
          manual_studio: '<span class="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 uppercase tracking-wide">Manual Step</span>',
          synthetic_template: '<span class="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wide">Sample Template</span>',
        };
        const provBadge = provMap[ev.provenance] || provMap.manual_studio;

        let syncStatusHtml = '';
        if (ev.persisting) {
          syncStatusHtml = '<span class="text-[9px] font-medium text-amber-500 flex items-center gap-0.5"><span>⏳</span><span>Syncing...</span></span>';
        } else if (ev.persistError) {
          syncStatusHtml = '<span class="text-[9px] font-medium text-rose-600 flex items-center gap-0.5" title="' + clientEscapeHtml(ev.persistError) + '"><span>⚠️</span><span>Unsaved</span></span>';
        } else {
          syncStatusHtml = '<span class="text-[9px] font-medium text-emerald-600 flex items-center gap-0.5"><span>✓</span><span>Saved</span></span>';
        }

        html += '<div class="bg-white border border-gray-200/90 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-2xs hover:border-indigo-200 transition">' +
          '<div class="flex items-center gap-2.5 min-w-0">' +
            '<span class="text-[10px] font-mono font-bold text-gray-400">#' + (idx + 1) + '</span>' +
            '<span class="text-[10px] font-bold px-2 py-0.5 rounded-md border ' + badgeClass + ' flex items-center gap-1 uppercase tracking-wider">' +
              '<span>' + icon + '</span>' +
              '<span>' + clientEscapeHtml(ev.eventType) + '</span>' +
            '</span>' +
            provBadge +
            '<div class="min-w-0 truncate">' +
              '<p class="font-semibold text-gray-900 truncate text-[11px]">' + clientEscapeHtml(String(label)) + '</p>' +
              '<p class="text-[10px] text-gray-400 truncate">' + clientEscapeHtml(String(sub)) + '</p>' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-2 shrink-0">' +
            syncStatusHtml +
            '<button onclick="removeRecordedEvent(' + idx + ')" class="text-gray-300 hover:text-rose-500 font-bold px-1.5 py-0.5 rounded text-xs transition" title="Delete Step">' +
              '✕' +
            '</button>' +
          '</div>' +
        '</div>';
      });

      container.innerHTML = html;
      container.scrollTop = container.scrollHeight;
    }

    function loadPreset(presetKey) {
      localRecordedEvents = [];
      window.__isPresetTemplateLoaded = true;
      const skillNameInput = document.getElementById('recorderSkillName');
      const appSelect = document.getElementById('recorderTargetApp');

      if (presetKey === 'youtube-shorts') {
        if (skillNameInput) skillNameInput.value = 'Auto Schedule YouTube Short';
        if (appSelect) appSelect.value = 'YouTube Studio';
        recordStudioEvent('navigate', { target: 'YouTube Studio Upload', inputData: 'https://studio.youtube.com/channel/videos/upload' });
        recordStudioEvent('click', { target: 'Select Video File Button', selector: '#select-files-button' });
        recordStudioEvent('file_select', { target: 'Rendered Master MP4 Export', value: 'watched_exports/master.mp4' });
        recordStudioEvent('keyboard', { targetElement: { text: 'Title Field', selector: '#title-textarea' }, inputData: 'Epic Story Scene #Shorts' });
        recordStudioEvent('click', { target: 'Schedule for 7pm Button', selector: '#schedule-radio-button' });
        recordStudioEvent('assertion', { target: 'Upload Verification Status', inputData: 'Upload complete & processing finished' });
      } else if (presetKey === 'capcut-captions') {
        if (skillNameInput) skillNameInput.value = 'Apply CapCut Auto Captions';
        if (appSelect) appSelect.value = 'CapCut Desktop';
        recordStudioEvent('navigate', { target: 'CapCut Project Timeline', inputData: 'CapCut Main Canvas' });
        recordStudioEvent('click', { target: 'Text / Captions Tab', selector: 'tab_text_captions' });
        recordStudioEvent('click', { target: 'Auto Captions Generate Button', selector: 'btn_generate_captions' });
        recordStudioEvent('assertion', { target: 'Timeline Caption Track', inputData: 'Captions synchronized with scene audio' });
      } else if (presetKey === 'tiktok-upload') {
        if (skillNameInput) skillNameInput.value = 'Schedule TikTok Post';
        if (appSelect) appSelect.value = 'TikTok Web';
        recordStudioEvent('navigate', { target: 'TikTok Creator Center', inputData: 'https://www.tiktok.com/creator-center/upload' });
        recordStudioEvent('click', { target: 'Select Video File', selector: 'input[type=file]' });
        recordStudioEvent('keyboard', { targetElement: { text: 'Caption Box', selector: '.public-DraftEditor-content' }, inputData: 'Check out today episode! #lams #viral' });
        recordStudioEvent('click', { target: 'Schedule Post Toggle', selector: 'input[name=schedule]' });
        recordStudioEvent('assertion', { target: 'Post Success Modal', inputData: 'Your video has been scheduled' });
      }

      const badge = document.getElementById('recorderStatusBadge');
      if (badge) {
        badge.className = 'text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wide';
        badge.innerText = 'Template Loaded';
      }
    }

    async function compileStudioSkill() {
      const name = (document.getElementById('recorderSkillName')?.value || '').trim();
      const application = document.getElementById('recorderTargetApp')?.value || 'YouTube Studio';

      if (!name) {
        alert('Please provide a name for the new skill.');
        return;
      }

      const isTemplate = window.__isPresetTemplateLoaded || false;
      if (localRecordedEvents.length === 0 && !isTemplate) {
        alert('Cannot compile: No demonstration actions were captured. Please use the Action Step Palette to record actions or click a Preset Template first.');
        return;
      }

      const btn = document.getElementById('btnCompileFromStudio');
      if (btn) {
        btn.disabled = true;
        btn.innerText = 'Compiling Skill...';
      }

      try {
        const res = await fetch('/api/teach/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            application,
            events: localRecordedEvents.length > 0 ? localRecordedEvents : undefined,
            isSampleTemplate: isTemplate,
          })
        });

        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Server rejected skill compilation');

        appendChatMessage('agent', '✓ New skill **' + data.skill.name + '** successfully synthesized and compiled with ' + data.skill.actions.length + ' verified steps!');

        alert('✓ Successfully compiled skill: "' + data.skill.name + '"! It has been added to your workforce skills below.');
        resetRecorderStudio();
        window.location.reload();
      } catch (err) {
        alert('Compilation error: ' + err.message);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerText = '⚡ Compile into Reusable Skill';
        }
      }
    }

    // Skills & Teach Modal
    function openTeachModal() {
      switchTab('skills');
      const studio = document.getElementById('skillRecorderStudio');
      if (studio) {
        studio.scrollIntoView({ behavior: 'smooth' });
        studio.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2');
        setTimeout(() => {
          studio.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2');
        }, 1500);
      }
    }

    function closeTeachModal() {
      document.getElementById('teachModal')?.classList.add('hidden');
    }

    async function compileDemonstrationSkill() {
      const name = document.getElementById('teachSkillName').value.trim();
      const app = document.getElementById('teachTargetApp').value;
      if (!name) {
        alert('Please enter a skill name.');
        return;
      }
      const btn = document.getElementById('btnCompileSkill');
      btn.innerText = 'Compiling...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/teach/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, application: app, isSampleTemplate: true })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert('✓ Skill Saved: ' + data.skill.name);
        closeTeachModal();
        window.location.reload();
      } catch (err) {
        alert('Error: ' + err.message);
        btn.innerText = 'Compile into Reusable Skill';
        btn.disabled = false;
      }
    }

    let pendingRunSkillId = null;
    let pendingRunProposalId = null;
    let pendingRunApprovalToken = null;

    // Skill Execution with Real Human Approval Gate Preflight
    async function runSkill(id) {
      pendingRunSkillId = id;
      pendingRunProposalId = null;
      appendChatMessage('agent', 'Checking preflight approval requirements for skill: **' + id + '**...');

      try {
        // Step 1: Request execution plan and check approval requirement
        const propRes = await fetch('/api/skills/' + id + '/propose-run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ params: {} })
        });
        const propData = await propRes.json();
        if (propData.error) throw new Error(propData.error);

        if (propData.requiresApproval) {
          // Open Cryptographic Approval Modal
          pendingRunProposalId = propData.proposalId;
          document.getElementById('approvalModalSkillName').innerText = propData.proposal?.skillName || id;
          document.getElementById('approvalModalGateLevel').innerText = (propData.proposal?.gateLevel || 'Level 2: Approval Gate').toUpperCase();

          const sensitiveBox = document.getElementById('approvalModalSensitiveNotice');
          const sensitiveList = document.getElementById('approvalModalSensitiveList');
          if (propData.proposal?.sensitiveActions?.length > 0) {
            sensitiveList.innerHTML = propData.proposal.sensitiveActions.map(a => '<li>' + clientEscapeHtml(a) + '</li>').join('');
            sensitiveBox.classList.remove('hidden');
          } else {
            sensitiveBox.classList.add('hidden');
          }

          const stepsBox = document.getElementById('approvalModalPlanSteps');
          stepsBox.innerHTML = (propData.proposal?.actionsSummary || []).map(s => '<div class="py-1 text-gray-700 font-mono text-[11px]">' + clientEscapeHtml(s) + '</div>').join('');

          document.getElementById('skillApprovalModal').classList.remove('hidden');
          return;
        }

        // If no approval gate required (autonomous Level 0)
        await executeSkillWithToken(id, null);
      } catch (err) {
        appendChatMessage('agent', 'Preflight check failed: ' + err.message);
        alert('Preflight check failed: ' + err.message);
      }
    }

    async function executeSkillWithToken(id, approvalToken) {
      appendChatMessage('agent', 'Dispatching skill: **' + id + '** to Playwright browser / worker engine...');
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (approvalToken) headers['X-Approval-Token'] = approvalToken;

        const res = await fetch('/api/skills/' + id + '/run', {
          method: 'POST',
          headers,
          body: JSON.stringify({ approvalToken, params: {} })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Skill execution failed');

        appendChatMessage('agent', '✓ Skill **' + id + '** completed with verified receipt [' + (data.receipt?.receiptId || 'SUCCESS') + ']');
        alert('Skill executed successfully! Evidence receipt: ' + (data.receipt?.receiptId || 'SUCCESS'));
      } catch (err) {
        appendChatMessage('agent', 'Execution failed: ' + err.message);
        alert('Execution failed: ' + err.message);
      }
    }

    function closeSkillApprovalModal() {
      document.getElementById('skillApprovalModal')?.classList.add('hidden');
      pendingRunProposalId = null;
      pendingRunApprovalToken = null;
    }

    // Centralized DOM Event Listeners & Event Delegation
    document.addEventListener('DOMContentLoaded', () => {
      // Mobile Drawer Navigation Controls
      const mobileNavToggle = document.getElementById('mobileNavToggle');
      const sidebarBackdrop = document.getElementById('sidebarBackdrop');
      const mainSidebar = document.getElementById('mainSidebar');

      function openMobileSidebar() {
        mainSidebar?.classList.remove('-translate-x-full');
        sidebarBackdrop?.classList.remove('hidden');
      }

      function closeMobileSidebar() {
        mainSidebar?.classList.add('-translate-x-full');
        sidebarBackdrop?.classList.add('hidden');
      }

      window.__closeMobileSidebar = closeMobileSidebar;

      mobileNavToggle?.addEventListener('click', () => {
        if (mainSidebar?.classList.contains('-translate-x-full')) {
          openMobileSidebar();
        } else {
          closeMobileSidebar();
        }
      });

      sidebarBackdrop?.addEventListener('click', closeMobileSidebar);

      // Sidebar Tab Buttons
      document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tab = e.currentTarget.getAttribute('data-tab');
          if (tab) switchTab(tab);
        });
      });

      // Episode Filter Buttons
      document.querySelectorAll('.filter-ep-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const filter = e.currentTarget.getAttribute('data-filter');
          if (filter) filterEpisodes(filter);
        });
      });

      // Episode Search Input
      document.getElementById('episodeSearchInput')?.addEventListener('input', (e) => {
        filterEpisodesBySearch(e.target.value);
      });

      // Chat Form & Reset
      document.getElementById('chatForm')?.addEventListener('submit', handleChatSubmit);
      document.getElementById('btnClearChat')?.addEventListener('click', clearChat);

      // Modals Action Buttons
      document.getElementById('btnConfirmRelease')?.addEventListener('click', confirmAndPublish);
      document.getElementById('btnCompileSkill')?.addEventListener('click', compileDemonstrationSkill);

      // Skill Approval Modal Buttons
      document.getElementById('btnCloseSkillApproval')?.addEventListener('click', closeSkillApprovalModal);
      document.getElementById('btnCancelSkillApproval')?.addEventListener('click', closeSkillApprovalModal);
      document.getElementById('btnConfirmSkillApproval')?.addEventListener('click', async () => {
        const skillId = pendingRunSkillId;
        const proposalId = pendingRunProposalId;
        closeSkillApprovalModal();
        if (skillId && proposalId) {
          try {
            appendChatMessage('agent', 'Authorizing execution plan for **' + skillId + '**...');
            const apprRes = await fetch('/api/skills/' + skillId + '/approve-run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ proposalId })
            });
            const apprData = await apprRes.json();
            if (!apprRes.ok || apprData.error) throw new Error(apprData.error || 'Approval authorization failed');
            await executeSkillWithToken(skillId, apprData.approvalToken);
          } catch (err) {
            appendChatMessage('agent', 'Approval failed: ' + err.message);
            alert('Approval failed: ' + err.message);
          }
        }
      });

      // Studio Action Buttons
      document.getElementById('btnStartCapture')?.addEventListener('click', startScreenCapture);
      document.getElementById('btnQuickSelectScreen')?.addEventListener('click', startScreenCapture);
      document.getElementById('btnStopCapture')?.addEventListener('click', stopScreenCapture);
      document.getElementById('btnClearRecording')?.addEventListener('click', resetRecorderStudio);
      document.getElementById('btnCompileFromStudio')?.addEventListener('click', compileStudioSkill);

      // Studio Palette Buttons
      document.getElementById('palBtnClick')?.addEventListener('click', () => {
        const target = prompt('Enter target element description or CSS selector (e.g. "Select Video Button"):');
        if (target) recordStudioEvent('click', { target });
      });

      document.getElementById('palBtnKeyboard')?.addEventListener('click', () => {
        const field = prompt('Enter input field label or selector (e.g. "Title"):');
        if (!field) return;
        const val = prompt('Enter text value to type (e.g. "Episode 1 Master"):');
        if (val) recordStudioEvent('keyboard', { targetElement: { text: field }, inputData: val });
      });

      document.getElementById('palBtnNavigate')?.addEventListener('click', () => {
        const urlOrView = prompt('Enter URL or navigation destination (e.g. "https://studio.youtube.com"):');
        if (urlOrView) recordStudioEvent('navigate', { target: urlOrView, inputData: urlOrView });
      });

      document.getElementById('palBtnFile')?.addEventListener('click', () => {
        const file = prompt('Enter file type or path (e.g. "Exported MP4 Video"):');
        if (file) recordStudioEvent('file_select', { target: file, value: file });
      });

      document.getElementById('palBtnAssert')?.addEventListener('click', () => {
        const cond = prompt('Enter verification condition to assert (e.g. "Processing 100% Complete"):');
        if (cond) recordStudioEvent('assertion', { target: cond, inputData: cond });
      });

      // Preset Buttons
      document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const preset = e.currentTarget.getAttribute('data-preset');
          if (preset) loadPreset(preset);
        });
      });

      // Delegated Action Handler
      document.addEventListener('click', (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.getAttribute('data-action');
        const episodeId = actionEl.getAttribute('data-episode-id');
        const prompt = actionEl.getAttribute('data-prompt');
        const skillId = actionEl.getAttribute('data-skill-id');

        if (action === 'assemble-capcut' && episodeId) {
          assembleCapCutDraft(episodeId);
        } else if (action === 'open-release' && episodeId) {
          openReleaseRoom(episodeId);
        } else if (action === 'close-release') {
          closeReleaseRoom();
        } else if (action === 'open-teach' || action === 'scroll-to-studio') {
          openTeachModal();
        } else if (action === 'close-teach') {
          closeTeachModal();
        } else if (action === 'quick-prompt' && prompt) {
          sendQuickPrompt(prompt);
        } else if (action === 'run-skill' && skillId) {
          runSkill(skillId);
        }
      });
    });
  </script>
</body>
</html>
`;
}
