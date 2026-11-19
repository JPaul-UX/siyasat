/**
 * A queue that keeps requests to one upstream service inside its rate limit: at most `concurrency` running
 * at once, and at least `minGapMs` between two starts. Both can be changed while it runs, and the whole
 * lane can be paused when the service says "slow down".
 */
export class Lane {
  private active = 0;
  private lastStart = 0;
  private pausedUntil = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private concurrency: number,
    private minGapMs = 0,
  ) {}

  /** How many callers are waiting for a turn. */
  get queued(): number {
    return this.waiting.length;
  }

  get limits(): { concurrency: number; minGapMs: number } {
    return { concurrency: this.concurrency, minGapMs: this.minGapMs };
  }

  /** Change the limits, for example to the ones the service has just advertised. */
  tune(concurrency: number, minGapMs: number): void {
    this.concurrency = Math.max(1, Math.floor(concurrency));
    this.minGapMs = Math.max(0, minGapMs);
    this.reschedule();
  }

  /** Start nothing new for a while. Requests already running are not affected. */
  pause(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
    this.reschedule();
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await new Promise<void>((start) => {
      this.waiting.push(start);
      this.pump();
    });
    try {
      return await task();
    } finally {
      this.active--;
      this.pump();
    }
  }

  private reschedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pump();
  }

  private pump(): void {
    if (this.timer) return;
    while (this.waiting.length && this.active < this.concurrency) {
      const wait = Math.max(this.lastStart + this.minGapMs, this.pausedUntil) - Date.now();
      if (wait > 0) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.pump();
        }, wait);
        return;
      }
      this.active++;
      this.lastStart = Date.now();
      this.waiting.shift()!();
    }
  }
}
