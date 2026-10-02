# Animex Scraper & Streaming API ⚡

A blazing-fast, **zero-FlareSolverr**, zero-headless-browser scraper and REST API for [Animex](https://animex.one/).

Built on native Node.js 20+ `fetch`, it directly queries Animex's GraphQL engine, REST services, and SvelteKit server-rendered hydration data to deliver sub-second responses for anime search, catalog filtering, metadata, episode guides, and multi-quality HLS (`.m3u8`) streaming sources.

---

## 🌟 Key Highlights

- **⚡ Zero FlareSolverr & Zero Browser Overhead**: Operates entirely with lightweight, native HTTP/2 & HTTP/1.1 requests without launching Chromium or waiting for challenge solvers.
- **🚀 Ultra-Fast In-Memory Cache**: Built-in TTL cache with **Request Coalescing** (concurrent in-flight deduplication) preventing upstream load and serving repeated requests in `< 1ms`.
- **🎬 Direct Master HLS Playlists**: Extracts full multi-quality `.m3u8` master streams (1080p, 720p, 480p, 360p) with bandwidths, video codecs, and subtitle tracks (English, Japanese, Arabic, German, Spanish, French, etc.).
- **🌐 Built-in CORS Stream Proxy**: Includes an integrated `/api/proxy/stream` endpoint with manifest link rewriting, allowing web video players (`hls.js`, `Video.js`, `Plyr`) to stream videos directly in the browser without CORS or hotlink blocking.
- **📚 Interactive Swagger UI**: Complete OpenAPI 3.0 specification available out-of-the-box at `/docs`.
- **💻 Standalone CLI**: Powerful command-line utility for searching, inspecting metadata, and extracting stream links directly to terminal or media players.
- **🧪 Fully Tested**: 100% automated test suite using Node.js native test runner (`node --test`).

---

## 📦 Requirements

- **Node.js**: `v20.0.0` or higher
- **Operating System**: Windows, Linux, or macOS

---

## 🚀 Installation & Setup

```bash
cd animex-scraper
npm install
```

### Start Development Server (Auto-reload)
```bash
npm run dev
```

### Start Production Server
```bash
npm start
```

By default, the server runs on `http://localhost:3006`.

- **Swagger Documentation**: [http://localhost:3006/docs](http://localhost:3006/docs)
- **OpenAPI Schema**: [http://localhost:3006/openapi.json](http://localhost:3006/openapi.json)
- **Health Check**: [http://localhost:3006/health](http://localhost:3006/health)

---

## 📡 REST API Reference

All successful responses return `{ "success": true, "data": ... }`. The `X-Cache` HTTP response header indicates `HIT`, `MISS`, or `COALESCED`.

### 1. Health & Cache Metrics
```http
GET /health
```
Returns system uptime, API status, and cache statistics (hits, misses, coalesced, hit rate).

### 2. Recent Episode Releases
```http
GET /api/recent?page=1
```
Returns newly released/airing episodes across TV, ONA, movies, and specials with sub/dub indicators and episode numbers.

### 3. Fast Title Search
```http
GET /api/search?q=dandadan&limit=20&adult=false
```
Performs an instantaneous indexed search by anime title.

### 4. Advanced Catalog & Filtering
```http
GET /api/catalog?genre=Action,Fantasy&year=2025&format=TV&sort=trending&page=1&perPage=24
```
Query parameters:
- `query` / `q`: Keyword search
- `genre` / `genres`: Comma-separated genre list (e.g. `Action,Comedy,Sci-Fi`)
- `year`: Release year (e.g. `2025`)
- `season`: `WINTER`, `SPRING`, `SUMMER`, `FALL`
- `format`: `TV`, `MOVIE`, `OVA`, `ONA`, `SPECIAL`
- `status`: `RELEASING`, `FINISHED`, `NOT_YET_RELEASED`
- `subDub`: `sub` or `dub`
- `sort`: `popular`, `trending`, `score`, `latest`
- `studio`: Filter by animation studio
- `page`: Page number (default: `1`)
- `perPage`: Items per page (default: `24`, max: `100`)

### 5. Anime Details & Metadata
```http
GET /api/anime/:id
```
Accepts either an AniList numeric ID (e.g. `185660`) or a provider slug (e.g. `dan-da-dan-season-2-od6gt`). Returns:
- English, Romaji, and Native titles
- High-res cover images, banners, and logos
- Synopsis and genre categorization
- Studio, season, format, status, and score
- Prequels, sequels, and related franchises
- Character lists with voice actors and roles
- Recommended anime

### 6. Episode List
```http
GET /api/anime/:id/episodes
```
Returns complete episode listings with:
- Episode number
- Multilingual episode titles (English, Japanese, German, etc.)
- TVDB screenshot thumbnails
- Duration in minutes
- Air dates and filler status flags

### 7. Streaming Servers
```http
GET /api/anime/:id/servers?ep=1
```
Returns available SUB and DUB server providers (e.g. `yuki`, `sora`, `zen`).

### 8. Stream Sources & M3U8 Master Playlist
```http
GET /api/watch/:id/:ep?category=sub&provider=yuki&parseVariants=true
```
Returns:
- `streamUrl`: Direct signed master `.m3u8` playlist
- `proxyUrl`: CORS-enabled proxy URL for browser players
- `variants`: Extracted qualities (1080p, 720p, 480p, 360p) with resolutions, bandwidths, and proxy URLs
- `subtitles`: Full list of WebVTT caption tracks
- `headers`: Necessary playback headers (`Origin`, `Referer`) for external video clients

### 9. Airing Schedule
```http
GET /api/schedule?page=1
```
Returns the weekly anime broadcast schedule.

### 10. CORS Stream Proxy
```http
GET /api/proxy/stream?url=<encoded_m3u8_or_ts_url>&headers=<encoded_json_headers>
```
Proxies and rewrites HLS manifests on-the-fly, enabling smooth browser playback in web applications without cross-origin or Referer restrictions.

---

## 💻 CLI Usage

The package includes a standalone CLI tool `src/cli.js`:

```bash
# Search anime
node src/cli.js search "chainsaw man"

# View recent episodes
node src/cli.js recent 1

# View anime details
node src/cli.js anime dan-da-dan-season-2-od6gt

# List all episodes
node src/cli.js episodes dan-da-dan-season-2-od6gt

# Check available streaming servers
node src/cli.js servers dan-da-dan-season-2-od6gt 1

# Extract stream sources & M3U8
node src/cli.js watch dan-da-dan-season-2-od6gt 1 --provider=yuki

# Output raw JSON
node src/cli.js watch dan-da-dan-season-2-od6gt 1 --json

# Launch API server
node src/cli.js serve --port=3006
```

---

## 📺 Frontend Video Player Integration

### Using [Hls.js](https://github.com/video-dev/hls.js/)

```html
<video id="video" controls autoplay style="width: 100%; max-width: 800px;"></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
  async function playAnime(slug, episode) {
    const res = await fetch(`http://localhost:3006/api/watch/${slug}/${episode}?provider=yuki`);
    const { data } = await res.json();

    const video = document.getElementById('video');
    if (Hls.isSupported()) {
      const hls = new Hls();
      // Use proxyUrl to bypass CORS and Referer restrictions
      hls.loadSource(data.proxyUrl);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = data.proxyUrl;
    }
  }

  playAnime('dan-da-dan-season-2-od6gt', 1);
</script>
```

### Using MPV or VLC (Direct Upstream Stream)

```bash
# MPV
mpv "https://fetch.nexabloom.top/.../master.m3u8?token=..." \
    --http-header-fields="Referer: https://megaplay.buzz/,Origin: https://megaplay.buzz"
```

---

## 🧪 Testing

Run the automated test suite:

```bash
npm test
```

Run code syntax verification:
```bash
npm run check
```

---

## 🐳 Docker Deployment

Build and run with Docker:

```bash
docker build -t animex-scraper .
docker run -p 3006:3006 animex-scraper
```

Or with `docker-compose`:
```bash
docker compose up -d
```

---

## 📄 License

MIT
