import { Lane } from './lane.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Lane', () => {
  it('never runs more tasks at once than its limit', async () => {
    const lane = new Lane(2);
    let running = 0;
    let peak = 0;
    const task = async () => {
      peak = Math.max(peak, ++running);
      await sleep(15);
      running--;
    };
    await Promise.all(Array.from({ length: 7 }, () => lane.run(task)));
    expect(peak).toBe(2);
  });

  it('leaves the minimum gap between two starts', async () => {
    const lane = new Lane(5, 40);
    const starts: number[] = [];
    await Promise.all(Array.from({ length: 4 }, () => lane.run(async () => void starts.push(Date.now()))));
    const gaps = starts.slice(1).map((t, i) => t - starts[i]!);
    // Timers may fire a millisecond or two early.
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(35);
  });

  it('can be paused, and picks up new limits while requests are waiting', async () => {
    const lane = new Lane(1, 0);
    const began = Date.now();
    lane.pause(60);
    const starts: number[] = [];
    const work = Promise.all(Array.from({ length: 3 }, () => lane.run(async () => void starts.push(Date.now() - began))));
    lane.tune(1, 30);
    await work;
    expect(starts[0]).toBeGreaterThanOrEqual(55);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(25);
    expect(lane.limits).toEqual({ concurrency: 1, minGapMs: 30 });
  });

  it('frees its slot when a task fails', async () => {
    const lane = new Lane(1);
    await expect(lane.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(lane.run(async () => 'next')).resolves.toBe('next');
  });
});
