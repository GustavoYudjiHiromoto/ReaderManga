export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxEntries: number;
  private defaultTtlMs: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxEntries: number = 1000, defaultTtlSeconds: number = 300) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlSeconds * 1000;
  }

  public get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    // Refresh position for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlSeconds?: number): void {
    const ttlMs = ttlSeconds !== undefined ? ttlSeconds * 1000 : this.defaultTtlMs;
    const expiresAt = Date.now() + ttlMs;

    // Evict oldest if reaching capacity
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { value, expiresAt });
  }

  public has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  public getStats(): { size: number; maxEntries: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Number((this.hits / total).toFixed(3)) : 0
    };
  }
}

export const globalCache = new CacheService(1000, 300);
