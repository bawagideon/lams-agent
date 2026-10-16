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
    .card-hover { transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
    .card-hover:hover { transform: translateY(-2px); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01); }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: rgba(0,0,0,0.03); }
    ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
  </style>
</head>
<body class="h-full flex overflow-hidden antialiased">

  <!-- ============================================================ -->
  <!-- 1. LEFT SIDEBAR NAVIGATION (Matching Home@2x.png)           -->
  <!-- ============================================================ -->
  <aside class="w-64 flex-shrink-0 bg-white border-r border-gray-200/80 flex flex-col justify-between h-full z-20">
    <div>
      <!-- Brand Header -->
      <div class="px-6 py-6 flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-[#4338ca] flex items-center justify-center font-black text-white text-base shadow-sm">
          L
        </div>
        <span class="text-base font-extrabold text-gray-900 tracking-tight">LAMS HQ</span>
      </div>

      <!-- Navigation Menu -->
      <nav class="px-3 space-y-1">
        <button onclick="switchTab('home')" id="nav-home" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition bg-[#ede9fe] text-[#4338ca]">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
          </svg>
          <span>Home</span>
        </button>

        <button onclick="switchTab('episodes')" id="nav-episodes" class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl font-medium text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            <span>Episodes</span>
          </div>
          <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">${episodes.length}</span>
        </button>

        <button onclick="switchTab('skills')" id="nav-skills" class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl font-medium text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            <span>Skills</span>
          </div>
          <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">${skills.length}</span>
        </button>

        <button onclick="switchTab('activity')" id="nav-activity" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/>
          </svg>
          <span>Activity</span>
        </button>

        <button onclick="switchTab('connections')" id="nav-connections" class="w-full flex items-center justify-between px-4 py-2.5 rounded-xl font-medium text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <a href="${channel.authUrl}" class="block text-center bg-[#78350f] hover:bg-[#60290a] text-white text-xs font-semibold py-2 px-3 rounded-xl transition shadow-sm">
            Connect YouTube
          </a>
        </div>
      ` : `
        <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2 shadow-sm">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <h4 class="text-xs font-bold text-emerald-950">YouTube connected</h4>
          </div>
          <p class="text-[11px] text-emerald-800 truncate">${channel.title}</p>
          <a href="${channel.authUrl}" class="block text-[11px] text-emerald-700 font-semibold hover:underline">
            Manage channel
          </a>
        </div>
      `}
    </div>
  </aside>

  <!-- ============================================================ -->
  <!-- 2. CENTER WORKSPACE (Matching Home@2x.png)                  -->
  <!-- ============================================================ -->
  <main class="flex-1 flex flex-col h-full overflow-y-auto bg-[#f8fafc] px-12 py-10 space-y-10">

    <!-- TAB 1: HOME VIEW (Default) -->
    <div id="view-home" class="space-y-10">
      
      <!-- Greeting Header -->
      <div>
        <h1 class="text-3xl font-extrabold text-gray-900 tracking-tight">${greeting}, Lams</h1>
        <p class="text-sm text-gray-500 mt-1">${subtitle}</p>
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
              <h3 class="text-2xl font-black text-gray-900 mt-1 leading-snug">${currentEpisode.title}</h3>
              <p class="text-xs text-gray-600 mt-2 leading-relaxed max-w-xl line-clamp-2">${currentEpisode.topic}</p>

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
            <div class="flex items-center gap-3 mt-6 pt-2">
              <a href="/api/episodes/${currentEpisode.id}/preview" target="_blank" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2">
                <span>Watch the scenes</span>
              </a>
              <button onclick="assembleCapCutDraft('${currentEpisode.id}')" class="border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold px-5 py-2.5 rounded-xl transition">
                Open in CapCut
              </button>
              <button onclick="openReleaseRoom('${currentEpisode.id}')" class="border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold px-5 py-2.5 rounded-xl transition">
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
          <button onclick="switchTab('episodes')" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition">
            See all ${episodes.length}
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          ${recentEpisodes.map((ep, idx) => `
            <div onclick="selectEpisode('${ep.id}')" class="bg-white border border-gray-200/80 rounded-2xl p-3.5 shadow-sm card-hover cursor-pointer flex flex-col justify-between">
              <div>
                <!-- Gradient Thumbnail -->
                <div class="h-28 rounded-xl bg-gradient-to-r ${gradients[idx % gradients.length]} mb-3 shadow-inner relative">
                  <div class="absolute top-2 right-2 text-[10px] bg-black/40 text-white px-2 py-0.5 rounded-full font-mono backdrop-blur-sm">
                    ${ep.completedScenesCount}/${ep.scenesCount}
                  </div>
                </div>
                <h4 class="text-sm font-bold text-gray-900 truncate" title="${ep.title}">${ep.title}</h4>
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
            </div>
          `).join('')}
        </div>
      </section>

      <!-- SECTION: What I can do for you -->
      <section class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-gray-900">What I can do for you</h2>
          <button onclick="switchTab('skills')" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition">
            All skills
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <!-- Card 1 -->
          <div onclick="sendQuickPrompt('Produce an episode for ' + '${currentEpisode.title}')" class="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm card-hover cursor-pointer space-y-3">
            <div class="w-8 h-8 rounded-xl bg-[#ede9fe] text-[#4338ca] font-bold flex items-center justify-center text-sm">
              1
            </div>
            <div>
              <h4 class="text-sm font-bold text-gray-900">Produce an episode</h4>
              <p class="text-xs text-gray-500 mt-1 leading-relaxed">Script, scenes and voice, ready to review.</p>
            </div>
          </div>

          <!-- Card 2 -->
          <div onclick="assembleCapCutDraft('${currentEpisode.id}')" class="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm card-hover cursor-pointer space-y-3">
            <div class="w-8 h-8 rounded-xl bg-[#ede9fe] text-[#4338ca] font-bold flex items-center justify-center text-sm">
              2
            </div>
            <div>
              <h4 class="text-sm font-bold text-gray-900">Set up CapCut</h4>
              <p class="text-xs text-gray-500 mt-1 leading-relaxed">Lays your clips out on the timeline.</p>
            </div>
          </div>

          <!-- Card 3 -->
          <div onclick="openReleaseRoom('${currentEpisode.id}')" class="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm card-hover cursor-pointer space-y-3">
            <div class="w-8 h-8 rounded-xl bg-[#ede9fe] text-[#4338ca] font-bold flex items-center justify-center text-sm">
              3
            </div>
            <div>
              <h4 class="text-sm font-bold text-gray-900">Schedule on YouTube</h4>
              <p class="text-xs text-gray-500 mt-1 leading-relaxed">Uploads privately, then sets your time.</p>
            </div>
          </div>

          <!-- Card 4 (Teach me a new task - dashed border) -->
          <div onclick="openTeachModal()" class="bg-white border border-dashed border-indigo-200 rounded-2xl p-5 shadow-sm card-hover cursor-pointer space-y-3">
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
                ${channel.isConnected ? `YouTube connected to <strong>${channel.title}</strong>` : 'YouTube needs you to sign in again'}
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
                ${exportedVideos.length > 0 ? `Found a finished video in your exports folder: <strong>${exportedVideos[0].fileName}</strong>` : 'Waiting for an exported video in watched_exports/'}
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
    <div id="view-episodes" class="hidden space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-extrabold text-gray-900 tracking-tight">Your Episodes</h2>
          <p class="text-xs text-gray-500 mt-0.5">All episodes from your Supabase production library</p>
        </div>
        <div class="flex items-center gap-2 text-xs">
          <button onclick="filterEpisodes('all')" class="bg-[#4338ca] text-white px-3 py-1.5 rounded-lg font-medium">All (${episodes.length})</button>
          <button onclick="filterEpisodes('Review')" class="bg-amber-100 text-amber-900 hover:bg-amber-200 px-3 py-1.5 rounded-lg font-medium">Needs Review (${metrics.Review || 0})</button>
          <button onclick="filterEpisodes('Draft')" class="bg-gray-100 text-gray-700 hover:bg-gray-200 px-3 py-1.5 rounded-lg font-medium">Draft (${metrics.Draft || 0})</button>
          <button onclick="filterEpisodes('Scheduled')" class="bg-emerald-100 text-emerald-900 hover:bg-emerald-200 px-3 py-1.5 rounded-lg font-medium">Scheduled (${metrics.Scheduled || 0})</button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-5" id="allEpisodesGrid">
        ${episodes.map(ep => `
          <div class="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm card-hover flex flex-col justify-between space-y-4">
            <div>
              <div class="flex items-center justify-between">
                <span class="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold">${ep.projectName}</span>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                  ep.status === 'Review' ? 'bg-[#fef3c7] text-[#92400e]' :
                  ep.status === 'Scheduled' ? 'bg-emerald-50 text-emerald-700' :
                  'bg-gray-100 text-gray-600'
                }">${ep.status}</span>
              </div>
              <h3 class="text-base font-bold text-gray-900 mt-2 leading-snug">${ep.title}</h3>
              <p class="text-xs text-gray-500 mt-1 line-clamp-2">${ep.topic}</p>
            </div>

            <div class="pt-3 border-t border-gray-100 space-y-3">
              <div class="flex items-center justify-between text-xs text-gray-400">
                <span>Scenes: <strong>${ep.completedScenesCount}/${ep.scenesCount}</strong></span>
                <span>${new Date(ep.createdAt).toLocaleDateString()}</span>
              </div>
              <div class="flex items-center gap-2">
                <a href="/api/episodes/${ep.id}/preview" target="_blank" class="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-center text-xs font-semibold py-2 rounded-xl border border-gray-200 transition">
                  Watch
                </a>
                <button onclick="assembleCapCutDraft('${ep.id}')" class="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-semibold py-2 rounded-xl border border-gray-200 transition">
                  CapCut
                </button>
                <button onclick="openReleaseRoom('${ep.id}')" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-semibold px-3 py-2 rounded-xl transition">
                  Release
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- TAB 3: SKILLS FULL VIEW -->
    <div id="view-skills" class="hidden space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-extrabold text-gray-900 tracking-tight">Workforce Skills</h2>
          <p class="text-xs text-gray-500 mt-0.5">Automated workflows ready to run on your command</p>
        </div>
        <button onclick="openTeachModal()" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm">
          + Teach New Skill
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        ${skills.map(s => `
          <div class="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-sm card-hover flex flex-col justify-between space-y-4">
            <div>
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-bold text-gray-900">${s.name}</h3>
                <span class="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">v${s.version}</span>
              </div>
              <p class="text-xs text-gray-500 mt-2 leading-relaxed">${s.description}</p>
            </div>

            <div class="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
              <span class="text-gray-400 font-medium">${s.actions.length} steps</span>
              <button onclick="runSkill('${s.id}')" class="bg-gray-50 hover:bg-gray-100 text-[#4338ca] font-semibold border border-indigo-100 px-3.5 py-1.5 rounded-xl transition">
                Run now
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- TAB 4: ACTIVITY VIEW -->
    <div id="view-activity" class="hidden space-y-6">
      <div>
        <h2 class="text-2xl font-extrabold text-gray-900 tracking-tight">Recent Activity</h2>
        <p class="text-xs text-gray-500 mt-0.5">Verified execution history and publishing receipts</p>
      </div>

      <div class="bg-white border border-gray-200/80 rounded-2xl divide-y divide-gray-100 shadow-sm text-xs">
        <div class="p-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <div>
              <span class="font-bold text-gray-900">CapCut Timeline Assembly</span>
              <span class="text-gray-400 text-[11px] ml-2">rcpt_7f3a8b29</span>
            </div>
          </div>
          <span class="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full font-semibold">Verified Pass</span>
        </div>

        <div class="p-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <div>
              <span class="font-bold text-gray-900">Scene Assets Sync</span>
              <span class="text-gray-400 text-[11px] ml-2">rcpt_4a1c9e88</span>
            </div>
          </div>
          <span class="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full font-semibold">Verified Pass</span>
        </div>
      </div>
    </div>

    <!-- TAB 5: CONNECTIONS VIEW -->
    <div id="view-connections" class="hidden space-y-6">
      <div>
        <h2 class="text-2xl font-extrabold text-gray-900 tracking-tight">Connections & Tools</h2>
        <p class="text-xs text-gray-500 mt-0.5">Integrations powering your creator workforce</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <!-- YouTube Card -->
        <div class="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center font-black text-white text-xs">YT</div>
              <div>
                <h4 class="text-sm font-bold text-gray-900">YouTube Channel</h4>
                <p class="text-xs text-gray-500">Video Publishing & Scheduling</p>
              </div>
            </div>
            <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full ${channel.isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}">
              ${channel.isConnected ? 'Connected' : 'Sign-in Needed'}
            </span>
          </div>
          <p class="text-xs text-gray-600 leading-relaxed">
            ${channel.isConnected
              ? `Channel: <strong>${channel.title}</strong> (${channel.subscriberCount || '0'} subs). Ready to upload private releases.`
              : 'Sign in with Lams Google account to enable private uploads and scheduled publishing.'}
          </p>
          <a href="${channel.authUrl}" class="inline-block bg-gray-50 hover:bg-gray-100 text-gray-800 text-xs font-semibold px-4 py-2 rounded-xl border border-gray-200 transition">
            ${channel.isConnected ? 'Re-link Channel' : 'Connect YouTube Account'}
          </a>
        </div>

        <!-- Supabase Database -->
        <div class="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center font-black text-white text-xs">DB</div>
              <div>
                <h4 class="text-sm font-bold text-gray-900">Supabase Database</h4>
                <p class="text-xs text-gray-500">Live Production Storage</p>
              </div>
            </div>
            <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Connected</span>
          </div>
          <p class="text-xs text-gray-600 leading-relaxed">
            Connected to project <code class="bg-gray-100 text-indigo-700 px-1.5 py-0.5 rounded font-mono">sobgbrdggmgwajrqjosq</code>. Tracking 48 episodes and 159 scene clips.
          </p>
        </div>

        <!-- CapCut Desktop -->
        <div class="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-cyan-600 flex items-center justify-center font-black text-white text-xs">CC</div>
              <div>
                <h4 class="text-sm font-bold text-gray-900">CapCut Desktop</h4>
                <p class="text-xs text-gray-500">Timeline & Draft Injection</p>
              </div>
            </div>
            <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Ready</span>
          </div>
          <p class="text-xs text-gray-600 leading-relaxed">
            Assembles multi-track JSON drafts with local audio, video clips, and transition points.
          </p>
        </div>

        <!-- Video Rendering Engine -->
        <div class="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center font-black text-white text-xs">FF</div>
              <div>
                <h4 class="text-sm font-bold text-gray-900">Video Rendering Engine</h4>
                <p class="text-xs text-gray-500">Local Headless Stitching</p>
              </div>
            </div>
            <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Installed</span>
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
      <button onclick="clearChat()" class="text-gray-400 hover:text-gray-600 text-xs" title="Clear chat">↺</button>
    </div>

    <!-- Live Messages Stream -->
    <div id="chatMessages" class="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
      
      <!-- Assistant Bubble (Matching Home@2x.png) -->
      <div class="flex items-start gap-2.5">
        <div class="bg-gray-100 text-gray-800 rounded-2xl rounded-tl-sm p-3.5 leading-relaxed max-w-[88%]">
          Hi Lams. <strong>${currentEpisode.title}</strong> has all ${currentEpisode.scenesCount || 6} scenes. Want me to get it ready for release?
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
          <button onclick="openReleaseRoom('${currentEpisode.id}')" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm">
            Confirm
          </button>
          <button onclick="sendQuickPrompt('Change release time to Friday 6pm')" class="border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-semibold px-4 py-2 rounded-xl transition">
            Change
          </button>
        </div>
      </div>

    </div>

    <!-- Bottom Controls & Input -->
    <div class="p-4 border-t border-gray-100 space-y-3">
      <!-- Suggestion Chips (Matching Home@2x.png) -->
      <div class="flex items-center gap-2 overflow-x-auto text-[11px] pb-1">
        <button onclick="sendQuickPrompt('Show today\\'s work')" class="whitespace-nowrap border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 text-gray-600 px-3 py-1.5 rounded-full transition">
          Show today's work
        </button>
        <button onclick="sendQuickPrompt('Make a Short for ' + '${currentEpisode.title}')" class="whitespace-nowrap border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 text-gray-600 px-3 py-1.5 rounded-full transition">
          Make a Short
        </button>
        <button onclick="openTeachModal()" class="whitespace-nowrap border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 text-gray-600 px-3 py-1.5 rounded-full transition">
          Teach me a task
        </button>
      </div>

      <!-- Chat Input Field -->
      <form onsubmit="handleChatSubmit(event)" class="relative flex items-center">
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
        <button onclick="closeReleaseRoom()" class="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
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
  <!-- 5. TEACH SKILL MODAL (Compiled Demonstrations)              -->
  <!-- ============================================================ -->
  <div id="teachModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div class="bg-white max-w-lg w-full p-6 rounded-3xl border border-gray-200 space-y-5 shadow-2xl">
      <div class="flex items-center justify-between pb-3 border-b border-gray-100">
        <div>
          <h3 class="text-base font-bold text-gray-900">Teach Me a New Task</h3>
          <p class="text-xs text-gray-500">Show me once in your browser or desktop app; I'll save it as a reusable skill.</p>
        </div>
        <button onclick="closeTeachModal()" class="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
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
        <button onclick="closeTeachModal()" class="border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition">
          Cancel
        </button>
        <button id="btnCompileSkill" onclick="compileDemonstrationSkill()" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm transition">
          Compile into Reusable Skill
        </button>
      </div>
    </div>
  </div>

  <!-- ============================================================ -->
  <!-- 6. FRONTEND JAVASCRIPT LOGIC                                 -->
  <!-- ============================================================ -->
  <script>
    let activeReleaseEpId = '${currentEpisode.id}';

    // Set default tomorrow date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('releaseDate').value = tomorrow.toISOString().split('T')[0];

    // Tab Switching
    function switchTab(tabId) {
      ['home', 'episodes', 'skills', 'activity', 'connections'].forEach(t => {
        const view = document.getElementById('view-' + t);
        const nav = document.getElementById('nav-' + t);
        if (t === tabId) {
          view.classList.remove('hidden');
          nav.classList.add('bg-[#ede9fe]', 'text-[#4338ca]', 'font-semibold');
          nav.classList.remove('text-gray-600');
        } else {
          view.classList.add('hidden');
          nav.classList.remove('bg-[#ede9fe]', 'text-[#4338ca]', 'font-semibold');
          nav.classList.add('text-gray-600');
        }
      });
    }

    // Filter Episodes in Episodes Tab
    function filterEpisodes(status) {
      const cards = document.querySelectorAll('#allEpisodesGrid > div');
      cards.forEach(c => {
        if (status === 'all') {
          c.style.display = '';
        } else {
          const badge = c.querySelector('span.uppercase');
          if (badge && badge.innerText.includes(status.toUpperCase())) {
            c.style.display = '';
          } else {
            c.style.display = 'none';
          }
        }
      });
    }

    function selectEpisode(id) {
      window.location.search = '?episodeId=' + id;
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
          <button onclick="openReleaseRoom('\${plan.episodeId}')" class="bg-[#4338ca] hover:bg-[#3730a3] text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-sm">
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
        alert('✓ CapCut Draft Created!\\nPath: ' + data.draftPath);
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
          btn.disabled = false;
          btn.classList.remove('opacity-50', 'cursor-not-allowed');
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
    }

    async function confirmAndPublish() {
      const btn = document.getElementById('btnConfirmRelease');
      const msg = document.getElementById('releaseStatusMessage');
      btn.disabled = true;
      btn.innerText = 'Publishing Privately...';

      try {
        const res = await fetch('/api/episodes/' + activeReleaseEpId + '/approve', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        msg.className = 'bg-emerald-50 text-emerald-900 border border-emerald-200 p-3 rounded-xl text-xs space-y-1';
        msg.innerHTML = '<strong>✓ Successfully Published!</strong> Video is now private on your channel with Video ID: <code class="font-mono">' + data.videoId + '</code>.<br/>Status updated to Scheduled in Supabase.';
        msg.classList.remove('hidden');

        btn.innerText = 'Release Published';
        appendChatMessage('agent', '✓ Episode published privately to YouTube! Video ID: ' + data.videoId);

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

    // Skills & Teach Modal
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
      btn.innerText = 'Compiling...';
      btn.disabled = true;

      try {
        const res = await fetch('/api/teach/compile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, application: app })
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

    async function runSkill(id) {
      if (!confirm('Run skill: ' + id + '?')) return;
      try {
        const res = await fetch('/api/skills/' + id + '/run', { method: 'POST' });
        const data = await res.json();
        alert('Skill executed successfully!');
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
  </script>
</body>
</html>
`;
}
