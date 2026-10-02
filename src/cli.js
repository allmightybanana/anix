#!/usr/bin/env node
import { defaultClient } from './client.js';
import { createApp } from './app.js';

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  console.log(`
Animex Scraper CLI - Fast, zero-FlareSolverr anime scraper

Usage:
  animex-scraper <command> [arguments] [options]

Commands:
  search <query>                 Search anime by keyword
  recent [page]                  Show recently released episodes
  anime <id|slug>                Get full details for an anime
  episodes <id|slug>             Get list of episodes
  servers <id|slug> [epNum]      Get available stream servers for an episode
  watch <id|slug> <epNum>        Get stream sources and M3U8 master playlist
  serve [--port=3006]            Start the REST API server

Options:
  --dub                          Use English DUB (default: SUB)
  --provider=<name>              Streaming provider (yuki, sora, zen; default: yuki)
  --json                         Output formatted JSON
  --help                         Show this help message

Examples:
  animex-scraper search "dandadan"
  animex-scraper recent 1
  animex-scraper anime dan-da-dan-season-2-od6gt
  animex-scraper episodes dan-da-dan-season-2-od6gt
  animex-scraper watch dan-da-dan-season-2-od6gt 1 --provider=yuki
  animex-scraper serve --port=3006
`);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  const isJson = args.includes('--json');
  const isDub = args.includes('--dub');
  const providerArg = args.find(a => a.startsWith('--provider='));
  const provider = providerArg ? providerArg.split('=')[1] : 'yuki';
  const portArg = args.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : 3006;

  try {
    switch (command) {
      case 'search': {
        const query = args[1];
        if (!query) {
          console.error('Error: Please provide a search query.');
          process.exit(1);
        }
        console.log(`Searching for "${query}"...`);
        const results = await defaultClient.search(query, { limit: 20 });
        if (isJson) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(`Found ${results.length} results:`);
          results.forEach((item, i) => {
            console.log(`[${i + 1}] ${item.title.userPreferred || item.title.english || item.title.romaji}`);
            console.log(`    Slug: ${item.slug || item.id} | AniList: ${item.anilistId} | Format: ${item.format} | Status: ${item.status}`);
          });
        }
        break;
      }

      case 'recent': {
        const page = parseInt(args[1], 10) || 1;
        console.log(`Fetching recent episodes (page ${page})...`);
        const { items } = await defaultClient.getRecent(page);
        if (isJson) {
          console.log(JSON.stringify(items, null, 2));
        } else {
          console.log(`Found ${items.length} recent releases:`);
          items.forEach(ep => {
            console.log(`- ${ep.title.userPreferred} Ep ${ep.episode} [${ep.isDub ? 'DUB' : 'SUB'}] (Slug: ${ep.slug})`);
          });
        }
        break;
      }

      case 'anime': {
        const idOrSlug = args[1];
        if (!idOrSlug) {
          console.error('Error: Please provide an anime slug or ID.');
          process.exit(1);
        }
        console.log(`Fetching details for "${idOrSlug}"...`);
        const anime = await defaultClient.getAnimeInfo(idOrSlug);
        if (isJson) {
          console.log(JSON.stringify(anime, null, 2));
        } else {
          console.log(`\n======================================================`);
          console.log(`Title (English): ${anime.title.english}`);
          console.log(`Title (Romaji):  ${anime.title.romaji}`);
          console.log(`Slug:            ${anime.slug}`);
          console.log(`AniList ID:      ${anime.anilistId} | MAL ID: ${anime.malId}`);
          console.log(`Format:          ${anime.format} | Episodes: ${anime.episodeCount}`);
          console.log(`Status:          ${anime.status} | Score: ${anime.averageScore}`);
          console.log(`Genres:          ${anime.genres.join(', ')}`);
          console.log(`Poster:          ${anime.coverImage.extraLarge || anime.coverImage.large}`);
          console.log(`======================================================\n`);
          console.log(`Synopsis:\n${anime.synopsis?.replace(/<br\s*\/?>/gi, '\n')}\n`);
        }
        break;
      }

      case 'episodes': {
        const idOrSlug = args[1];
        if (!idOrSlug) {
          console.error('Error: Please provide an anime slug or ID.');
          process.exit(1);
        }
        console.log(`Fetching episode list for "${idOrSlug}"...`);
        const episodes = await defaultClient.getEpisodes(idOrSlug);
        if (isJson) {
          console.log(JSON.stringify(episodes, null, 2));
        } else {
          console.log(`Total episodes: ${episodes.length}`);
          episodes.forEach(ep => {
            console.log(`Episode ${ep.number}: ${ep.title} (${ep.durationMinutes || '?'} min) ${ep.isFiller ? '[FILLER]' : ''}`);
          });
        }
        break;
      }

      case 'servers': {
        const idOrSlug = args[1];
        const ep = parseInt(args[2], 10) || 1;
        if (!idOrSlug) {
          console.error('Error: Please provide an anime slug or ID.');
          process.exit(1);
        }
        console.log(`Fetching servers for "${idOrSlug}" episode ${ep}...`);
        const servers = await defaultClient.getServers(idOrSlug, ep);
        if (isJson) {
          console.log(JSON.stringify(servers, null, 2));
        } else {
          console.log('SUB Providers:', servers.subProviders.map(p => `${p.id} (${p.tip})`).join(', '));
          console.log('DUB Providers:', servers.dubProviders.map(p => `${p.id} (${p.tip})`).join(', '));
          if (servers.zenPlayer) {
            console.log('ZEN Embed URL:', servers.zenPlayer.playerUrl);
          }
        }
        break;
      }

      case 'watch': {
        const idOrSlug = args[1];
        const ep = parseInt(args[2], 10) || 1;
        if (!idOrSlug) {
          console.error('Error: Please provide an anime slug or ID and episode number.');
          process.exit(1);
        }
        console.log(`Extracting stream for "${idOrSlug}" Ep ${ep} [${isDub ? 'DUB' : 'SUB'}, provider: ${provider}]...`);
        const sources = await defaultClient.getSources(idOrSlug, ep, {
          category: isDub ? 'dub' : 'sub',
          provider,
          parseVariants: true
        });

        if (isJson) {
          console.log(JSON.stringify(sources, null, 2));
        } else {
          console.log(`\n======================================================`);
          console.log(`Provider:     ${sources.provider}`);
          console.log(`Stream Type:  ${sources.category.toUpperCase()}`);
          console.log(`Master M3U8:  ${sources.streamUrl}`);
          console.log(`======================================================`);
          if (sources.variants && sources.variants.length > 0) {
            console.log(`\nDetected Qualities:`);
            sources.variants.forEach(v => {
              console.log(`  - ${v.quality} (${v.resolution}, Bandwidth: ${v.bandwidth}) -> ${v.url}`);
            });
          }
          if (sources.subtitles && sources.subtitles.length > 0) {
            console.log(`\nSubtitles (${sources.subtitles.length} tracks):`);
            sources.subtitles.slice(0, 5).forEach(s => {
              console.log(`  - [${s.language}] ${s.label}: ${s.url}`);
            });
            if (sources.subtitles.length > 5) {
              console.log(`    ... and ${sources.subtitles.length - 5} more tracks`);
            }
          }
          console.log(`\nPlayback Headers:`);
          console.log(JSON.stringify(sources.headers, null, 2));
        }
        break;
      }

      case 'serve': {
        const app = createApp();
        app.listen(port, '0.0.0.0', () => {
          console.log(`Animex Scraper API server listening on http://localhost:${port}`);
          console.log(`Swagger UI available at http://localhost:${port}/docs`);
        });
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
