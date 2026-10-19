import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { SkillContract } from '../contracts/SkillContract.ts';

export class SkillRegistry {
  private skills: Map<string, SkillContract> = new Map();
  private customSkillsFilePath = path.resolve('data', 'custom_skills.json');

  constructor() {
    this.registerDefaultSkills();
    this.reloadCustomSkills(true);
  }

  public registerSkill(skill: SkillContract, persist = false): void {
    const key = `${skill.id}@${skill.version}`;
    this.skills.set(key, skill);
    // Also save latest by id
    this.skills.set(skill.id, skill);

    if (persist) {
      this.loadedCustomSkillKeys.add(key);
      this.loadedCustomSkillKeys.add(skill.id);
      this.saveCustomSkill(skill);
    }
  }

  private lastCustomSkillsMtimeMs = 0;
  private lastCustomSkillsHash = '';
  private loadedCustomSkillKeys: Set<string> = new Set();

  /**
   * Authoritative reload method for custom skills.
   * Handles file existence, file deletion, invalid JSON, and duplicate IDs safely.
   */
  public reloadCustomSkills(force = false): void {
    try {
      if (!fs.existsSync(this.customSkillsFilePath)) {
        if (this.loadedCustomSkillKeys.size > 0 || force) {
          for (const k of this.loadedCustomSkillKeys) {
            this.skills.delete(k);
          }
          this.loadedCustomSkillKeys.clear();
          this.lastCustomSkillsHash = '';
          this.lastCustomSkillsMtimeMs = 0;
        }
        return;
      }

      const raw = fs.readFileSync(this.customSkillsFilePath, 'utf-8');
      const hash = crypto.createHash('sha256').update(raw).digest('hex');

      if (force || hash !== this.lastCustomSkillsHash) {
        this.applyCustomSkillsContent(raw, hash);
      }
    } catch (e: any) {
      console.warn('[SkillRegistry] Error reloading custom skills:', e.message);
    }
  }

  private applyCustomSkillsContent(raw: string, hash: string): void {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error('Custom skills JSON must be an array of SkillContract objects.');
      }
      const list: SkillContract[] = parsed;
      const newKeys = new Set<string>();

      // Purge stale custom skill keys that are no longer in the file
      for (const oldKey of this.loadedCustomSkillKeys) {
        this.skills.delete(oldKey);
      }
      this.loadedCustomSkillKeys.clear();

      for (const s of list) {
        if (!s || !s.id || !s.version) continue;
        const keyVer = `${s.id}@${s.version}`;
        this.skills.set(keyVer, s);
        this.skills.set(s.id, s);
        newKeys.add(keyVer);
        newKeys.add(s.id);
      }

