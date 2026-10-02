import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMasterM3u8, normalizeAnime, normalizeEpisodes } from '../src/parsers.js';

test('parseMasterM3u8 - extracts quality variants from playlist', () => {
  const m3u8 = `#EXTM3U
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=2148643,RESOLUTION=1920x1080,FRAME-RATE=25.000,CODECS="avc1.640032,mp4a.40.2"
index-f1-v1-a1.m3u8
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=1028476,RESOLUTION=1280x720,FRAME-RATE=25.000,CODECS="avc1.64001f,mp4a.40.2"
index-f2-v1-a1.m3u8
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=628476,RESOLUTION=854x480,FRAME-RATE=25.000
index-f3-v1-a1.m3u8`;

  const masterUrl = 'https://stream.server.com/anime/123/master.m3u8?token=xyz';
  const variants = parseMasterM3u8(m3u8, masterUrl);

  assert.equal(variants.length, 3);
  assert.equal(variants[0].quality, '1080p');
  assert.equal(variants[0].resolution, '1920x1080');
  assert.equal(variants[0].bandwidth, 2148643);
  assert.ok(variants[0].url.includes('index-f1-v1-a1.m3u8'));
  assert.ok(variants[0].url.includes('token=xyz'));

  assert.equal(variants[1].quality, '720p');
  assert.equal(variants[2].quality, '480p');
});

test('normalizeAnime - formats anime details into clean model', () => {
  const raw = {
    id: 'dan-da-dan-season-2-od6gt',
    anilistId: 185660,
    titleEnglish: 'DAN DA DAN Season 2',
    titleRomaji: 'Dandadan 2nd Season',
    coverImage: {
      large: 'https://img.com/large.jpg'
    },
    episodeCount: 12,
    status: 'FINISHED'
  };

  const normalized = normalizeAnime(raw);
  assert.equal(normalized.slug, 'dan-da-dan-season-2-od6gt');
  assert.equal(normalized.anilistId, 185660);
  assert.equal(normalized.title.english, 'DAN DA DAN Season 2');
  assert.equal(normalized.episodeCount, 12);
  assert.equal(normalized.status, 'FINISHED');
});

test('normalizeEpisodes - maps episode listings properly', () => {
  const raw = [
    {
      number: 1,
      titles: { en: 'Episode One' },
      img: 'https://img.com/ep1.jpg',
      length: 24,
      isFiller: false
    }
  ];

  const normalized = normalizeEpisodes(raw);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].number, 1);
  assert.equal(normalized[0].title, 'Episode One');
  assert.equal(normalized[0].durationMinutes, 24);
});
