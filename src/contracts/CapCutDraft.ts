import crypto from 'node:crypto';

export interface CapCutCanvasConfig {
  width: number;
  height: number;
  ratio: string;
}

export interface CapCutVideoMaterial {
  id: string;
  path: string;
  duration: number; // in microseconds
  material_name: string;
  width: number;
  height: number;
  type: string;
}

export interface CapCutAudioMaterial {
  id: string;
  path: string;
  duration: number; // in microseconds
  name: string;
  type: string;
}

export interface CapCutTextMaterial {
  id: string;
  content: string;
  font_size: number;
  text_color: string;
  alignment: number;
  typesetting: number;
}

export interface CapCutSpeedMaterial {
  id: string;
  speed: number;
  curve_speed?: any;
}

export interface CapCutSegment {
  id: string;
  material_id: string;
  source_timerange: {
    start: number; // microseconds
    duration: number; // microseconds
  };
  target_timerange: {
    start: number; // microseconds
    duration: number; // microseconds
  };
  speed: number;
  volume?: number;
  clip?: {
    alpha?: number;
    rotation?: number;
    scale?: { x: number; y: number };
    transform?: { x: number; y: number };
  };
}

export interface CapCutTrack {
  id: string;
  type: 'video' | 'audio' | 'text' | 'effect' | 'filter';
  segments: CapCutSegment[];
  attribute?: number;
  flag?: number;
}

export interface CapCutDraftContent {
  id: string;
  fps: number;
  duration: number; // microseconds
  canvas_config: CapCutCanvasConfig;
  materials: {
    videos: CapCutVideoMaterial[];
    audios: CapCutAudioMaterial[];
    texts: CapCutTextMaterial[];
    speeds: CapCutSpeedMaterial[];
    transitions: any[];
    effects: any[];
  };
  tracks: CapCutTrack[];
  version: number;
  new_version: string;
}

export interface CapCutDraftMetaInfo {
  draft_id: string;
  draft_name: string;
  draft_timeline_materials_size: number;
  tm_draft_create: number; // microseconds
  tm_draft_modified: number; // microseconds
  draft_cover?: string;
  draft_fold_path?: string;
  draft_removable_storage_device?: string;
}

export function generateCapCutUUID(): string {
  return crypto.randomUUID().toUpperCase();
}

export function secondsToMicroseconds(seconds: number): number {
  return Math.round(seconds * 1000 * 1000);
}