      this.loadedCustomSkillKeys = newKeys;
      this.lastCustomSkillsHash = hash;
      if (fs.existsSync(this.customSkillsFilePath)) {
        this.lastCustomSkillsMtimeMs = fs.statSync(this.customSkillsFilePath).mtimeMs;
      }
    } catch (e: any) {
      console.warn('[SkillRegistry] Could not parse custom skills:', e.message);
    }
  }

  private saveCustomSkill(skill: SkillContract): void {
    try {
      const dir = path.dirname(this.customSkillsFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let existing: SkillContract[] = [];
      if (fs.existsSync(this.customSkillsFilePath)) {
        try {
          const raw = fs.readFileSync(this.customSkillsFilePath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) existing = parsed;
        } catch {}
      }
      existing = existing.filter(s => s && s.id !== skill.id);
      existing.push(skill);
      const serialized = JSON.stringify(existing, null, 2);
      const tempPath = `${this.customSkillsFilePath}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tempPath, serialized, 'utf-8');
      try {
        fs.renameSync(tempPath, this.customSkillsFilePath);
      } catch {
        fs.copyFileSync(tempPath, this.customSkillsFilePath);
        try { fs.unlinkSync(tempPath); } catch {}
      }
      this.lastCustomSkillsHash = crypto.createHash('sha256').update(serialized).digest('hex');
      if (fs.existsSync(this.customSkillsFilePath)) {
        this.lastCustomSkillsMtimeMs = fs.statSync(this.customSkillsFilePath).mtimeMs;
      }
    } catch (e: any) {
      console.warn('[SkillRegistry] Could not save custom skill:', e.message);
    }
  }

  public getSkill(idOrKey: string, options?: { forceFresh?: boolean }): SkillContract | undefined {
    this.reloadCustomSkills(!!options?.forceFresh);
    return this.skills.get(idOrKey);
  }

  public listSkills(): SkillContract[] {
    this.reloadCustomSkills(false);
    const seen = new Set<string>();
    const list: SkillContract[] = [];
    for (const [key, skill] of this.skills.entries()) {
      if (!seen.has(skill.id)) {
        seen.add(skill.id);
        list.push(skill);
      }
    }
    return list;
  }

  private registerDefaultSkills(): void {
    // 1. YouTube Production Skill
    this.registerSkill({
      schemaVersion: '1.0',
      id: 'youtube_production',
      name: 'Full YouTube Production',
      version: '1.0.0',
      description: 'End-to-end pipeline: from approved topic to research, script, voiceover, visual generation and scene blueprint.',
      executionMode: 'deterministic_api',
      isSample: false,
      status: 'verified_production',
      inputs: {
        topic: { type: 'string', description: 'Core subject or episode theme', required: true },
        targetDurationMinutes: { type: 'number', description: 'Target duration in minutes', required: false },
      },
      preconditions: ['gemini_api_ready', 'elevenlabs_quota_available'],
      approvalGate: {
        required: true,
        level: '2_approval_gate',
        prompt: 'Review generated script and visual prompts before spending render credits.',
      },
      actions: [
        { step: 1, name: 'Topic Research', action: 'scout.research_topic', parameters: {} },
        { step: 2, name: 'Narrative Scripting', action: 'writer.generate_script', parameters: {} },
        { step: 3, name: 'Voiceover Synthesis', action: 'studio.generate_voice', parameters: {} },
        { step: 4, name: 'Visual Animation', action: 'studio.generate_visuals', parameters: {} },
      ],
      verification: {
        postconditions: ['all_scenes_have_audio', 'all_scenes_have_visuals'],
        proofRequired: true,
      },
      failureRecovery: { maxRetries: 2, alertLevel: 'high' },
    });

    // 2. CapCut Assembly Skill
    this.registerSkill({
      schemaVersion: '1.0',
      id: 'capcut_assembly',
      name: 'CapCut Timeline Assembly',
      version: '1.2.0',
      description: 'Translates generated media plan into a native CapCut desktop project draft with multi-track layout, transitions, and audio ducking.',
      executionMode: 'file_draft',
      isSample: false,
      status: 'verified_production',
      inputs: {
        mediaPlanPath: { type: 'string', description: 'Path to media_plan.json', required: true },
      },
      preconditions: ['media_plan_valid', 'media_assets_exist'],
      approvalGate: {
        required: false,
        level: '0_autonomous',
      },
      actions: [
        { step: 1, name: 'Validate Media Assets', action: 'editor.verify_assets', parameters: {} },
        { step: 2, name: 'Compile Track Segments', action: 'editor.compile_timeline', parameters: {} },
        { step: 3, name: 'Inject CapCut Draft Files', action: 'editor.write_capcut_draft', parameters: {} },
      ],
      verification: {
        postconditions: ['draft_content_json_exists', 'draft_meta_info_exists', 'timeline_duration_matches'],
        proofRequired: true,
      },
      failureRecovery: { maxRetries: 1, alertLevel: 'medium' },
    });

    // 3. YouTube Publishing & Scheduling Skill
    this.registerSkill({
      schemaVersion: '1.0',
      id: 'youtube_publish',
      name: 'Official YouTube Publishing',
      version: '2.0.0',
      description: 'Uploads master video via YouTube Data API v3, sets metadata, applies thumbnail, schedules release, and verifies channel status.',
      executionMode: 'deterministic_api',
      isSample: false,
      status: 'verified_production',
      inputs: {
        videoPath: { type: 'string', description: 'Master MP4 file path', required: true },
        title: { type: 'string', description: 'YouTube video title', required: true },
        description: { type: 'string', description: 'YouTube description and chapters', required: true },
        publishAt: { type: 'string', description: 'ISO scheduled timestamp', required: false },
        thumbnailPath: { type: 'string', description: 'Thumbnail image path', required: false },
      },
      preconditions: ['youtube_auth_valid', 'video_file_readable'],
      approvalGate: {
        required: true,
        level: '2_approval_gate',
        prompt: 'Review video preview, title, thumbnail, and scheduled time before publishing to YouTube.',
      },
      actions: [
        { step: 1, name: 'Validate Master Video Asset', action: 'media.validate', parameters: {} },
        { step: 2, name: 'Resumable Private Video Upload', action: 'publisher.upload_video', parameters: {} },
        { step: 3, name: 'Confirm Metadata & Visibility', action: 'publisher.set_metadata', parameters: {} },
      ],
      verification: {
        postconditions: ['video_id_returned'],
        proofRequired: true,
      },
      failureRecovery: { maxRetries: 2, alertLevel: 'critical' },
    });

    // 4. Shorts Repurposing Skill
    this.registerSkill({
      schemaVersion: '1.0',
      id: 'shorts_repurpose',
      name: 'Vertical Shorts Repurposing',
      version: '1.0.0',
      description: 'Extracts the most engaging 30-second scene hook and formats it into a 9:16 vertical short with auto-centered captions.',
      executionMode: 'deterministic_api',
      isSample: false,
      status: 'verified_production',
      inputs: {
        episodeId: { type: 'string', description: 'Source episode ID', required: true },
      },
      preconditions: ['master_video_exists'],
      approvalGate: {
        required: true,
        level: '1_notify',
        prompt: 'Short preview prepared for TikTok & YouTube Shorts.',
      },
      actions: [
        { step: 1, name: 'Detect Climax Hook', action: 'editor.detect_hook', parameters: {} },
        { step: 2, name: 'Crop to 9:16 Ratio', action: 'editor.crop_vertical', parameters: {} },
        { step: 3, name: 'Generate Animated Subtitles', action: 'editor.burn_shorts_captions', parameters: {} },
      ],
      verification: {
        postconditions: ['vertical_aspect_ratio_verified', 'duration_under_60s'],
        proofRequired: true,
      },
      failureRecovery: { maxRetries: 1, alertLevel: 'low' },
    });
  }
}
