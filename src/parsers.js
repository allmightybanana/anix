/**
 * Data normalizers and parser utilities for Animex scraper.
 */

/**
 * Normalizes an anime entity from GraphQL or SvelteKit metadata.
 * @param {Object} raw
 * @returns {Object} Normalized anime item
 */
export function normalizeAnime(raw) {
  if (!raw) return null;

  const id = String(raw.id || raw.anilistId || raw.slug || '');
  const slug = raw.slug || (typeof raw.id === 'string' && !/^\d+$/.test(raw.id) ? raw.id : null);
  const anilistId = raw.anilistId ? Number(raw.anilistId) : (typeof raw.id === 'number' || /^\d+$/.test(raw.id) ? Number(raw.id) : null);
  const malId = raw.malId ? Number(raw.malId) : (raw.idMal ? Number(raw.idMal) : null);

  const titleEnglish = raw.titleEnglish || raw.title?.english || raw.englishTitle || null;
  const titleRomaji = raw.titleRomaji || raw.title?.romaji || raw.romajiTitle || null;
  const titleNative = raw.titleNative || raw.title?.native || raw.titles?.ja || null;

  const coverImage = typeof raw.coverImage === 'string'
    ? { extraLarge: raw.coverImage, large: raw.coverImage, medium: raw.coverImage }
    : {
        extraLarge: raw.coverImage?.extraLarge || raw.coverImages?.extraLarge || raw.coverImage?.large || null,
        large: raw.coverImage?.large || raw.coverImages?.large || raw.coverImage?.medium || null,
        medium: raw.coverImage?.medium || raw.coverImages?.medium || raw.coverImage?.small || null,
        color: raw.coverImage?.color || raw.coverImages?.color || raw.color || null
      };

  const bannerImage = raw.bannerImage || raw.bannerUrl || raw.backdropUrl || null;
  const logo = raw.clearLogoUrl || (Array.isArray(raw.logos) && raw.logos[0]?.src) || null;

  const genres = Array.isArray(raw.genres)
    ? raw.genres.map(g => (typeof g === 'object' && g?.name ? g.name : String(g)))
    : [];

  return {
    id,
    slug,
    anilistId,
    malId,
    tmdbId: raw.tmdbId ? String(raw.tmdbId) : null,
    title: {
      english: titleEnglish,
      romaji: titleRomaji,
      native: titleNative,
      userPreferred: titleEnglish || titleRomaji || titleNative || ''
    },
    synopsis: raw.description || raw.synopsis || null,
    coverImage,
    bannerImage,
    logo,
    format: raw.format || null,
    type: raw.type || 'ANIME',
    status: raw.status || null,
    seasonYear: raw.seasonYear || raw.year || null,
    season: raw.season || null,
    averageScore: raw.averageScore ?? raw.meanScore ?? null,
    popularity: raw.popularity ?? null,
    episodeCount: raw.episodeCount ?? raw.totalEpisodes ?? raw.episodes ?? null,
    genres,
    studios: Array.isArray(raw.studios?.nodes)
      ? raw.studios.nodes.map(s => s.name || s)
      : Array.isArray(raw.studios)
        ? raw.studios.map(s => (typeof s === 'object' ? s.name : String(s)))
        : [],
    nextAiring: raw.nextAiringAt || raw.nextAiringEpisode
      ? {
          airingAt: raw.nextAiringAt || raw.airingAt || null,
          episode: raw.nextAiringEpisode || raw.episode || null
        }
      : null,
    relations: Array.isArray(raw.relations?.edges)
      ? raw.relations.edges.map(e => ({
          relationType: e.relationType,
          anime: normalizeAnime(e.node)
        }))
      : [],
    recommendations: Array.isArray(raw.recommendations)
      ? raw.recommendations.map(r => normalizeAnime(r.mediaRecommendation || r))
      : [],
    characters: Array.isArray(raw.characters?.edges)
      ? raw.characters.edges.map(c => ({
          id: c.node?.id || c.id,
          role: c.role || 'SUPPORTING',
          name: c.node?.name?.userPreferred || c.node?.name?.full || '',
          image: c.node?.image?.large || c.node?.image?.medium || null
        }))
      : []
  };
}

