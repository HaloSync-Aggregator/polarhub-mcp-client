import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface WsFrame {
  direction: 'sent' | 'received';
  data: unknown;
  timestamp: string;
}

export class WsLogger {
  private frames: WsFrame[] = [];

  constructor(private page: Page) {
    this.attach();
  }

  private attach(): void {
    this.page.on('websocket', (ws) => {
      ws.on('framesent', (event) => {
        try {
          this.frames.push({
            direction: 'sent',
            data: JSON.parse(event.payload as string),
            timestamp: new Date().toISOString(),
          });
        } catch {
          this.frames.push({
            direction: 'sent',
            data: event.payload,
            timestamp: new Date().toISOString(),
          });
        }
      });

      ws.on('framereceived', (event) => {
        try {
          this.frames.push({
            direction: 'received',
            data: JSON.parse(event.payload as string),
            timestamp: new Date().toISOString(),
          });
        } catch {
          this.frames.push({
            direction: 'received',
            data: event.payload,
            timestamp: new Date().toISOString(),
          });
        }
      });
    });
  }

  /** Save captured WebSocket frames to JSON file */
  saveLog(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const log = {
      totalFrames: this.frames.length,
      sent: this.frames.filter(f => f.direction === 'sent').length,
      received: this.frames.filter(f => f.direction === 'received').length,
      timestamp: new Date().toISOString(),
      frames: this.frames,
    };

    fs.writeFileSync(filePath, JSON.stringify(log, null, 2));
  }

  /** Get all captured frames */
  getFrames(): WsFrame[] {
    return [...this.frames];
  }

  /** Clear captured frames */
  clear(): void {
    this.frames = [];
  }
}
