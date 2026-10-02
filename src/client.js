import { parseSvelteKitData } from './unflatten.js';
import {
  normalizeAnime,
  normalizeRecentList,
  normalizeEpisodes,
  parseMasterM3u8
} from './parsers.js';

const FAST_SEARCH_QUERY = `
query FastSearch($query: String, $limit: Int, $includeAdult: Boolean) {
  catalogAnime(filter: { query: $query, includeAdult: $includeAdult }, limit: $limit) {
    items {
      id
      anilistId
      malId
      titleRomaji
      titleEnglish
      coverImage
      format
      status
      episodeCount
      seasonYear
      season
      color
      genres
      bannerImage
    }
  }
}
`;

const CATALOG_ANIME_QUERY = `
query CatalogAnime($filter: AnimeCatalogFilterInput, $sort: [AnimeSortInput!], $limit: Int, $offset: Int) {
  catalogAnime(filter: $filter, sort: $sort, limit: $limit, offset: $offset) {
    items {
      id
      anilistId
      malId
      titleRomaji
      titleEnglish
      coverImage
      bannerImage
      backdropUrl
      description
      trailerId
      status
      format
      averageScore
      popularity
      nextAiringAt
      nextAiringEpisode
      episodeCount
      seasonYear
      season
      color
      genres
      subCount
      dubCount
    }
    totalCount
    limit
    offset
    currentPage
    totalPages
    hasNextPage
    hasPreviousPage
  }
}
`;

const SCHEDULE_QUERY = `
query AiringSchedule($weekStart: Int, $weekEnd: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
      total
    }
    airingSchedules(airingAt_greater: $weekStart, airingAt_lesser: $weekEnd, sort: TIME) {
      id
      airingAt
      episode
      media {
        id
        idMal
        title {
          romaji
          english
          native
          userPreferred
        }
        coverImage {
          extraLarge
          large
          medium
          color
        }
        bannerImage
        format
        status
        episodes
        genres
        averageScore
        popularity
      }
    }
  }
}
`;

