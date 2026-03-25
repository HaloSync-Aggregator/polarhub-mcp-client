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

  /** Extract available seats from the last seat_availability toolResult */
  getAvailableSeats(): string[] {
    const seats: string[] = [];
    // Search frames in reverse for seat_availability result
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i];
      if (f.direction !== 'received') continue;
      const data = f.data as Record<string, unknown>;
      if (data?.type !== 'assistant_message') continue;
      const tr = data.toolResult as Record<string, unknown> | undefined;
      if (!tr?.data) continue;
      const inner = tr.data as Record<string, unknown>;
      const seatMaps = inner.SeatMap as Array<Record<string, unknown>> | undefined;
      if (!seatMaps?.length) continue;

      for (const sm of seatMaps) {
        const cabins = sm.Cabins as Array<Record<string, unknown>> | undefined;
        if (!cabins) continue;
        for (const cabin of cabins) {
          const rows = cabin.RowInfo as Array<Record<string, unknown>> | undefined;
          if (!rows) continue;
          for (const row of rows) {
            const rowSeats = row.Seats as Array<Record<string, unknown>> | undefined;
            if (!rowSeats) continue;
            for (const seat of rowSeats) {
              if (seat.SeatStatus === 'A') {
                seats.push(`${row.Number}${seat.Column}`);
              }
            }
          }
        }
      }
      if (seats.length > 0) break;
    }
    return seats;
  }
}
