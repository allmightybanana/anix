import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryCache } from '../src/cache.js';

test('MemoryCache - sets and gets value with TTL', async () => {
  const cache = new MemoryCache({ defaultTtlMs: 50 });
  cache.set('key1', 'val1');

  assert.equal(cache.get('key1'), 'val1');

  // Wait for expiry
  await new Promise(r => setTimeout(r, 60));
  assert.equal(cache.get('key1'), undefined);
});

test('MemoryCache - request coalescing deduplicates concurrent fetches', async () => {
  const cache = new MemoryCache();
  let calls = 0;

  const slowFetcher = async () => {
    calls++;
    await new Promise(r => setTimeout(r, 50));
    return 'result';
  };

  // Launch 3 requests concurrently
  const [res1, res2, res3] = await Promise.all([
    cache.getOrFetch('same-key', slowFetcher),
    cache.getOrFetch('same-key', slowFetcher),
    cache.getOrFetch('same-key', slowFetcher)
  ]);

  assert.equal(calls, 1, 'Fetcher should be invoked exactly once');
  assert.equal(res1.data, 'result');
  assert.equal(res2.data, 'result');
  assert.equal(res3.data, 'result');

  assert.equal(res1.source, 'MISS');
  assert.equal(res2.source, 'COALESCED');
  assert.equal(res3.source, 'COALESCED');

  // Next call should be cache HIT
  const res4 = await cache.getOrFetch('same-key', slowFetcher);
  assert.equal(res4.source, 'HIT');
  assert.equal(calls, 1);
});