export class AnimexClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseUrl='https://animex.one']
   * @param {string} [options.ppUrl='https://pp.animex.one']
   * @param {string} [options.graphqlUrl='https://graphql.animex.one']
   * @param {string} [options.plyrUrl='https://plyr.animex.one']
   * @param {number} [options.timeoutMs=15000]
   */
  constructor({
    baseUrl = 'https://animex.one',
    ppUrl = 'https://pp.animex.one',
    graphqlUrl = 'https://graphql.animex.one',
    plyrUrl = 'https://plyr.animex.one',
    timeoutMs = 15000
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.ppUrl = ppUrl.replace(/\/+$/, '');
    this.graphqlUrl = graphqlUrl.replace(/\/+$/, '');
    this.plyrUrl = plyrUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;

    this.defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': `${this.baseUrl}/`
    };

    // Fast in-memory bidirectional index for slug <-> anilistId
    this.slugToAnilistId = new Map();
    this.anilistIdToSlug = new Map();
  }

  /**
   * High performance fetch wrapper with timeout.
   * @private
   */
  async _fetch(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || this.timeoutMs);

    const mergedHeaders = {
      ...this.defaultHeaders,
      ...(options.headers || {})
    };

    try {
      const res = await fetch(url, {
        ...options,
        headers: mergedHeaders,
        signal: controller.signal
      });
      return res;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Request timeout (${options.timeoutMs || this.timeoutMs}ms) to ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * GraphQL query execution against Animex GraphQL API.
   * @private
   */
  async _graphql(query, variables = {}) {
    const res = await this._fetch(`${this.graphqlUrl}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });

    if (!res.ok) {
      throw new Error(`GraphQL request failed with HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(`GraphQL error: ${json.errors[0].message}`);
    }

    return json.data;
  }

  /**
   * Fetch recent episode releases.
   * @param {number} [page=1]
   * @returns {Promise<{ items: Array<Object>, page: number }>}
   */
  async getRecent(page = 1) {
    const res = await this._fetch(`${this.graphqlUrl}/api/recent?page=${page}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch recent releases: HTTP ${res.status}`);
    }

    const data = await res.json();
    const rawList = Array.isArray(data) ? data : (data?.results || []);
    const items = normalizeRecentList(rawList);

    // Seed index with recent results
    for (const item of items) {
      if (item.slug && item.anilistId) {
        this.slugToAnilistId.set(item.slug, item.anilistId);
        this.anilistIdToSlug.set(item.anilistId, item.slug);
      }
    }

    return {
      items,
      page: Number(page)
    };
  }

  /**
   * Fast search by title.
   * @param {string} query Search keyword
   * @param {Object} [options]
   * @param {number} [options.limit=20]
   * @param {boolean} [options.includeAdult=false]
   * @returns {Promise<Array<Object>>}
   */
  async search(query, { limit = 20, includeAdult = false } = {}) {
    if (!query || typeof query !== 'string') {
      return [];
    }

    const data = await this._graphql(FAST_SEARCH_QUERY, {
      query: query.trim(),
      limit,
      includeAdult
    });

    const items = (data?.catalogAnime?.items || []).map(normalizeAnime);

    // Seed index with search results
    for (const item of items) {
      if (item.slug && item.anilistId) {
        this.slugToAnilistId.set(item.slug, item.anilistId);
        this.anilistIdToSlug.set(item.anilistId, item.slug);
      }
    }

    return items;
  }

  /**
   * Advanced catalog query with filtering, sorting, and pagination.
   * @param {Object} options
   * @returns {Promise<{ items: Array<Object>, pageInfo: Object }>}
   */
  async getCatalog({
    query,
    genres,
    tags,
    year,
    season,
    format,
    status,
    subDub,
    sort = 'popular',
    studio,
    minDuration,
    maxDuration,
    minEpisodes,
    maxEpisodes,
    page = 1,
    perPage = 24,
    includeAdult = false
  } = {}) {
    const filter = {};

    if (query) filter.query = String(query).trim();

    if (genres) {
      filter.genres = Array.isArray(genres) ? genres : [genres];
    }
    if (tags) {
      filter.tags = Array.isArray(tags) ? tags : [tags];
    }

    if (year) {
      const y = parseInt(year, 10);
      if (!isNaN(y)) {
        filter.seasonYearMin = y;
        filter.seasonYearMax = y;
      }
    }

    if (season) filter.seasonIn = [season.toUpperCase()];
    if (format) {
      filter.formatIn = Array.isArray(format) ? format : [format];
    }
    if (status) filter.statusIn = [status.toUpperCase()];
    if (subDub) filter.subDubFilter = subDub.toLowerCase();
    if (studio) filter.studios = [studio];
    if (includeAdult) filter.includeAdult = true;

    if (minDuration !== undefined) filter.durationMin = Number(minDuration);
    if (maxDuration !== undefined) filter.durationMax = Number(maxDuration);
    if (minEpisodes !== undefined) filter.episodeCountMin = Number(minEpisodes);
    if (maxEpisodes !== undefined) filter.episodeCountMax = Number(maxEpisodes);

    let sortOption = [{ field: 'POPULARITY', direction: 'DESC' }];
    switch (sort.toLowerCase()) {
      case 'trending':
        sortOption = [{ field: 'TRENDING', direction: 'DESC' }];
        break;
      case 'score':
        sortOption = [{ field: 'AVERAGE_SCORE', direction: 'DESC' }];
        break;
      case 'latest':
        sortOption = [{ field: 'CREATED_AT', direction: 'DESC' }];
        break;
      case 'popular':
      default:
        sortOption = [{ field: 'POPULARITY', direction: 'DESC' }];
        break;
    }

    const limit = Math.max(1, Math.min(Number(perPage) || 24, 100));
    const currentPage = Math.max(1, Number(page) || 1);
    const offset = (currentPage - 1) * limit;

    const data = await this._graphql(CATALOG_ANIME_QUERY, {
      filter,
      sort: sortOption,
      limit,
      offset
    });

    const catalogResult = data?.catalogAnime;
    const items = (catalogResult?.items || []).map(normalizeAnime);

    for (const item of items) {
      if (item.slug && item.anilistId) {
        this.slugToAnilistId.set(item.slug, item.anilistId);
        this.anilistIdToSlug.set(item.anilistId, item.slug);
      }
    }

    return {
      items,
      pageInfo: {
        total: catalogResult?.totalCount || 0,
        perPage: catalogResult?.limit || limit,
        currentPage: catalogResult?.currentPage || currentPage,
        totalPages: catalogResult?.totalPages || 1,
        hasNextPage: Boolean(catalogResult?.hasNextPage),
        hasPreviousPage: Boolean(catalogResult?.hasPreviousPage)
      }
    };
  }

  /**
   * Resolves both the numeric AniList ID and provider slug from any input.
   * Handles numeric IDs ('185660'), slugs with trailing IDs ('dan-da-dan-185660'),
   * and provider slugs ('dan-da-dan-season-2-od6gt').
   * @param {string|number} idOrSlug
   * @returns {Promise<{ anilistId: number|null, slug: string }>}
   */
  async resolveIdentifiers(idOrSlug) {
    const raw = String(idOrSlug).trim();

    // 1. Is it pure numeric? (e.g. "185660")
    if (/^\d+$/.test(raw)) {
      const anilistId = parseInt(raw, 10);
      let slug = this.anilistIdToSlug.get(anilistId);
      if (!slug) {
        try {
          const anime = await this.getAnimeInfo(anilistId);
          slug = anime.slug;
        } catch {
          slug = raw;
        }
      }
      return { anilistId, slug: slug || raw };
    }

    // 2. Does it end with an AniList ID? (e.g. "dan-da-dan-season-2-185660")
    const trailingIdMatch = raw.match(/-(\d+)$/);
    if (trailingIdMatch) {
      const anilistId = parseInt(trailingIdMatch[1], 10);
      let slug = this.anilistIdToSlug.get(anilistId);
      if (!slug) {
        try {
          const anime = await this.getAnimeInfo(anilistId);
          slug = anime.slug;
        } catch {
          slug = raw;
        }
      }
      return { anilistId, slug: slug || raw };
    }

    // 3. Already mapped provider slug?
    if (this.slugToAnilistId.has(raw)) {
      const anilistId = this.slugToAnilistId.get(raw);
      return { anilistId, slug: raw };
    }

    // 4. Try looking up in GraphQL by title / cleaned slug
    const cleanedQuery = raw.replace(/-[a-z0-9]{4,6}$/i, '').replace(/[-_]+/g, ' ');
    const searchRes = await this.getCatalog({ query: cleanedQuery, perPage: 10 });
    const match = searchRes.items.find(i => i.slug === raw) || searchRes.items[0];

    if (match) {
      if (match.slug && match.anilistId) {
        this.slugToAnilistId.set(match.slug, match.anilistId);
        this.anilistIdToSlug.set(match.anilistId, match.slug);
      }
      return {
        anilistId: match.anilistId,
        slug: match.slug || raw
      };
    }

    return { anilistId: null, slug: raw };
  }

  /**
   * Fetches full anime metadata by slug or ID.
   * Uses Animex SvelteKit server-rendered hydration endpoint (__data.json).
   * @param {string|number} idOrSlug
   * @returns {Promise<Object>}
   */
  async getAnimeInfo(idOrSlug) {
    const raw = String(idOrSlug).trim();

    // Check if it's already an anilistId or contains one
    let targetParam = raw;
    if (!/^\d+$/.test(raw)) {
      const match = raw.match(/-(\d+)$/);
      if (match) {
        targetParam = match[1];
      } else {
        // Resolve anilistId for provider slug
        const ids = await this.resolveIdentifiers(raw);
        if (ids.anilistId) {
          targetParam = String(ids.anilistId);
        }
      }
    }

    const url = `${this.baseUrl}/anime/${encodeURIComponent(targetParam)}/__data.json`;
    const res = await this._fetch(url);

    if (!res.ok) {
      throw new Error(`Failed to load anime details for "${idOrSlug}": HTTP ${res.status}`);
    }

    const text = await res.text();
    const parsed = parseSvelteKitData(text);
    const animeData = parsed?.data?.animeInfo || parsed?.data?.anime || parsed?.data;

    if (!animeData || (!animeData.id && !animeData.anilistId)) {
      throw new Error(`No anime data found for "${idOrSlug}"`);
    }

    const normalized = normalizeAnime(animeData);

    // Cache the mapping
    if (normalized.slug && normalized.anilistId) {
      this.slugToAnilistId.set(normalized.slug, normalized.anilistId);
      this.anilistIdToSlug.set(normalized.anilistId, normalized.slug);
    }

    return normalized;
  }

  /**
   * Fetches full episode list for an anime.
   * @param {string|number} idOrSlug
   * @returns {Promise<Array<Object>>}
   */
  async getEpisodes(idOrSlug) {
    const { slug } = await this.resolveIdentifiers(idOrSlug);
    const url = `${this.ppUrl}/rest/api/episodes?id=${encodeURIComponent(slug)}`;

    const res = await this._fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch episodes for "${idOrSlug}": HTTP ${res.status}`);
    }

    const rawList = await res.json();
    return normalizeEpisodes(rawList);
  }

  /**
   * Fetches available servers / providers for an episode.
   * @param {string|number} idOrSlug
   * @param {number|string} episodeNum
   * @returns {Promise<{ subProviders: Array<Object>, dubProviders: Array<Object>, zenPlayer: Object|null }>}
   */
  async getServers(idOrSlug, episodeNum = 1) {
    const { slug, anilistId } = await this.resolveIdentifiers(idOrSlug);
    const ep = Number(episodeNum) || 1;

    const url = `${this.ppUrl}/rest/api/servers?id=${encodeURIComponent(slug)}&epNum=${ep}`;
    const res = await this._fetch(url);

    let subProviders = [];
    let dubProviders = [];

    if (res.ok) {
      const data = await res.json();
      subProviders = Array.isArray(data?.subProviders) ? data.subProviders : [];
      dubProviders = Array.isArray(data?.dubProviders) ? data.dubProviders : [];
    }

    // Also check watch route for ZEN (flixcloud) embed
    let zenPlayer = null;
    try {
      const watchSlug = anilistId ? `${slug}-${anilistId}` : slug;
      const watchUrl = `${this.baseUrl}/watch/${encodeURIComponent(watchSlug)}-episode-${ep}/__data.json`;
      const watchRes = await this._fetch(watchUrl, { timeoutMs: 5000 });
      if (watchRes.ok) {
        const watchText = await watchRes.text();
        const parsed = parseSvelteKitData(watchText);
        for (const chunk of parsed.chunks) {
          if (chunk.data?.data && Array.isArray(chunk.data.data)) {
            const zenItem = chunk.data.data[0];
            if (zenItem?.player_url) {
              zenPlayer = {
                id: 'zen',
                accessId: zenItem.access_id,
                audio: zenItem.audio,
                playerUrl: zenItem.player_url,
                episode: zenItem.episode
              };
              break;
            }
          }
        }
      }
    } catch {
      // ZEN is optional fallback
    }

    return {
      subProviders,
      dubProviders,
      zenPlayer
    };
  }

  /**
   * Fetches stream sources (M3U8 master playlist, tracks, and headers) for an episode.
   * @param {string|number} idOrSlug
   * @param {number|string} episodeNum
   * @param {Object} [options]
   * @param {string} [options.category='sub'] 'sub' | 'dub'
   * @param {string} [options.provider='yuki'] 'yuki' | 'sora' | 'zen'
   * @param {boolean} [options.parseVariants=true] Whether to inspect master.m3u8 for quality variants
   * @returns {Promise<Object>}
   */
  async getSources(idOrSlug, episodeNum = 1, {
    category = 'sub',
    provider = 'yuki',
    parseVariants = true
  } = {}) {
    const { slug } = await this.resolveIdentifiers(idOrSlug);
    const ep = Number(episodeNum) || 1;
    const cat = category.toLowerCase() === 'dub' ? 'dub' : 'sub';

    // If ZEN player is requested directly
    if (provider === 'zen') {
      const servers = await this.getServers(slug, ep);
      if (!servers.zenPlayer) {
        throw new Error(`ZEN stream player not available for episode ${ep}`);
      }
      return {
        provider: 'zen',
        category: cat,
        type: 'embed',
        embedUrl: servers.zenPlayer.playerUrl,
        accessId: servers.zenPlayer.accessId,
        headers: {
          Referer: `${this.baseUrl}/`
        }
      };
    }

    const url = `${this.ppUrl}/rest/api/sources?id=${encodeURIComponent(slug)}&epNum=${ep}&type=${cat}&providerId=${encodeURIComponent(provider)}`;
    const res = await this._fetch(url, {
      headers: {
        'Referer': `${this.plyrUrl}/`
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to load stream sources from provider "${provider}": HTTP ${res.status}`);
    }

    const data = await res.json();
    const masterSource = data.sources?.[0];
    if (!masterSource?.url) {
      throw new Error(`No stream URL returned for ${slug} episode ${ep} (${provider})`);
    }

    const masterUrl = masterSource.url;
    const headers = data.headers || {
      Referer: 'https://megaplay.buzz/',
      Origin: 'https://megaplay.buzz'
    };

    let variants = [];
    if (parseVariants) {
      try {
        const m3u8Res = await this._fetch(masterUrl, {
          headers: {
            ...headers,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          },
          timeoutMs: 8000
        });
        if (m3u8Res.ok) {
          const m3u8Text = await m3u8Res.text();
          variants = parseMasterM3u8(m3u8Text, masterUrl);
        }
      } catch {
        // Variants extraction is non-blocking
      }
    }

    return {
      provider,
      category: cat,
      streamUrl: masterUrl,
      format: masterSource.type || 'application/x-mpegURL',
      variants,
      subtitles: (data.tracks || []).map(t => ({
        id: t.id,
        url: t.url,
        language: t.lang,
        label: t.label,
        kind: t.kind || 'subtitles',
        isDefault: Boolean(t.default)
      })),
      headers
    };
  }

  /**
   * Fetches airing schedule from AniList GraphQL.
   * @param {number} [weekStart] Unix timestamp (seconds)
   * @param {number} [weekEnd] Unix timestamp (seconds)
   * @param {number} [page=1]
   * @returns {Promise<{ items: Array<Object>, pageInfo: Object }>}
   */
  async getSchedule(weekStart, weekEnd, page = 1) {
    const now = Math.floor(Date.now() / 1000);
    const start = weekStart || now - (new Date().getDay() * 86400);
    const end = weekEnd || start + (7 * 86400);

    const res = await this._fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        query: SCHEDULE_QUERY,
        variables: { weekStart: start, weekEnd: end, page }
      })
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch schedule: HTTP ${res.status}`);
    }

    const json = await res.json();
    const schedules = json?.data?.Page?.airingSchedules || [];
    const pageInfo = json?.data?.Page?.pageInfo || {};

    const items = schedules.map(s => ({
      id: s.id,
      airingAt: s.airingAt,
      episode: s.episode,
      anime: normalizeAnime({ ...s.media, id: s.media.id })
    }));

    return {
      items,
      pageInfo
    };
  }

  /**
   * Fetches direct download links for an episode by MAL ID.
   * @param {number|string} malId
   * @param {number|string} episodeNum
   * @returns {Promise<Array<{ provider: string, type: 'sub'|'dub', url: string }>>}
   */
  async getDownloadLinks(malId, episodeNum = 1) {
    const url = `${this.baseUrl}/api/episode-links/${malId}/${episodeNum}`;
    const res = await this._fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch download links: HTTP ${res.status}`);
    }

    const json = await res.json();
    const links = [];

    for (const [provider, provData] of Object.entries(json)) {
      if (provider === 'status') continue;
      for (const cat of ['sub', 'dub']) {
        const downloadMap = provData?.[cat]?.download;
        if (downloadMap && typeof downloadMap === 'object') {
          for (const rawUrl of Object.values(downloadMap)) {
            const cleanUrl = String(rawUrl).replace(
              'https://pahe.nekostream.site/',
              'https://proud-dew-d754.download992.workers.dev/'
            );
            links.push({
              provider,
              type: cat,
              url: cleanUrl
            });
          }
        }
      }
    }

    return links;
  }
}

export const defaultClient = new AnimexClient();
