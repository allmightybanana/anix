/**
 * High-performance in-memory TTL Cache with Request Coalescing.
 * Prevents thundering herds by deduplicating concurrent in-flight requests for identical keys.
 */
export class MemoryCache {
  /**
   * @param {Object} options
   * @param {number} [options.defaultTtlMs=300000] Default TTL (5 minutes)
   * @param {number} [options.maxSize=1000] Max number of items before eviction
   */
  constructor({ defaultTtlMs = 300000, maxSize = 1000 } = {}) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxSize = maxSize;
    this.store = new Map();
    this.inFlight = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      coalesced: 0
    };
  }

  /**
   * Get an entry if it exists and hasn't expired.
   * @param {string} key
   * @returns {any | undefined}
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      return undefined;
    }

    this.stats.hits++;
    // Refresh position for LRU
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /**
   * Set a cached value with optional TTL.
   * @param {string} key
   * @param {any} value
   * @param {number} [ttlMs]
   */
  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this.store.size >= this.maxSize) {
      // Evict oldest (first key in map)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now()
    });
  }

  /**
   * Delete a key.
   * @param {string} key
   */
  delete(key) {
    this.store.delete(key);
  }

  /**
   * Clear the entire cache.
   */
  clear() {
    this.store.clear();
    this.inFlight.clear();
  }

  /**
   * Wraps an async fetch operation with caching and request coalescing.
   * @param {string} key Cache key
   * @param {() => Promise<any>} fetcher Async loader function
   * @param {number} [ttlMs] Custom TTL
   * @returns {Promise<{ data: any, source: 'HIT' | 'MISS' | 'COALESCED' }>}
   */
  async getOrFetch(key, fetcher, ttlMs = this.defaultTtlMs) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return { data: cached, source: 'HIT' };
    }

    if (this.inFlight.has(key)) {
      this.stats.coalesced++;
      const data = await this.inFlight.get(key);
      return { data, source: 'COALESCED' };
    }

    const promise = (async () => {
      try {
        const result = await fetcher();
        if (result !== undefined && result !== null) {
          this.set(key, result, ttlMs);
        }
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    const data = await promise;
    return { data, source: 'MISS' };
  }

  /**
   * Returns current cache telemetry.
   */
  getStats() {
    return {
      size: this.store.size,
      inFlightCount: this.inFlight.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      coalesced: this.stats.coalesced,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1) + '%'
        : '0%'
    };
  }
}

export const defaultCache = new MemoryCache();
