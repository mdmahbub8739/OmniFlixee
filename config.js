window.OMNIFLIX_CONFIG = {
  // ── TMDB ────────────────────────────────────────────────────────────────────
  // Movies/series catalogue is powered by TMDB. The API key is embedded in
  // app.js and works out of the box. TMDB_PROXY_BASE is OPTIONAL — set it ONLY
  // if TMDB is blocked in your region: deploy workers/tmdb-proxy.js to
  // Cloudflare and paste its *.workers.dev URL here (no trailing /3).
  //   '' (empty)  → talk to api.themoviedb.org directly  (default, works)
  TMDB_PROXY_BASE: '',
  PROXY_IMAGES: true,          // route poster images through the proxy too (if set)

  PIP_DEFAULT_ENABLED: true,
  DL_BASE_URL: 'https://dl.peachify.top',
  DL_DEFAULT_ENABLED: true,
  NSFW_DEFAULT_ENABLED: false,

  // ── Anime scraper workers ──────────────────────────────────────────────────
  // Source for each worker lives in  workers/  — deploy each one as a Cloudflare
  // Worker (paste-and-deploy, no build step), then paste its *.workers.dev URL
  // below. The anime watch page fans out to EVERY worker in parallel and lists
  // their embeds as extra selectable sources alongside MegaPlay (Sub / Dub).
  //   lang: 'sub' → labelled "(Sub)"   ·   lang: 'dub' → labelled "(Dub)"
  //
  // Each worker exposes:  /search?query= → { status, data:[{title,url,poster,type, id,year,quality}] }
  // The streaming fetch differs per worker — set `api` to match its source file:
  //
  //   api: 'url'      (workers/worker-animesalt.js, workers/worker-animedekho.js)
  //     GET /details?url=<seriesUrl> → { status, data:{ is_series,
  //                                       episodes:[{season,episode,title,url}] } }
  //     GET /play?url=<episodeUrl>   → { status, data:[{name,url}] }
  //
  //   api: 'legacy'   (workers/worker-toonstream.js)
  //     GET /play?title=&season=&episode= → { status, embed_links:["url", ...] }
  //
  // ⚠️  Replace each `url` with YOUR deployed worker URL. The two pasamaraooo49
  //     URLs below are public shared instances that currently work — swap them
  //     for your own deployments of workers/worker-animesalt.js & worker-toonstream.js
  //     when you want to fully self-host.
  ANIME_WORKERS: [
    { name: 'AnimeSalt',  url: 'https://animesalt.pasamaraooo49.workers.dev/',         lang: 'sub', api: 'url'    },
    { name: 'ToonStream', url: 'https://tstream.pasamaraooo49.workers.dev/', lang: 'dub', api: 'url' },
    { name: 'AnimeDekho', url: 'https://dekho.pasamaraooo49.workers.dev/', lang: 'hindi', api: 'url' },
  ],
};
