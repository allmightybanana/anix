import { Router } from 'express';
import { defaultClient } from '../client.js';
import { defaultCache } from '../cache.js';

export const animeRouter = Router();

/**
 * Success helper.
 */
function sendSuccess(res, data, cacheSource = 'MISS') {
  res.setHeader('X-Cache', cacheSource);
  return res.json({
    success: true,
    data
  });
}

/**
 * Error helper.
 */
function sendError(res, statusCode, code, message) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message
    }
  });
}

/**
 * GET /api/recent
 * Returns recently updated and newly aired anime episodes.
 */
animeRouter.get('/recent', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const cacheKey = `recent:${page}`;

  try {
    const { data, source } = await defaultCache.getOrFetch(
      cacheKey,
      () => defaultClient.getRecent(page),
      180000 // 3 min TTL for recent releases
    );
    return sendSuccess(res, data, source);
  } catch (err) {
    return sendError(res, 500, 'RECENT_FETCH_ERROR', err.message);
  }
});

/**
 * GET /api/search
 * Fast search by query string.
 */
animeRouter.get('/search', async (req, res) => {
  const query = req.query.q || req.query.query;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return sendError(res, 400, 'INVALID_QUERY', 'Query parameter "q" is required');
  }

  const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 50));
  const includeAdult = req.query.adult === 'true' || req.query.includeAdult === 'true';
  const cacheKey = `search:${query.trim().toLowerCase()}:${limit}:${includeAdult}`;

  try {
    const { data, source } = await defaultCache.getOrFetch(
      cacheKey,
      () => defaultClient.search(query, { limit, includeAdult }),
      300000 // 5 min TTL
    );
    return sendSuccess(res, data, source);
  } catch (err) {
    return sendError(res, 500, 'SEARCH_ERROR', err.message);
  }
});

/**
 * GET /api/catalog
 * Advanced catalog search and filtering.
 */
animeRouter.get('/catalog', async (req, res) => {
  const {
    q,
    query,
    genre,
    genres,
    tag,
    tags,
    year,
    season,
    format,
    status,
    subDub,
    sort,
    studio,
    minDuration,
    maxDuration,
    minEpisodes,
    maxEpisodes,
    page,
    perPage,
    adult
  } = req.query;

  const parsedGenres = genres ? (Array.isArray(genres) ? genres : genres.split(',')) : (genre ? [genre] : undefined);
  const parsedTags = tags ? (Array.isArray(tags) ? tags : tags.split(',')) : (tag ? [tag] : undefined);
  const parsedFormat = format ? (Array.isArray(format) ? format : format.split(',')) : undefined;

  const options = {
    query: q || query,
    genres: parsedGenres,
    tags: parsedTags,
    year,
    season,
    format: parsedFormat,
    status,
    subDub,
    sort: sort || 'popular',
    studio,
    minDuration,
    maxDuration,
    minEpisodes,
    maxEpisodes,
    page: parseInt(page, 10) || 1,
    perPage: parseInt(perPage, 10) || 24,
    includeAdult: adult === 'true'
  };

  const cacheKey = `catalog:${JSON.stringify(options)}`;

  try {
    const { data, source } = await defaultCache.getOrFetch(
      cacheKey,
      () => defaultClient.getCatalog(options),
      300000 // 5 min TTL
    );
    return sendSuccess(res, data, source);
  } catch (err) {
    return sendError(res, 500, 'CATALOG_ERROR', err.message);
  }
});

/**
 * GET /api/anime/:id
 * Full metadata for a specific anime by slug or numeric ID.
 */
animeRouter.get('/anime/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return sendError(res, 400, 'MISSING_ID', 'Anime ID or slug is required');
  }

  const cacheKey = `anime:${id.toLowerCase()}`;

  try {
    const { data, source } = await defaultCache.getOrFetch(
      cacheKey,
      () => defaultClient.getAnimeInfo(id),
      600000 // 10 min TTL
    );
    return sendSuccess(res, data, source);
  } catch (err) {
    return sendError(res, 404, 'ANIME_NOT_FOUND', err.message);
  }
});

/**
 * GET /api/anime/:id/episodes
 * Full episode list for an anime.
 */
