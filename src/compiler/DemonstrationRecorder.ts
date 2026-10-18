import fs from 'node:fs';
import path from 'node:path';

export interface ObservedEvent {
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
  screenshotRef?: string;
}

export interface RecorderStatus {
  isRecording: boolean;
  sessionName: string;
  totalEvents: number;
  startedAt?: number;
  elapsedSeconds?: number;
}

export class DemonstrationRecorder {
  private events: ObservedEvent[] = [];
  private isRecording = false;
  private sessionName = '';
  private startedAt = 0;
  private recordingsDir = path.resolve('data', 'recordings');

  constructor() {
    try {
      if (!fs.existsSync(this.recordingsDir)) {
        fs.mkdirSync(this.recordingsDir, { recursive: true });
      }
    } catch {}
  }

  public startRecording(sessionName: string): void {
    this.sessionName = sessionName || 'Untitled Session';
    this.events = [];
    this.isRecording = true;
    this.startedAt = Date.now();
    console.log(`[DemonstrationRecorder] Started recording session: "${this.sessionName}"`);
  }

  public recordEvent(event: Omit<ObservedEvent, 'timestamp'> & { timestamp?: number }): void {
    if (!this.isRecording) return;
    this.events.push({
      ...event,
      timestamp: event.timestamp || Date.now(),
    });
  }

  public stopRecording(): { sessionName: string; totalEvents: number; events: ObservedEvent[]; savedFilePath?: string } {
    this.isRecording = false;
    const durationSec = Math.round((Date.now() - this.startedAt) / 1000);
    console.log(`[DemonstrationRecorder] Stopped session "${this.sessionName}". Captured ${this.events.length} events in ${durationSec}s.`);
    
    let savedFilePath: string | undefined;
    try {
      const safeName = (this.sessionName || 'session').toLowerCase().replace(/[^a-z0-9]/g, '_');
      savedFilePath = path.join(this.recordingsDir, `${safeName}_${Date.now()}.json`);
      fs.writeFileSync(savedFilePath, JSON.stringify({
        sessionName: this.sessionName,
        startedAt: this.startedAt,
        stoppedAt: Date.now(),
        durationSeconds: durationSec,
        totalEvents: this.events.length,
        events: this.events,
      }, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn(`[DemonstrationRecorder] Could not persist session file: ${err.message}`);
    }

    return {
      sessionName: this.sessionName,
      totalEvents: this.events.length,
      events: [...this.events],
      savedFilePath,
    };
  }

  public getStatus(): RecorderStatus {
    const elapsedSeconds = this.isRecording ? Math.round((Date.now() - this.startedAt) / 1000) : 0;
    return {
      isRecording: this.isRecording,
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
    this.startedAt = 0;
  }
}
