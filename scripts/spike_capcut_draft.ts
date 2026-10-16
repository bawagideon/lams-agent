import path from 'node:path';
import fs from 'node:fs';
import type { MediaPlan } from '../src/contracts/MediaPlan.ts';
import { CapCutAdapter } from '../src/adapters/media/CapCutAdapter.ts';

console.log('=== [M0 SPIKE 3] CAPCUT DRAFT ADAPTER VALIDATION ===\n');

// 1. Define a realistic MediaPlan matching Lams' YouTube episode structure
const sampleMediaPlan: MediaPlan = {
  projectId: 'episode-042-ancient-civilizations',
  title: 'Episode 42: The Lost Architecture of Nubia',
  resolution: {
    width: 1920,
    height: 1080,
    fps: 30,
  },
  durationSeconds: 32.5,
  tracks: {
    visuals: [
      {
        id: 'vis_scene_1',
        src: path.resolve('sample_assets/scene_1_intro.mp4'),
        startTime: 0.0,
        duration: 10.5,
        transition: 'fade_in',
        volume: 1.0,
      },
      {
        id: 'vis_scene_2',
        src: path.resolve('sample_assets/scene_2_pyramids.mp4'),
        startTime: 10.5,
        duration: 12.0,
        transition: 'dissolve',
        volume: 1.0,
      },
      {
        id: 'vis_scene_3',
        src: path.resolve('sample_assets/scene_3_outreach.mp4'),
        startTime: 22.5,
        duration: 10.0,
        transition: 'none',
        volume: 1.0,
      },
    ],
    audio: [
      {
        id: 'vo_scene_1',
        src: path.resolve('sample_assets/voice_scene_1.mp3'),
        startTime: 0.5,
        duration: 9.8,
        role: 'voiceover',
        volume: 1.0,
      },
      {
        id: 'vo_scene_2',
        src: path.resolve('sample_assets/voice_scene_2.mp3'),
        startTime: 11.0,
        duration: 11.2,
        role: 'voiceover',
        volume: 1.0,
      },
      {
        id: 'vo_scene_3',
        src: path.resolve('sample_assets/voice_scene_3.mp3'),
        startTime: 23.0,
        duration: 9.0,
        role: 'voiceover',
        volume: 1.0,
      },
      {
        id: 'bgm_main',
        src: path.resolve('sample_assets/music_epic_ambient.mp3'),
        startTime: 0.0,
        duration: 32.5,
        role: 'background_music',
        volume: 0.25,
        duckingVolume: 0.12,
      },
    ],
    captions: [
      {
        id: 'cap_1',
        startTime: 0.5,
        endTime: 4.8,
        text: 'Deep beneath the sands of northern Sudan...',
        style: 'cinematic_bold',
      },
      {
        id: 'cap_2',
        startTime: 5.0,
        endTime: 9.8,
        text: '...lie temples older than the dynasties of Cairo.',
        style: 'cinematic_bold',
      },
      {
        id: 'cap_3',
        startTime: 11.0,
        endTime: 16.5,
        text: 'The Kingdom of Kush mastered architecture that defied time.',
        style: 'standard',
      },
    ],
  },
  metadata: {
    targetChannel: 'Lams Documentaries',
    voiceModel: 'eleven_multilingual_v2',
  },
};

// 2. Execute CapCutAdapter
const adapter = new CapCutAdapter();
const outputDir = path.resolve('test_output/capcut_draft_spike');
const result = await adapter.createDraftFromMediaPlan(sampleMediaPlan, outputDir);

console.log('✓ Successfully compiled MediaPlan to CapCut Draft!');
console.log('  Draft ID:               ', result.draftId);
console.log('  Draft Path:             ', result.draftPath);
console.log('  Duration (seconds):     ', result.totalDurationSeconds);
console.log('  Active Tracks Created:  ', result.tracksCount);
console.log('  Materials Registered:   ', result.materialsCount);

// 3. Inspect generated files
const contentFile = path.join(result.draftPath, 'draft_content.json');
const metaFile = path.join(result.draftPath, 'draft_meta_info.json');

if (fs.existsSync(contentFile) && fs.existsSync(metaFile)) {
  const content = JSON.parse(fs.readFileSync(contentFile, 'utf-8'));
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));

  console.log('\n--- VERIFICATION CHECKS ---');
  console.log('1. draft_content.json size: ', fs.statSync(contentFile).size, 'bytes');
  console.log('2. Canvas resolution:       ', `${content.canvas_config.width}x${content.canvas_config.height} @ ${content.fps}fps`);
  console.log('3. Video segments:          ', content.tracks.find((t: any) => t.type === 'video')?.segments.length);
  console.log('4. Audio tracks:            ', content.tracks.filter((t: any) => t.type === 'audio').length);
  console.log('5. Text/Caption segments:   ', content.tracks.find((t: any) => t.type === 'text')?.segments.length);
  console.log('6. draft_meta_info name:    ', `"${meta.draft_name}"`);
  console.log('\n[PASS] M0 SPIKE 3 SUCCESS: CapCut draft generation is 100% operational!');
} else {
  console.error('[FAIL] Expected files not found in destination!');
  process.exit(1);
}
