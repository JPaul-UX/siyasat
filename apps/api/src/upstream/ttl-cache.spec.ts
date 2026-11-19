import { TtlCache } from './ttl-cache.js';

describe('TtlCache', () => {
  afterEach(() => vi.useRealTimers());

  it('forgets an entry when its time is up', () => {
    vi.useFakeTimers();
    const cache = new TtlCache<string>(10);
    cache.set('a', 'x', 1000);
    vi.advanceTimersByTime(999);
    expect(cache.get('a')).toBe('x');
    vi.advanceTimersByTime(2);
    expect(cache.get('a')).toBeUndefined();
  });

  it('drops the least recently used entry when full', () => {
    const cache = new TtlCache<number>(2);
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);
    cache.get('a');
    cache.set('c', 3, 60_000);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });

  it('shares one lookup between callers asking at the same time', async () => {
    const cache = new TtlCache<number>(10);
    const load = vi.fn(async () => 7);
    const [a, b] = await Promise.all([cache.memo('k', load, () => 60_000), cache.memo('k', load, () => 60_000)]);
    expect([a, b]).toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
    await cache.memo('k', load, () => 60_000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('caches a null answer but not a failure, and honours "do not cache"', async () => {
    const cache = new TtlCache<string | null>(10);
    const missing = vi.fn(async () => null);
    await cache.memo('none', missing, () => 60_000);
    await cache.memo('none', missing, () => 60_000);
    expect(missing).toHaveBeenCalledTimes(1);

    const failing = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('up');
    await expect(cache.memo('flaky', failing, () => 60_000)).rejects.toThrow('down');
    await expect(cache.memo('flaky', failing, () => 60_000)).resolves.toBe('up');

    const soft = vi.fn(async () => 'unavailable');
    await cache.memo('soft', soft, () => 0);
    await cache.memo('soft', soft, () => 0);
    expect(soft).toHaveBeenCalledTimes(2);
  });
});
