# OMNIFLIX anime sync — fixes (verified live)

## Root cause
toonstream.vip / animesalt.ac / animedekho.app all use the torofilm/dooplay theme:
a single series page holds every season (`data-season` 1..N) and the episode label
after `x` / `E` is an ABSOLUTE continuous number (e.g. Naruto Shippuden S2 starts at
33, S3 at 54, S16 at 359). The frontend gets anime from AniList, where each season is
a separate entry numbered 1..N. The old code always sent `season=1` and, on a miss,
silently grabbed any same-numbered episode from season 1 -> wrong content.

## Workers (/details now emit both numbering systems)
Each episode: `{ season, episode (per-season 1..N), abs_episode (site absolute), title, url, image }`.
Episodes are sorted by absolute number per season before positions are assigned, so
order is correct regardless of DOM order.
- worker-animesalt.js : episode no longer read from the `num-epi` span (that held the
  absolute number); per-season position is derived, absolute kept as abs_episode.
- worker-toonstream.js : `/details` season/episode made reliable; switched to api:'url'.
- worker-animedekho.js : per-season position derived per `ul.seasons-lst`, absolute kept.

## Frontend
- config.js     : ToonStream `api:'legacy'` -> `api:'url'` (all three share one path).
- app.js        : `_detectAnimeSeason()` reads the real season from the AniList title
  (Season N / Nth Season / Part N / Cour N / trailing roman numerals).
- app.js        : `_pickAnimeEpisode()` resolves by (season + per-season episode), then
  absolute episode, then positional fallbacks — never the old blind same-number grab.
- app.js        : season passed through resolve + prefetch + manual-match instead of `1`.
- anime.css     : removed a stale `.anime-match-manual{display:flex}` rule that squashed
  the manual-search card; the card now stacks correctly.

## Verified live
Built episode lists from live HTML for all three sites and ran the real app.js picker:
per-season AniList (S3 ep5 -> 3x58) and absolute AniList (ep58 -> 3x58) both resolve
to the correct episode URL.

## Deploy
1. Deploy each workers/worker-*.js to Cloudflare (paste-and-deploy, module syntax).
2. Put your three *.workers.dev URLs into config.js -> ANIME_WORKERS.
3. Host the site (static).
