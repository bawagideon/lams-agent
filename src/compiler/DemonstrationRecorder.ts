import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface ObservedEvent {
  id?: string;
  timestamp: number;
  application: string;
  windowTitle: string;
  eventType: 'click' | 'keyboard' | 'navigate' | 'file_select' | 'shortcut' | 'assertion';
  targetElement?: {
    tag?: string;
    text?: string;
    role?: string;
    selector?: string;
  };
  inputData?: string | number | boolean;
  provenance?: 'observed' | 'manual_studio' | 'synthetic_template';
  redacted?: boolean;
  screenshotRef?: string;
}

export interface DemonstrationEvent extends ObservedEvent {
  id: string;
  provenance: 'observed' | 'manual_studio' | 'synthetic_template';
}

export interface DemonstrationManifest {
  manifestVersion: '1.0';
  checksum: string;
  eventCount: number;
  durationSeconds: number;
  videoChecksum?: string;
  compiledSkillId?: string;
  compiledSkillVersion?: string;
}

export interface DemonstrationRecord {
  demonstrationId: string;
  sessionName: string;
  targetApplication: string;
  startedAt: number;
  stoppedAt: number;
  durationSeconds: number;
  events: DemonstrationEvent[];
  video?: {
    fileName: string;
    filePath: string;
    sizeBytes: number;
    sizeMb: number;
    sha256?: string;
  };
  manifest: DemonstrationManifest;
  status: 'recorded' | 'reviewed' | 'compiled' | 'verified_production';
  compiledSkillId?: string;
  compiledSkillVersion?: string;
  totalEvents?: number;
  savedFilePath?: string;
}

export interface RecorderStatus {
  isRecording: boolean;
  demonstrationId?: string;
  sessionName: string;
  totalEvents: number;
  startedAt?: number;
  elapsedSeconds?: number;
}

export class DemonstrationRecorder {
  private events: DemonstrationEvent[] = [];
  private isRecording = false;
  private currentDemonstrationId = '';
  private sessionName = '';
  private targetApplication = 'General Desktop';
  private startedAt = 0;
  private demonstrationsDir = path.resolve('data', 'demonstrations');
  private legacyRecordingsDir = path.resolve('data', 'recordings');

  constructor() {
    try {
      if (!fs.existsSync(this.demonstrationsDir)) {
        fs.mkdirSync(this.demonstrationsDir, { recursive: true });
      }
      if (!fs.existsSync(this.legacyRecordingsDir)) {
        fs.mkdirSync(this.legacyRecordingsDir, { recursive: true });
      }
    } catch {}
  }

  public startRecording(sessionName: string, targetApplication = 'General Desktop'): string {
    this.currentDemonstrationId = `demo_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    this.sessionName = sessionName || 'Untitled Demonstration';
    this.targetApplication = targetApplication;
    this.events = [];
    this.isRecording = true;
    this.startedAt = Date.now();
    console.log(`[DemonstrationRecorder] Started demonstration: "${this.sessionName}" (${this.currentDemonstrationId})`);
    return this.currentDemonstrationId;
  }

  public recordEvent(event: Omit<ObservedEvent, 'timestamp'> & { timestamp?: number }): DemonstrationEvent {
    const ev: DemonstrationEvent = {
      ...event,
      id: event.id || `ev_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: event.timestamp || Date.now(),
      application: event.application || this.targetApplication,
      windowTitle: event.windowTitle || `${this.targetApplication} Window`,
      provenance: event.provenance || 'observed',
      redacted: Boolean(event.redacted),
    };

