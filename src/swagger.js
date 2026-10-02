export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Animex Scraper API',
    version: '1.0.0',
    description: 'High-speed, zero-FlareSolverr REST API and scraper for Animex (animex.one). Supports search, catalog filtering, full anime metadata, episode listings, streaming servers, and HLS master M3U8 streams with multi-quality and subtitles.'
  },
  servers: [
    {
      url: '/',
      description: 'Current host'
    }
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Health check and cache metrics',
        responses: {
          '200': {
            description: 'API is healthy'
          }
        }
      }
    },
    '/api/recent': {
      get: {
        summary: 'Recent episode releases',
        parameters: [
          {
            name: 'page',
            in: 'query',
            description: 'Page number',
            schema: { type: 'integer', default: 1 }
          }
        ],
        responses: {
          '200': { description: 'List of newly released episodes' }
        }
      }
    },
    '/api/search': {
      get: {
        summary: 'Fast search anime by title',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: true,
            description: 'Search query keyword',
            schema: { type: 'string' }
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Maximum items to return',
            schema: { type: 'integer', default: 20 }
          },
          {
            name: 'adult',
            in: 'query',
            description: 'Include 18+ adult content',
            schema: { type: 'boolean', default: false }
          }
        ],
        responses: {
          '200': { description: 'Matching anime items' }
        }
      }
    },
    '/api/catalog': {
      get: {
        summary: 'Advanced anime catalog with filtering and sorting',
        parameters: [
          { name: 'query', in: 'query', schema: { type: 'string' } },
          { name: 'genre', in: 'query', schema: { type: 'string' } },
          { name: 'genres', in: 'query', description: 'Comma-separated genres', schema: { type: 'string' } },
          { name: 'year', in: 'query', schema: { type: 'integer' } },
          { name: 'season', in: 'query', schema: { type: 'string', enum: ['WINTER', 'SPRING', 'SUMMER', 'FALL'] } },
          { name: 'format', in: 'query', description: 'TV, MOVIE, OVA, ONA, SPECIAL', schema: { type: 'string' } },
          { name: 'status', in: 'query', description: 'RELEASING, FINISHED, NOT_YET_RELEASED', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['popular', 'trending', 'score', 'latest'] } },
          { name: 'studio', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'perPage', in: 'query', schema: { type: 'integer', default: 24 } }
        ],
        responses: {
          '200': { description: 'Catalog items and pagination info' }
        }
      }
    },
    '/api/anime/{id}': {
      get: {
        summary: 'Full metadata for an anime',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Anime slug or AniList ID',
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': { description: 'Complete anime details' },
          '404': { description: 'Anime not found' }
        }
      }
    },
    '/api/anime/{id}/episodes': {
      get: {
        summary: 'Full episode list for an anime',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Anime slug or AniList ID',
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': { description: 'List of episodes with thumbnails and titles' }
        }
      }
    },
    '/api/anime/{id}/servers': {
      get: {
        summary: 'Available streaming providers for an episode',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          },
          {
            name: 'ep',
            in: 'query',
            description: 'Episode number',
            schema: { type: 'integer', default: 1 }
          }
        ],
        responses: {
          '200': { description: 'Available sub and dub providers' }
        }
      }
    },
    '/api/watch/{id}/{ep}': {
      get: {
        summary: 'HLS stream sources, master M3U8, and subtitle tracks',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Anime slug or AniList ID',
            schema: { type: 'string' }
          },
          {
            name: 'ep',
            in: 'path',
            required: true,
            description: 'Episode number',
            schema: { type: 'integer' }
          },
          {
            name: 'category',
            in: 'query',
            description: 'Audio category',
            schema: { type: 'string', enum: ['sub', 'dub'], default: 'sub' }
          },
          {
            name: 'provider',
            in: 'query',
            description: 'Streaming server provider',
            schema: { type: 'string', default: 'yuki' }
          }
        ],
        responses: {
          '200': { description: 'HLS master URL, proxy URL, variants, and subtitles' }
        }
      }
    },
    '/api/download/{malId}/{ep}': {
      get: {
        summary: 'Download links for an episode',
        parameters: [
          { name: 'malId', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'ep', in: 'path', required: true, schema: { type: 'integer' } }
        ],
        responses: {
          '200': { description: 'Download links' }
        }
      }
    },
    '/api/schedule': {
      get: {
        summary: 'Weekly anime airing schedule',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }
        ],
        responses: {
          '200': { description: 'Airing schedule' }
        }
      }
    },
    '/api/proxy/stream': {
      get: {
        summary: 'CORS stream proxy for browser video players',
        parameters: [
          { name: 'url', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'headers', in: 'query', description: 'JSON-encoded headers object', schema: { type: 'string' } }
        ],
        responses: {
          '200': { description: 'Proxied HLS playlist or media segment' }
        }
      }
    }
  }
};
