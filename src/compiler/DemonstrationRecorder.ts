export interface ObservedEvent {
  timestamp: number;
  application: string;
  windowTitle: string;
  eventType: 'click' | 'keyboard' | 'navigate' | 'file_select' | 'shortcut';
  targetElement?: {
    tag?: string;
    text?: string;
    role?: string;
    selector?: string;
  };
  inputData?: string | number | boolean;
  screenshotRef?: string;
}

export class DemonstrationRecorder {
  private events: ObservedEvent[] = [];
  private isRecording = false;
  private sessionName = '';

  public startRecording(sessionName: string): void {
    this.sessionName = sessionName;
    this.events = [];
    this.isRecording = true;
    console.log(`[DemonstrationRecorder] Started recording session: "${sessionName}"`);
  }

  public recordEvent(event: Omit<ObservedEvent, 'timestamp'>): void {
    if (!this.isRecording) return;
    this.events.push({
      ...event,
      timestamp: Date.now(),
    });
  }

  public stopRecording(): { sessionName: string; totalEvents: number; events: ObservedEvent[] } {
    this.isRecording = false;
    console.log(`[DemonstrationRecorder] Stopped session "${this.sessionName}". Captured ${this.events.length} events.`);
    return {
      sessionName: this.sessionName,
      totalEvents: this.events.length,
      events: [...this.events],
    };
  }

  public getLiveEvents(): ObservedEvent[] {
    return [...this.events];
  }
}