animeRouter.get('/anime/:id/episodes', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return sendError(res, 400, 'MISSING_ID', 'Anime ID or slug is required');
  }

  const cacheKey = `episodes:${id.toLowerCase()}`;

  try {
    const { data, source } = await defaultCache.getOrFetch(
      cacheKey,
      () => defaultClient.getEpisodes(id),
      300000 // 5 min TTL
    );
    return sendSuccess(res, data, source);
  } catch (err) {
    return sendError(res, 500, 'EPISODES_FETCH_ERROR', err.message);
  }
});

/**
 * GET /api/anime/:id/servers
 * Available streaming servers/providers for a specific episode.
 */
animeRouter.get('/anime/:id/servers', async (req, res) => {
  const { id } = req.params;
  const ep = parseInt(req.query.ep, 10) || 1;
  const cacheKey = `servers:${id.toLowerCase()}:${ep}`;

  try {
    const { data, source } = await defaultCache.getOrFetch(
      cacheKey,
      () => defaultClient.getServers(id, ep),
      300000 // 5 min TTL
    );
    return sendSuccess(res, data, source);
  } catch (err) {
    return sendError(res, 500, 'SERVERS_FETCH_ERROR', err.message);
  }
});

/**
 * GET /api/watch/:id/:ep
 * Stream URLs, M3U8 master playlist, subtitles, and headers for an episode.
 */
animeRouter.get('/watch/:id/:ep', async (req, res) => {
  const { id, ep } = req.params;
  const category = (req.query.category || req.query.type || 'sub').toLowerCase();
  const provider = (req.query.provider || 'yuki').toLowerCase();
  const parseVariants = req.query.parseVariants !== 'false';

  const cacheKey = `watch:${id.toLowerCase()}:${ep}:${category}:${provider}:${parseVariants}`;

  try {
    const { data, source } = await defaultCache.getOrFetch(
      cacheKey,
      async () => {
        const streamData = await defaultClient.getSources(id, ep, {
          category,
          provider,
          parseVariants
        });

        // Add convenient CORS proxy URLs for web players
        const host = req.get('host');
        const proto = req.protocol;
        const apiBase = `${proto}://${host}`;

        if (streamData.streamUrl) {
          const encodedUrl = encodeURIComponent(streamData.streamUrl);
          const encodedHeaders = encodeURIComponent(JSON.stringify(streamData.headers || {}));
          streamData.proxyUrl = `${apiBase}/api/proxy/stream?url=${encodedUrl}&headers=${encodedHeaders}`;

          if (Array.isArray(streamData.variants)) {
            streamData.variants = streamData.variants.map(v => ({
              ...v,
              proxyUrl: `${apiBase}/api/proxy/stream?url=${encodeURIComponent(v.url)}&headers=${encodedHeaders}`
            }));
          }
        }

        return streamData;
      },
      300000 // 5 min TTL
    );

    return sendSuccess(res, data, source);
  } catch (err) {
    return sendError(res, 500, 'STREAM_SOURCE_ERROR', err.message);
  }
});

/**
 * GET /api/download/:malId/:ep
 * Download links for an episode.
 */
animeRouter.get('/download/:malId/:ep', async (req, res) => {
  const { malId, ep } = req.params;
  const cacheKey = `download:${malId}:${ep}`;

  try {
    const { data, source } = await defaultCache.getOrFetch(
      cacheKey,
      () => defaultClient.getDownloadLinks(malId, ep),
      600000 // 10 min TTL
    );
    return sendSuccess(res, data, source);
  } catch (err) {
    return sendError(res, 500, 'DOWNLOAD_FETCH_ERROR', err.message);
  }
});

/**
 * GET /api/schedule
 * Airing schedule calendar.
 */
animeRouter.get('/schedule', async (req, res) => {
  const weekStart = req.query.start ? parseInt(req.query.start, 10) : undefined;
  const weekEnd = req.query.end ? parseInt(req.query.end, 10) : undefined;
  const page = parseInt(req.query.page, 10) || 1;
  const cacheKey = `schedule:${weekStart}:${weekEnd}:${page}`;

  try {
    const { data, source } = await defaultCache.getOrFetch(
      cacheKey,
      () => defaultClient.getSchedule(weekStart, weekEnd, page),
      600000 // 10 min TTL
    );
    return sendSuccess(res, data, source);
  } catch (err) {
    return sendError(res, 500, 'SCHEDULE_FETCH_ERROR', err.message);
  }
});
