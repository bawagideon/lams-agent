import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env.ts';
import type { MediaPlan } from '../contracts/MediaPlan.ts';

export interface RealEpisode {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  topic: string;
  status: string;
  scenesCount: number;
  completedScenesCount: number;
  createdAt: string;
}

export interface RealScene {
  id: string;
  sceneNumber: number;
  title: string;
  status: string;
  duration: number;
  visualPrompt: string;
  motionPrompt: string;
  videoUrl: string;
}

export interface RealEpisodeDetails extends RealEpisode {
  scenes: RealScene[];
}

export class YTEngineBridge {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: {
        fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
      },
    });
  }

  /**
   * Fetches real projects and real episodes from Supabase with retry
   */
  public async getRealEpisodes(): Promise<RealEpisode[]> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { data: episodes, error } = await this.supabase
          .from('episodes')
          .select('id, project_id, title, topic, status, total_scenes, completed_scenes, created_at, projects(name)')
          .order('created_at', { ascending: false });

        if (error) {
          console.warn(`[YTEngineBridge] Attempt ${attempt} query error:`, error.message);
          if (attempt === 3) return [];
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        if (!episodes) return [];

        return episodes.map((ep: any) => ({
          id: ep.id,
          projectId: ep.project_id || '',
          projectName: ep.projects?.name || 'Unassigned Project',
          title: ep.title || 'Untitled Episode',
          topic: ep.topic || '',
          status: ep.status || 'Draft',
          scenesCount: ep.total_scenes || 0,
          completedScenesCount: ep.completed_scenes || 0,
          createdAt: ep.created_at,
        }));
      } catch (err: any) {
        console.warn(`[YTEngineBridge] Attempt ${attempt} fetch failed:`, err.message);
        if (attempt === 3) return [];
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    return [];
  }

  /**
   * Computes pipeline metrics from an existing array of episodes (zero DB round-trip)
   */
  public computePipelineMetrics(episodes: RealEpisode[]): Record<string, number> {
    const metrics: Record<string, number> = {
      Draft: 0,
      Planning: 0,
      Production: 0,
      Review: 0,
      Scheduled: 0,
      Published: 0,
    };

    episodes.forEach(ep => {
      const s = ep.status || 'Draft';
      metrics[s] = (metrics[s] || 0) + 1;
    });

    return metrics;
  }

  /**
   * Compiles a real episode and its real rendered scenes into a MediaPlan
   */
  public async compileRealEpisodeToMediaPlan(episodeId: string): Promise<MediaPlan> {
    const { data: episode } = await this.supabase
      .from('episodes')
      .select('*, projects(name)')
      .eq('id', episodeId)
      .single();

    if (!episode) {
      throw new Error(`Episode ${episodeId} not found in database.`);
    }

    const { data: scenes } = await this.supabase
      .from('scenes')
      .select('id, scene_number, status, duration, visual_prompt, motion_prompt, video_url')
      .eq('episode_id', episodeId)
      .order('scene_number', { ascending: true });

    let currentTimelineOffset = 0;
    const visuals: MediaPlan['tracks']['visuals'] = [];
    const captions: MediaPlan['tracks']['captions'] = [];

    const sceneList = scenes || [];

    for (const scene of sceneList) {
      const sceneDuration = scene.duration || 10.0;
      const videoSrc = scene.video_url || `https://sobgbrdggmgwajrqjosq.supabase.co/storage/v1/object/public/studio-assets/scenes/${scene.id}.mp4`;

      visuals.push({
        id: `vis_${scene.id}`,
        src: videoSrc,
        startTime: currentTimelineOffset,
        duration: sceneDuration,
        transition: scene.scene_number === 1 ? 'fade_in' : 'dissolve',
        volume: 1.0,
      });

      let dialogText = scene.visual_prompt || '';
      if (scene.motion_prompt) {
        const dialogMatch = scene.motion_prompt.match(/([A-Za-z\s]+:\s*“[^”]+”)/);
        if (dialogMatch) dialogText = dialogMatch[1];
      }

      captions.push({
        id: `cap_${scene.id}`,
        startTime: currentTimelineOffset + 0.5,
        endTime: currentTimelineOffset + sceneDuration - 0.5,
        text: dialogText.substring(0, 120),
        style: 'cinematic_bold',
      });

      currentTimelineOffset += sceneDuration;
    }

    const totalDuration = currentTimelineOffset > 0 ? currentTimelineOffset : 45.0;

    return {
      projectId: episode.id,
      title: episode.title || 'Untitled Episode',
      resolution: { width: 1920, height: 1080, fps: 30 },
      durationSeconds: totalDuration,
      tracks: {
        visuals,
        audio: [],
        captions,
      },
      metadata: {
        projectName: episode.projects?.name,
        topic: episode.topic,
        status: episode.status,
      },
    };
  }

  public async updateEpisodeStatus(episodeId: string, newStatus: string): Promise<void> {
    const { error } = await this.supabase
      .from('episodes')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', episodeId);

    if (error) {
      throw new Error(`Failed to update episode status in Supabase: ${error.message}`);
    }
  }

  public async getEpisodeDetails(episodeId: string): Promise<RealEpisodeDetails | null> {
    const { data: episode, error: epErr } = await this.supabase
      .from('episodes')
      .select('*, projects(name)')
      .eq('id', episodeId)
      .single();

    if (epErr || !episode) {
      return null;
    }

    const { data: rawScenes } = await this.supabase
      .from('scenes')
      .select('*')
      .eq('episode_id', episodeId)
      .order('scene_number', { ascending: true });

    const scenes: RealScene[] = (rawScenes || []).map((s: any) => ({
      id: s.id,
      sceneNumber: s.scene_number || 1,
      title: s.title || `Scene ${s.scene_number || 1}`,
      status: s.status || 'Pending',
      duration: s.duration || 10,
      visualPrompt: s.visual_prompt || s.image_prompt || '',
      motionPrompt: s.motion_prompt || '',
      videoUrl: s.video_url || '',
    }));

    return {
      id: episode.id,
      projectId: episode.project_id || '',
      projectName: episode.projects?.name || 'Unassigned Project',
      title: episode.title || 'Untitled Episode',
      topic: episode.topic || '',
      status: episode.status || 'Draft',
      scenesCount: episode.total_scenes || scenes.length,
      completedScenesCount: episode.completed_scenes || scenes.filter(sc => sc.status === 'Completed' || sc.videoUrl).length,
      createdAt: episode.created_at,
      scenes,
    };
  }
}
