import { Router } from 'express';

export const proxyRouter = Router();

/**
 * GET /api/proxy/stream
 * Proxies HLS video streams, manifests, and segments with CORS enabled.
 * Automatically rewrites URLs in .m3u8 playlists to keep playback within the proxy.
 */
proxyRouter.get('/stream', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('Missing "url" query parameter');
  }

  let customHeaders = {};
  if (req.query.headers) {
    try {
      customHeaders = JSON.parse(req.query.headers);
    } catch {
      // ignore
    }
  }

  const upstreamHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Accept': '*/*',
    ...customHeaders
  };

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: upstreamHeaders
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send(`Upstream error: ${upstreamRes.statusText}`);
    }

    const contentType = upstreamRes.headers.get('content-type') || 'application/vnd.apple.mpegurl';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', contentType);

    const isPlaylist = contentType.includes('mpegurl') || targetUrl.includes('.m3u8');

    if (isPlaylist) {
      const text = await upstreamRes.text();
      const baseUrl = new URL(targetUrl);
      const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1);

      const host = req.get('host');
      const proto = req.protocol;
      const proxyBase = `${proto}://${host}/api/proxy/stream`;

      const encodedHeadersParam = req.query.headers ? `&headers=${encodeURIComponent(req.query.headers)}` : '';

      // Rewrite URLs in m3u8
      const rewritten = text.split(/\r?\n/).map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          // If line has URI="...", rewrite URI inside
          if (trimmed.includes('URI="')) {
            return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
              let absoluteUri = uri;
              if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
                if (uri.startsWith('/')) {
                  absoluteUri = `${baseUrl.origin}${uri}`;
                } else {
                  absoluteUri = `${baseUrl.origin}${basePath}${uri}`;
                }
              }
              return `URI="${proxyBase}?url=${encodeURIComponent(absoluteUri)}${encodedHeadersParam}"`;
            });
          }
          return line;
        }

        // Segment or variant stream URL line
        let absoluteUrl = trimmed;
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
          if (trimmed.startsWith('/')) {
            absoluteUrl = `${baseUrl.origin}${trimmed}`;
          } else {
            absoluteUrl = `${baseUrl.origin}${basePath}${trimmed}`;
          }
          if (baseUrl.search && !absoluteUrl.includes('?')) {
            absoluteUrl += baseUrl.search;
          }
        }

        return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}${encodedHeadersParam}`;
      }).join('\n');

      return res.send(rewritten);
    }

    // Binary segment (.ts / .m4s / etc.)
    const buffer = Buffer.from(await upstreamRes.arrayBuffer());
    return res.send(buffer);
  } catch (err) {
    return res.status(502).send(`Proxy failed: ${err.message}`);
  }
});
