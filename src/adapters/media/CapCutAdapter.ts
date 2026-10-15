import fs from 'node:fs';
import path from 'node:path';
import type { MediaPlan } from '../../contracts/MediaPlan.ts';
import type {
  CapCutDraftContent,
  CapCutDraftMetaInfo,
} from '../../contracts/CapCutDraft.ts';
import {
  generateCapCutUUID,
  secondsToMicroseconds,
} from '../../contracts/CapCutDraft.ts';
import { MediaAssetDownloader } from './MediaAssetDownloader.ts';

export interface CapCutExportResult {
  draftId: string;
  draftPath: string;
  totalDurationSeconds: number;
  tracksCount: number;
  materialsCount: number;
  localAssetsCached: number;
}

export class CapCutAdapter {
  private defaultCapCutPath: string;
  private downloader: MediaAssetDownloader;

  constructor(customCapCutDraftRoot?: string) {
    const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\DELL\\AppData\\Local';
    this.defaultCapCutPath = customCapCutDraftRoot || path.join(
      localAppData,
      'CapCut',
      'User Data',
      'Projects',
      'com.lveditor.draft'
    );
    this.downloader = new MediaAssetDownloader();
  }

  /**
   * Resolves target destination on disk
   */
  public resolveDestination(projectId: string, fallbackDir?: string): string {
    if (fs.existsSync(this.defaultCapCutPath)) {
      return path.join(this.defaultCapCutPath, projectId);
    }
    const targetBase = fallbackDir || path.resolve('output', 'capcut_drafts');
    if (!fs.existsSync(targetBase)) {
      fs.mkdirSync(targetBase, { recursive: true });
    }
    return path.join(targetBase, projectId);
  }