    if (this.isRecording) {
      this.events.push(ev);
    }
    return ev;
  }

  public computeEventChecksum(events: DemonstrationEvent[]): string {
    const canonical = JSON.stringify(events.map(e => ({
      id: e.id,
      timestamp: e.timestamp,
      eventType: e.eventType,
      application: e.application,
      targetElement: e.targetElement,
      inputData: e.inputData,
      provenance: e.provenance,
      redacted: e.redacted,
    })));
    return crypto.createHash('sha256').update(canonical, 'utf-8').digest('hex');
  }

  public stopRecording(videoInfo?: { fileName: string; filePath: string; sizeBytes: number; sizeMb: number }): DemonstrationRecord {
    this.isRecording = false;
    const stoppedAt = Date.now();
    const durationSeconds = Math.max(1, Math.round((stoppedAt - this.startedAt) / 1000));
    const demonstrationId = this.currentDemonstrationId || `demo_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Compute video SHA-256 checksum if file is accessible
    let videoMeta: DemonstrationRecord['video'] | undefined;
    if (videoInfo) {
      let videoSha256: string | undefined;
      try {
        if (fs.existsSync(videoInfo.filePath)) {
          const buf = fs.readFileSync(videoInfo.filePath);
          videoSha256 = crypto.createHash('sha256').update(buf).digest('hex');
        }
      } catch {}

      videoMeta = {
        ...videoInfo,
        sha256: videoSha256,
      };
    }

    const eventChecksum = this.computeEventChecksum(this.events);
    const manifest: DemonstrationManifest = {
      manifestVersion: '1.0',
      checksum: eventChecksum,
      eventCount: this.events.length,
      durationSeconds,
      videoChecksum: videoMeta?.sha256,
    };

    const destFile = path.join(this.demonstrationsDir, `${demonstrationId}.json`);
    const record: DemonstrationRecord = {
      demonstrationId,
      sessionName: this.sessionName || 'Recorded Demonstration',
      targetApplication: this.targetApplication,
      startedAt: this.startedAt,
      stoppedAt,
      durationSeconds,
      events: [...this.events],
      video: videoMeta,
      manifest,
      status: 'recorded',
      totalEvents: this.events.length,
      savedFilePath: destFile,
    };

    this.saveDemonstration(record);

    console.log(`[DemonstrationRecorder] Finalized DemonstrationRecord "${record.sessionName}" (${record.demonstrationId}) with ${record.events.length} steps.`);
    return record;
  }

  public saveDemonstration(record: DemonstrationRecord): void {
    try {
      const destFile = path.join(this.demonstrationsDir, `${record.demonstrationId}.json`);
      const tmpFile = path.join(this.demonstrationsDir, `${record.demonstrationId}.${crypto.randomUUID()}.tmp`);
      fs.writeFileSync(tmpFile, JSON.stringify(record, null, 2), 'utf-8');
      fs.renameSync(tmpFile, destFile);

      // Legacy fallback mirror for older tests
      const safeName = record.sessionName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const legacyFile = path.join(this.legacyRecordingsDir, `${safeName}_${record.startedAt}.json`);
      fs.writeFileSync(legacyFile, JSON.stringify({
        sessionName: record.sessionName,
        startedAt: record.startedAt,
        stoppedAt: record.stoppedAt,
        durationSeconds: record.durationSeconds,
        totalEvents: record.events.length,
        events: record.events,
      }, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn(`[DemonstrationRecorder] Failed to persist demonstration record: ${err.message}`);
    }
  }

  public getDemonstration(demonstrationId: string): DemonstrationRecord | null {
    try {
      const filePath = path.join(this.demonstrationsDir, `${demonstrationId}.json`);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {}
    return null;
  }

  public listDemonstrations(): DemonstrationRecord[] {
    const list: DemonstrationRecord[] = [];
    try {
      if (fs.existsSync(this.demonstrationsDir)) {
        const files = fs.readdirSync(this.demonstrationsDir).filter(f => f.endsWith('.json'));
        for (const f of files) {
          try {
            const raw = fs.readFileSync(path.join(this.demonstrationsDir, f), 'utf-8');
            list.push(JSON.parse(raw));
          } catch {}
        }
      }
    } catch {}
    return list.sort((a, b) => b.startedAt - a.startedAt);
  }

  public reviewAndRedactEvent(
    demonstrationId: string,
    eventId: string,
    updates: { text?: string; selector?: string; inputData?: string | number | boolean; redacted?: boolean }
  ): DemonstrationRecord {
    const record = this.getDemonstration(demonstrationId);
    if (!record) throw new Error(`Demonstration ${demonstrationId} not found.`);

    const targetEvent = record.events.find(e => e.id === eventId);
    if (!targetEvent) throw new Error(`Event ${eventId} not found in demonstration.`);

    if (updates.text !== undefined && targetEvent.targetElement) targetEvent.targetElement.text = updates.text;
    if (updates.selector !== undefined && targetEvent.targetElement) targetEvent.targetElement.selector = updates.selector;
    if (updates.inputData !== undefined) targetEvent.inputData = updates.inputData;
    if (updates.redacted !== undefined) {
      targetEvent.redacted = updates.redacted;
      if (updates.redacted) targetEvent.inputData = '[REDACTED_SECRET]';
    }

    record.manifest.checksum = this.computeEventChecksum(record.events);
    record.status = 'reviewed';
    this.saveDemonstration(record);
    return record;
  }

  public getStatus(): RecorderStatus {
    const elapsedSeconds = this.isRecording ? Math.round((Date.now() - this.startedAt) / 1000) : 0;
    return {
      isRecording: this.isRecording,
      demonstrationId: this.currentDemonstrationId || undefined,
      sessionName: this.sessionName,
      totalEvents: this.events.length,
      startedAt: this.startedAt || undefined,
      elapsedSeconds,
    };
  }

  public getLiveEvents(): ObservedEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events = [];
    this.isRecording = false;
    this.sessionName = '';
    this.currentDemonstrationId = '';
    this.startedAt = 0;
  }
}
