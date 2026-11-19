interface Entry<V> {
  value: V;
  expires: number;
}

/**
 * A small in-memory cache with a time limit per entry and a cap on size (least recently used goes first).
 * `memo` also shares one in-flight lookup between callers asking for the same key at the same time.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly pending = new Map<string, Promise<V>>();

  constructor(private readonly maxEntries: number) {}

  get(key: string): V | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expires < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Re-insert so the entry counts as recently used.
    this.entries.delete(key);
    this.entries.set(key, e);
    return e.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: Date.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Return the cached value for `key`, or run `load` and cache what it returns for `ttlFor(value)`
   * milliseconds. A `ttlFor` of 0 means "don't cache this one" (for example, a lookup that failed softly).
   * Errors are never cached.
   */
  async memo(key: string, load: () => Promise<V>, ttlFor: (value: V) => number): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const running = this.pending.get(key);
    if (running) return running;
    const p = load()
      .then((value) => {
        const ttl = ttlFor(value);
        if (ttl > 0) this.set(key, value, ttl);
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }
}
