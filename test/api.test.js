import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('API - Health endpoint returns healthy status', async () => {
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'ok');
    assert.equal(json.service, 'animex-scraper');
    assert.ok(json.cache);
  } finally {
    server.close();
  }
});

test('API - Fast search returns results with X-Cache header', async () => {
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const res1 = await fetch(`${baseUrl}/api/search?q=dandadan&limit=3`);
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('x-cache'), 'MISS');

    const json1 = await res1.json();
    assert.equal(json1.success, true);
    assert.ok(Array.isArray(json1.data));
    assert.ok(json1.data.length > 0);

    // Second call should HIT the cache
    const res2 = await fetch(`${baseUrl}/api/search?q=dandadan&limit=3`);
    assert.equal(res2.status, 200);
    assert.equal(res2.headers.get('x-cache'), 'HIT');
  } finally {
    server.close();
  }
});

test('API - Recent endpoint returns newly released episodes', async () => {
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const res = await fetch(`${baseUrl}/api/recent?page=1`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data.items));
    assert.ok(json.data.items.length > 0);
  } finally {
    server.close();
  }
});

test('API - Anime details and episodes endpoints return valid data', async () => {
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Details endpoint
    const resDetail = await fetch(`${baseUrl}/api/anime/185660`);
    assert.equal(resDetail.status, 200);
    const jsonDetail = await resDetail.json();
    assert.equal(jsonDetail.success, true);
    assert.equal(jsonDetail.data.anilistId, 185660);
    assert.ok(jsonDetail.data.title.english || jsonDetail.data.title.romaji);

    // 2. Episodes endpoint
    const resEp = await fetch(`${baseUrl}/api/anime/dan-da-dan-season-2-od6gt/episodes`);
    assert.equal(resEp.status, 200);
    const jsonEp = await resEp.json();
    assert.equal(jsonEp.success, true);
    assert.ok(Array.isArray(jsonEp.data));
    assert.ok(jsonEp.data.length > 0);
    assert.equal(jsonEp.data[0].number, 1);

    // 3. Servers endpoint
    const resServers = await fetch(`${baseUrl}/api/anime/dan-da-dan-season-2-od6gt/servers?ep=1`);
    assert.equal(resServers.status, 200);
    const jsonServers = await resServers.json();
    assert.equal(jsonServers.success, true);
    assert.ok(Array.isArray(jsonServers.data.subProviders));
  } finally {
    server.close();
  }
});

test('API - Watch stream endpoint returns signed M3U8 and proxy URLs', async () => {
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    const res = await fetch(`${baseUrl}/api/watch/dan-da-dan-season-2-od6gt/1?provider=yuki&category=sub`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.data.streamUrl);
    assert.ok(json.data.proxyUrl);
    assert.ok(json.data.headers);
    assert.ok(Array.isArray(json.data.subtitles));
  } finally {
    server.close();
  }
});