/**
 * Normalizes recent episodes list.
 * @param {Array<Object>} list
 * @returns {Array<Object>}
 */
export function normalizeRecentList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(item => {
    let airingAt = item.airingAt || item.timestamp;
    if (!airingAt && item.createdAt) {
      const d = new Date(item.createdAt);
      if (!isNaN(d.getTime())) {
        airingAt = Math.floor(d.getTime() / 1000);
      }
    }

    return {
      id: String(item.anilistId || item.id),
      slug: item.id,
      anilistId: item.anilistId ? Number(item.anilistId) : null,
      malId: item.malId ? Number(item.malId) : null,
      episode: item.episode || 1,
      totalEpisodes: item.episodes || null,
      title: {
        english: item.titleEnglish || item.titles?.en || null,
        romaji: item.titleRomaji || item.titles?.['x-jat'] || null,
        native: item.titles?.ja || null,
        userPreferred: item.titleEnglish || item.titleRomaji || ''
      },
      coverImage: {
        extraLarge: item.coverImage?.extraLarge || null,
        large: item.coverImage?.large || null,
        medium: item.coverImage?.medium || null,
        color: item.coverImage?.color || item.color || null
      },
      duration: item.duration || null,
      score: item.meanScore || null,
      format: item.format || null,
      genres: Array.isArray(item.genres) ? item.genres : [],
      isSub: Boolean(item.isSub),
      isDub: Boolean(item.isDub),
      airingAt: airingAt || null
    };
  });
}

/**
 * Normalizes episodes response from Animex.
 * @param {Array<Object>} episodes
 * @returns {Array<Object>}
 */
export function normalizeEpisodes(episodes) {
  if (!Array.isArray(episodes)) return [];
  return episodes.map(ep => ({
    number: ep.number,
    title: ep.titles?.en || ep.titles?.['x-jat'] || ep.titles?.ja || `Episode ${ep.number}`,
    titles: ep.titles || {},
    thumbnail: ep.img || null,
    isFiller: Boolean(ep.isFiller),
    description: ep.description || null,
    rating: ep.rating ? String(ep.rating) : null,
    durationMinutes: ep.length || null,
    airDateUtc: ep.airDateUtc || null,
    hasSub: Boolean(ep.hasSub),
    hasDub: Boolean(ep.hasDub)
  })).sort((a, b) => a.number - b.number);
}

/**
 * Parses HLS Master M3U8 playlist text into structured quality streams.
 * @param {string} m3u8Content Raw HLS master playlist text
 * @param {string} masterUrl Original signed master.m3u8 URL for relative path resolution
 * @returns {Array<{ quality: string, resolution: string, bandwidth: number, url: string }>}
 */
export function parseMasterM3u8(m3u8Content, masterUrl) {
  if (!m3u8Content || typeof m3u8Content !== 'string') return [];

  const baseUrl = new URL(masterUrl);
  const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);

  const lines = m3u8Content.split(/\r?\n/);
  const variants = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const resMatch = line.match(/RESOLUTION=(\d+x\d+)/i);
      const bandMatch = line.match(/BANDWIDTH=(\d+)/i);
      const nextLine = lines[i + 1]?.trim();

      if (nextLine && !nextLine.startsWith('#')) {
        let variantUrl = nextLine;
        if (!variantUrl.startsWith('http://') && !variantUrl.startsWith('https://')) {
          if (variantUrl.startsWith('/')) {
            variantUrl = `${baseUrl.origin}${variantUrl}`;
          } else {
            variantUrl = `${baseUrl.origin}${basePath}${variantUrl}`;
          }
          // Preserve tokens if present in master query params
          if (baseUrl.search && !variantUrl.includes('?')) {
            variantUrl += baseUrl.search;
          }
        }

        const resolution = resMatch ? resMatch[1] : 'auto';
        let quality = 'auto';
        if (resMatch) {
          const height = resMatch[1].split('x')[1];
          quality = `${height}p`;
        }

        variants.push({
          quality,
          resolution,
          bandwidth: bandMatch ? parseInt(bandMatch[1], 10) : 0,
          url: variantUrl
        });
      }
    }
  }

  // Sort highest resolution first
  variants.sort((a, b) => b.bandwidth - a.bandwidth);
  return variants;
}
