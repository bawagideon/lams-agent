import { z } from 'zod';

export const ResolutionSchema = z.object({
  width: z.number().default(1920),
  height: z.number().default(1080),
  fps: z.number().default(30),
});

export const VideoSegmentSchema = z.object({
  id: z.string(),
  src: z.string(), // Local absolute path or URL
  startTime: z.number(), // Offset in timeline (seconds)
  duration: z.number(), // Length of segment (seconds)
  transition: z.enum(['none', 'fade_in', 'dissolve', 'wipe']).default('none'),
  volume: z.number().default(1.0),
});

export const AudioSegmentSchema = z.object({
  id: z.string(),
  src: z.string(),
  startTime: z.number(),
  duration: z.number(),
  role: z.enum(['voiceover', 'background_music', 'sfx']),
  volume: z.number().default(1.0),
  duckingVolume: z.number().optional(), // For background music ducking when voiceover is active
});

export const CaptionSegmentSchema = z.object({
  id: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  text: z.string(),
  style: z.enum(['standard', 'cinematic_bold', 'highlight']).default('standard'),
});

export const MediaPlanSchema = z.object({
  projectId: z.string(),
  title: z.string(),
  resolution: ResolutionSchema,
  durationSeconds: z.number(),
  tracks: z.object({
    visuals: z.array(VideoSegmentSchema),
    audio: z.array(AudioSegmentSchema),
    captions: z.array(CaptionSegmentSchema).default([]),
  }),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type Resolution = z.infer<typeof ResolutionSchema>;
export type VideoSegment = z.infer<typeof VideoSegmentSchema>;
export type AudioSegment = z.infer<typeof AudioSegmentSchema>;
export type CaptionSegment = z.infer<typeof CaptionSegmentSchema>;
export type MediaPlan = z.infer<typeof MediaPlanSchema>;