  /**
   * Pre-caches remote media and converts MediaPlan into a native CapCut desktop draft
   */
  public async createDraftFromMediaPlan(plan: MediaPlan, targetFolder?: string): Promise<CapCutExportResult> {
    const draftId = generateCapCutUUID();
    const destination = targetFolder || this.resolveDestination(plan.projectId);

    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    // 1. Ensure all remote assets (e.g. from Supabase storage) are downloaded to local disk first
    const localPlan = await this.downloader.preCacheMediaPlanAssets(plan);

    const durationMicros = secondsToMicroseconds(localPlan.durationSeconds);
    const nowMicros = Date.now() * 1000;

    const materials: CapCutDraftContent['materials'] = {
      videos: [],
      audios: [],
      texts: [],
      speeds: [],
      transitions: [],
      effects: [],
    };

    const tracks: CapCutDraftContent['tracks'] = [];
    let cachedCount = 0;

    // 2. Video Tracks
    if (localPlan.tracks.visuals && localPlan.tracks.visuals.length > 0) {
      const videoTrack: CapCutDraftContent['tracks'][0] = {
        id: generateCapCutUUID(),
        type: 'video',
        segments: [],
      };

      for (const vis of localPlan.tracks.visuals) {
        const materialId = generateCapCutUUID();
        const segDurationMicros = secondsToMicroseconds(vis.duration);
        const segStartMicros = secondsToMicroseconds(vis.startTime);
        const resolvedPath = path.resolve(vis.src);

        if (fs.existsSync(resolvedPath)) {
          cachedCount++;
        }

        materials.videos.push({
          id: materialId,
          path: resolvedPath,
          duration: segDurationMicros,
          material_name: path.basename(resolvedPath),
          width: localPlan.resolution.width,
          height: localPlan.resolution.height,
          type: 'video',
        });

        videoTrack.segments.push({
          id: generateCapCutUUID(),
          material_id: materialId,
          source_timerange: {
            start: 0,
            duration: segDurationMicros,
          },
          target_timerange: {
            start: segStartMicros,
            duration: segDurationMicros,
          },
          speed: 1.0,
          volume: vis.volume ?? 1.0,
        });
      }

      tracks.push(videoTrack);
    }

    // 3. Audio Tracks
    const voiceoverAudios = localPlan.tracks.audio.filter((a: any) => a.role === 'voiceover');
    const bgmAudios = localPlan.tracks.audio.filter((a: any) => a.role === 'background_music' || a.role === 'sfx');

    if (voiceoverAudios.length > 0) {
      const voTrack: CapCutDraftContent['tracks'][0] = {
        id: generateCapCutUUID(),
        type: 'audio',
        segments: [],
      };

      for (const vo of voiceoverAudios) {
        const materialId = generateCapCutUUID();
        const durationMicros = secondsToMicroseconds(vo.duration);
        const startMicros = secondsToMicroseconds(vo.startTime);
        const resolvedPath = path.resolve(vo.src);

        materials.audios.push({
          id: materialId,
          path: resolvedPath,
          duration: durationMicros,
          name: path.basename(resolvedPath),
          type: 'extract_music',
        });

        voTrack.segments.push({
          id: generateCapCutUUID(),
          material_id: materialId,
          source_timerange: { start: 0, duration: durationMicros },
          target_timerange: { start: startMicros, duration: durationMicros },
          speed: 1.0,
          volume: vo.volume ?? 1.0,
        });
      }
      tracks.push(voTrack);
    }

    if (bgmAudios.length > 0) {
      const bgmTrack: CapCutDraftContent['tracks'][0] = {
        id: generateCapCutUUID(),
        type: 'audio',
        segments: [],
      };

      for (const bgm of bgmAudios) {
        const materialId = generateCapCutUUID();
        const durationMicros = secondsToMicroseconds(bgm.duration);
        const startMicros = secondsToMicroseconds(bgm.startTime);
        const resolvedPath = path.resolve(bgm.src);

        materials.audios.push({
          id: materialId,
          path: resolvedPath,
          duration: durationMicros,
          name: path.basename(resolvedPath),
          type: 'extract_music',
        });

        bgmTrack.segments.push({
          id: generateCapCutUUID(),
          material_id: materialId,
          source_timerange: { start: 0, duration: durationMicros },
          target_timerange: { start: startMicros, duration: durationMicros },
          speed: 1.0,
          volume: bgm.volume ?? 0.25,
        });
      }
      tracks.push(bgmTrack);
    }

    // 4. Captions Track
    if (localPlan.tracks.captions && localPlan.tracks.captions.length > 0) {
      const textTrack: CapCutDraftContent['tracks'][0] = {
        id: generateCapCutUUID(),
        type: 'text',
        segments: [],
      };

      for (const cap of localPlan.tracks.captions) {
        const materialId = generateCapCutUUID();
        const durationMicros = secondsToMicroseconds(cap.endTime - cap.startTime);
        const startMicros = secondsToMicroseconds(cap.startTime);

        materials.texts.push({
          id: materialId,
          content: cap.text,
          font_size: cap.style === 'cinematic_bold' ? 9.0 : 7.0,
          text_color: '#FFFFFF',
          alignment: 1,
          typesetting: 0,
        });

        textTrack.segments.push({
          id: generateCapCutUUID(),
          material_id: materialId,
          source_timerange: { start: 0, duration: durationMicros },
          target_timerange: { start: startMicros, duration: durationMicros },
          speed: 1.0,
        });
      }
      tracks.push(textTrack);
    }

    // 5. Construct CapCut JSON files
    const draftContent: CapCutDraftContent = {
      id: draftId,
      fps: localPlan.resolution.fps,
      duration: durationMicros,
      canvas_config: {
        width: localPlan.resolution.width,
        height: localPlan.resolution.height,
        ratio: '16:9',
      },
      materials,
      tracks,
      version: 2,
      new_version: '105.0.0', // Stable pinned CapCut format
    };

    const draftMetaInfo: CapCutDraftMetaInfo = {
      draft_id: draftId,
      draft_name: localPlan.title,
      draft_timeline_materials_size: materials.videos.length + materials.audios.length + materials.texts.length,
      tm_draft_create: nowMicros,
      tm_draft_modified: nowMicros,
      draft_fold_path: destination,
    };

    const contentPath = path.join(destination, 'draft_content.json');
    const metaPath = path.join(destination, 'draft_meta_info.json');

    fs.writeFileSync(contentPath, JSON.stringify(draftContent, null, 2), 'utf-8');
    fs.writeFileSync(metaPath, JSON.stringify(draftMetaInfo, null, 2), 'utf-8');

    return {
      draftId,
      draftPath: destination,
      totalDurationSeconds: localPlan.durationSeconds,
      tracksCount: tracks.length,
      materialsCount: materials.videos.length + materials.audios.length + materials.texts.length,
      localAssetsCached: cachedCount,
    };
  }
}
