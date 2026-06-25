/* ========================================================================= *
 * OmniFlix · Stellar Player                                                 *
 * Drop-in multi-source video embed without auto-fallback.                  *
 * * Public, source-agnostic API: * player.playMovie(tmdbId) * player.playEpisode(tmdbId, season, episode) * player.next() // manually jump to next source * player.setSource(index) // force a specific source * player.listSources() // [{ index, name }] * player.currentSourceName() * * Sources are exposed to the UI under majestic constellation names ONLY. * No provider domain is leaked through any public surface. * ========================================================================= */
(function(global) {
  'use strict';

  // ── Provider origins (used only internally) ────────────────────────────────
  const O_SS = 'https://screenscape.me'; // ScreenScape (Primary)
  const O_A = 'https://web.nxsha.app';   // Aurora / Halo / Orion / Vega
  const O_B = 'https://cinemaos.tech';   // Nebula
  const O_C = 'https://peachify.top';    // Eclipse / Lumen / Solstice
  const O_VR = 'https://vidrock.ru';     // Stellar (VidRock)

  const TRUSTED_ORIGINS = [O_SS, O_A, O_B, O_C, O_VR];
  const PROGRESS_STORAGE_KEY = 'peachifyProgress'; // kept for cross-source resume

  // ── helpers ────────────────────────────────────────────────────────────────
  function validId(id) {
    if (id == null) return false;
    if (typeof id === 'number') return Number.isFinite(id) && id > 0;
    if (typeof id !== 'string') return false;
    if (/^\d+$/.test(id)) return true;
    if (/^tt\d{6,}$/.test(id)) return true;
    return false;
  }

  function readProgressStore() {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function writeProgressStore(store) {
    try {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(store));
    } catch (_) {}
  }

  function resumeFor(ctx) {
    const store = readProgressStore();
    const rec = store[String(ctx.id)];
    if (!rec) return 0;
    if (ctx.type === 'tv') {
      const key = `s${ctx.season}e${ctx.episode}`;
      const ep = rec.show_progress && rec.show_progress[key];
      return ep && ep.progress ? Math.floor(ep.progress.watched || 0) : 0;
    }
    return rec.progress ? Math.floor(rec.progress.watched || 0) : 0;
  }

  // ── URL builders ───────────────────────────────────────────────────────────
  function buildScreenscapeUrl(ctx, opts = {}) {
    const p = new URLSearchParams();
    
    // Automatically determine whether to use tmdb or imdb parameter
    if (typeof ctx.id === 'string' && /^tt\d+/.test(ctx.id)) {
      p.set('imdb', ctx.id);
    } else {
      p.set('tmdb', String(ctx.id));
    }
    
    p.set('type', ctx.type);
    
    if (ctx.type === 'tv') {
      if (ctx.season != null) p.set('s', String(ctx.season));
      if (ctx.episode != null) p.set('e', String(ctx.episode));
    }
    
    // Enforce default language preference to Hindi as requested
    p.set('lan', opts.lan || 'hindi');
    
    return `${O_SS}/embed?${p.toString()}`;
  }

  function buildVidrockUrl(ctx /*, opts */ ) {
    const path = ctx.type === 'tv' ? `/tv/${ctx.id}/${ctx.season}/${ctx.episode}` : `/movie/${ctx.id}`;
    return `${O_VR}${path}`;
  }

  function buildAuroraUrl(ctx, opts = {}) {
    const path = ctx.type === 'tv' ? `/embed/tv/${ctx.id}/${ctx.season}/${ctx.episode}` : `/embed/movie/${ctx.id}`;
    const p = new URLSearchParams();
    if (opts.lang) p.set('lang', opts.lang);
    if (opts.sub) p.set('sub', opts.sub);
    if (opts.server) p.set('server', opts.server);
    p.set('one_server', 'true');
    const qs = p.toString();
    return `${O_A}${path}${qs ? '?' + qs : ''}`;
  }

  function buildNebulaUrl(ctx, opts = {}) {
    const path = ctx.type === 'tv' ? `/player/${ctx.id}/${ctx.season}/${ctx.episode}` : `/player/${ctx.id}`;
    const p = new URLSearchParams();
    if (opts.accent) p.set('theme', String(opts.accent).replace('#', ''));
    if (opts.autoPlay !== false) p.set('autoPlay', 'true');
    p.set('title', 'false');
    p.set('poster', 'false');
    if (ctx.type === 'tv') {
      if (opts.autoNext != null) p.set('autoNext', String(opts.autoNext));
      if (opts.showNextBtn === false) p.set('nextButton', 'false');
    }
    const startAt = opts.startAt != null ? opts.startAt : resumeFor(ctx);
    if (startAt && startAt > 5) p.set('startTime', Math.floor(startAt));
    return `${O_B}${path}?${p.toString()}`;
  }

  function buildPeachifyUrl(ctx, opts = {}) {
    const path = ctx.type === 'tv' ? `/embed/tv/${ctx.id}/${ctx.season}/${ctx.episode}` : `/embed/movie/${ctx.id}`;
    const p = new URLSearchParams();
    if (opts.dub) p.set('dub', opts.dub);
    if (opts.audio) p.set('audio', opts.audio);
    if (opts.sub) p.set('sub', opts.sub);
    if (opts.subtitle) p.set('subtitle', opts.subtitle);
    if (opts.quality) p.set('quality', String(opts.quality));
    if (opts.server) p.set('server', opts.server);
    if (opts.api) p.set('api', opts.api);
    if (opts.accent) p.set('accent', String(opts.accent).replace('#', ''));
    if (opts.autoPlay === false) p.set('autoPlay', 'false');
    if (ctx.type === 'tv') {
      if (opts.autoNext != null) p.set('autoNext', String(opts.autoNext));
      if (opts.showNextBtn === false) p.set('showNextBtn', 'false');
    }
    const startAt = opts.startAt != null ? opts.startAt : resumeFor(ctx);
    if (startAt && startAt > 5) p.set('startAt', Math.floor(startAt));

    const isHide = (v) => v === false || v === 0 || v === 'false' || v === '0' || v === 'off' || v === 'hide';
    const hideKeys = ['pip', 'cast', 'fullscreen', 'volume', 'servers', 'captions', 'quality', 'play', 'rewind', 'forward', 'timegroup', 'timeslider', 'settings'];
    if (opts.hide && typeof opts.hide === 'object') {
      hideKeys.forEach(k => {
        if (isHide(opts.hide[k])) p.set(k, 'hide');
      });
    }
    const qs = p.toString();
    return `${O_C}${path}${qs ? '?' + qs : ''}`;
  }

  function buildMegaPlayUrl(ctx, opts = {}) {
    return `https://megaplay.buzz/stream/ani/${ctx.id}/${ctx.episode || 1}/${opts.lan === 'dub' ? 'dub' : 'sub'}`;
  }

  // ── Server list ────────────────────────────────────────────────────────────
  // Order matters: index 0 is the default first-play server.
  // For anime: Stellar servers (screenscape → vidrock etc.) come first —
  // they use the AniZip-resolved TMDB/IMDb id. MegaPlay Sub/Dub sit at the
  // end of the list; the source-modal in app.js folds them under "Load more"
  // for anime while showing them normally for movie/tv (where they don't appear
  // because _effectiveServers() filters out megaplay for non-anime contexts).
  function defaultChain() {
    return [
      // ── Stellar servers (primary for both movie/tv AND anime) ──────────────
      { name: 'ScreenScape',  kind: 'screenscape', opts: { lan: 'hindi' } },
      { name: 'Aurora-Hindi', kind: 'aurora',      opts: { lang: 'hi' } },
      { name: 'Lumen-Hindi',  kind: 'peachify',    opts: { dub: 'Hindi' } },
      { name: 'Nebula',       kind: 'nebula',       opts: {} },
      { name: 'Orion-Hindi',  kind: 'aurora',      opts: { server: 'ZetPly-[Multi-Lang]', lang: 'hi' } },
      { name: 'Stellar',      kind: 'vidrock',      opts: {} },
      { name: 'Eclipse',      kind: 'peachify',    opts: { dub: 'Hindi' } },
      { name: 'Solstice',     kind: 'peachify',    opts: { dub: 'Hindi' } },
      { name: 'Halo',         kind: 'aurora',      opts: { server: 'MbPly-[Multi-Lang]', lang: 'hi' } },
      { name: 'OrVid',        kind: 'aurora',      opts: { server: 'OrVid-[Multi-Lang]', lang: 'hi' } },
      { name: 'Vega',         kind: 'aurora',      opts: { server: 'Xuhd-[Multi-Lang]', lang: 'hi' } },
      // ── MegaPlay — anime-only; folded under "Load more" by source modal ───
      { name: 'MegaPlay (Sub)', kind: 'megaplay', opts: { lan: 'sub' } },
      { name: 'MegaPlay (Dub)', kind: 'megaplay', opts: { lan: 'dub' } },
    ];
  }

  // ── main class ─────────────────────────────────────────────────────────────
  class StellarPlayer {
    constructor(target, options = {}) {
      this.host = (typeof target === 'string') ? document.querySelector(target) : target;
      if (!this.host) throw new Error('StellarPlayer: target element not found');

      this.opts = Object.assign({
        accent: null,
        autoPlay: true,
        autoNext: true,
        showNextBtn: true,
        hide: null,
        servers: defaultChain(),
        onEvent: null,
        onProgress: null,
        onSourceChange: null,
        onLoading: null
      }, options || {});

      this.ctx = null;
      this.serverIndex = 0;
      this._iframe = null;
      this._installListener();
    }

    // ----- public API --------------------------------------------------------
    playMovie(id, perCallOpts) {
      if (!validId(id)) {
        console.warn('StellarPlayer: invalid id', id);
        return false;
      }
      this.ctx = { type: 'movie', id, _opts: perCallOpts || {} };
      this.serverIndex = 0;
      this._mount();
      return true;
    }

    playEpisode(id, season, episode, perCallOpts) {
      if (!validId(id)) {
        console.warn('StellarPlayer: invalid id', id);
        return false;
      }
      this.ctx = { type: 'tv', id, season, episode, _opts: perCallOpts || {} };
      this.serverIndex = 0;
      this._mount();
      return true;
    }

    // playAnime: tries AniZip first to get a TMDB/IMDb ID so the Stellar
    // servers (ScreenScape, Nebula, Peachify, Aurora, Vidrock) can serve the
    // episode. Falls back to a pure MegaPlay context when AniZip has no
    // mapping for the title. The ctx.type is always 'anime' so the source
    // modal fold logic can distinguish it from movie/tv contexts.
    playAnime(anilistId, episode, perCallOpts) {
      // Set anime context immediately so MegaPlay can fire right away
      this.ctx = { type: 'anime', id: anilistId, episode: episode, _opts: perCallOpts || {} };
      this.serverIndex = 0;
      this._mount(); // starts on first Stellar server (index 0)

      // Async: fetch AniZip mapping in background; if we get a TMDB/IMDb id,
      // patch ctx so Stellar URL builders use the correct id/type while keeping
      // type='anime' so fold grouping still works.
      fetch(`https://api.ani.zip/mappings?anilist_id=${anilistId}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(data => {
          if (!data || !this.ctx || this.ctx.id !== anilistId) return;
          const tmdbId  = data.mappings?.themoviedb_id;
          const imdbId  = data.mappings?.imdb_id;
          const isMovie = data.mappings?.type === 'movie';
          if (tmdbId || imdbId) {
            // Patch the context: keep type='anime' for UI grouping, but store
            // the resolved id and whether it maps to a movie or a TV series.
            this.ctx._stellarId   = imdbId || String(tmdbId);
            this.ctx._stellarType = isMovie ? 'movie' : 'tv';
          }
          // Already playing — no need to re-mount unless user switches server
        });

      return true;
    }

    next() {
      this._rotate('manual next()');
    }

    setSource(i) {
      const list = this._effectiveServers();
      if (i < 0 || i >= list.length) return;
      this.serverIndex = i;
      this._mount();
    }

    listSources() {
      return this._effectiveServers().map((s, i) => ({ index: i, name: s.name }));
    }

    currentSourceName() {
      const s = this._effectiveServers()[this.serverIndex];
      return s ? s.name : null;
    }

    // Context-aware filter:
    //   • Anime contexts see ALL server kinds — Stellar servers (screenscape,
    //     aurora, nebula, peachify, vidrock) come first in defaultChain() and
    //     act as primary; megaplay + scraped embeds are present too and are
    //     folded into "Load more" by the source-modal UI in app.js.
    //   • Movie / TV contexts see everything EXCEPT the anime-only kinds.
    _effectiveServers() {
      const all = this.opts.servers || [];
      const isAnime = this.ctx && this.ctx.type === 'anime';
      const ANIME_ONLY_KINDS = ['megaplay', 'embed'];
      // Anime gets every server; movie/tv skips the anime-only kinds.
      return isAnime ? all : all.filter(s => !ANIME_ONLY_KINDS.includes(s.kind));
    }

    // Append extra sources at runtime WITHOUT disturbing current playback or
    // the active index (used by the anime watch page once the scraper workers
    // return their embed links). Duplicate URLs are skipped.
    appendSources(list) {
      if (!Array.isArray(list) || !list.length) return;
      const existing = new Set((this.opts.servers || []).map(s => s.url).filter(Boolean));
      const fresh = list.filter(s => !s.url || !existing.has(s.url));
      if (!fresh.length) return;
      this.opts.servers = (this.opts.servers || []).concat(fresh);
      if (typeof this.opts.onSourcesChange === 'function') {
        this.opts.onSourcesChange(this.listSources());
      }
    }

    destroy() {
      this.host.innerHTML = '';
      this._iframe = null;
      window.removeEventListener('message', this._onMessage);
    }

    // back-compat alias methods
    setServer(i) { return this.setSource(i); }
    listServers() { return this.listSources(); }
    currentServerName() { return this.currentSourceName(); }

    // ----- internals ---------------------------------------------------------
    _mount() {
      if (!this.ctx) return;
      const list = this._effectiveServers();
      const srv = list[this.serverIndex];
      if (!srv) return;

      const merged = Object.assign({
        accent: this.opts.accent,
        autoPlay: this.opts.autoPlay,
        autoNext: this.opts.autoNext,
        showNextBtn: this.opts.showNextBtn,
        hide: this.opts.hide
      }, srv.opts || {}, this.ctx._opts || {});

      // For anime contexts, Stellar servers (non-megaplay, non-embed) use the
      // AniZip-resolved TMDB/IMDb id and type instead of the raw AniList id.
      const ANIME_ONLY_KINDS = ['megaplay', 'embed'];
      const isAnime  = this.ctx.type === 'anime';
      const isStellar = isAnime && !ANIME_ONLY_KINDS.includes(srv.kind);
      let buildCtx = this.ctx;
      if (isStellar && this.ctx._stellarId) {
        buildCtx = Object.assign({}, this.ctx, {
          id:      this.ctx._stellarId,
          type:    this.ctx._stellarType || 'tv',
          season:  1,
          episode: this.ctx.episode || 1,
        });
      } else if (isStellar) {
        // AniZip not resolved yet — play MegaPlay Sub as instant fallback
        // while the background fetch completes, then user can switch manually.
        buildCtx = Object.assign({}, this.ctx); // keep anime type, megaplay builder handles it
      }

      let url;
      if      (srv.kind === 'screenscape') url = buildScreenscapeUrl(buildCtx, merged);
      else if (srv.kind === 'vidrock')     url = buildVidrockUrl(buildCtx, merged);
      else if (srv.kind === 'aurora')      url = buildAuroraUrl(buildCtx, merged);
      else if (srv.kind === 'nebula')      url = buildNebulaUrl(buildCtx, merged);
      else if (srv.kind === 'megaplay')    url = buildMegaPlayUrl(this.ctx, merged);
      else if (srv.kind === 'embed')       url = srv.url;
      else                                 url = buildPeachifyUrl(buildCtx, merged);

      // signal loading
      if (typeof this.opts.onLoading === 'function') this.opts.onLoading(true, srv.name);
      if (typeof this.opts.onSourceChange === 'function') this.opts.onSourceChange(srv.name, this.serverIndex);

      // Replace iframe
      this.host.innerHTML = '';
      const ifr = document.createElement('iframe');
      ifr.src = url;
      ifr.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#000;';
      ifr.setAttribute('allowfullscreen', '');
      ifr.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write');
      ifr.setAttribute('referrerpolicy', 'origin');
      ifr.setAttribute('loading', 'eager');
      this._iframe = ifr;
      this.host.appendChild(ifr);
    }

    _rotate(reason) {
      const list = this._effectiveServers();
      const next = this.serverIndex + 1;
      if (next >= list.length) {
        console.warn('[StellarPlayer] All sources exhausted —', reason);
        if (typeof this.opts.onLoading === 'function') {
          this.opts.onLoading(false, this.currentSourceName(), 'exhausted');
        }
        return;
      }
      this.serverIndex = next;
      const name = list[next].name;
      console.info('[StellarPlayer] Manually switching to', name, '—', reason);
      this._mount();
    }

    _installListener() {
      this._onMessage = (event) => {
        if (!TRUSTED_ORIGINS.includes(event.origin)) return;
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        // Core platform sync data
        if (msg.type === 'MEDIA_DATA' && msg.data) {
          const store = readProgressStore();
          if (Array.isArray(msg.data)) {
            msg.data.forEach((rec) => {
              if (!rec || rec.id == null) return;
              store[String(rec.id)] = rec;
            });
          } else {
            Object.keys(msg.data).forEach(k => {
              const rec = msg.data[k];
              if (!rec) return;
              const key = rec.id != null ? String(rec.id) : String(k).replace(/^m/, '');
              store[key] = rec;
            });
          }
          writeProgressStore(store);
          try {
            localStorage.setItem('vidRockProgress', JSON.stringify(Object.values(store)));
          } catch (_) {}
          if (typeof this.opts.onProgress === 'function') this.opts.onProgress(store);
        }

        if (msg.type === 'PLAYER_EVENT' && msg.data) {
          if (typeof this.opts.onLoading === 'function') this.opts.onLoading(false, this.currentSourceName());
          if (typeof this.opts.onEvent === 'function') this.opts.onEvent(msg.data);
          const ev = msg.data.event;
          if (ev === 'error' || ev === 'no_sources' || ev === 'sources_failed') {
            console.warn('[StellarPlayer] Source reported error. Auto-switching disabled: ' + ev);
          }
        }
      };
      window.addEventListener('message', this._onMessage);
    }
  }

  // Expose
  StellarPlayer.defaultChain = defaultChain;
  global.StellarPlayer = StellarPlayer;
  global.PeachifyPlayer = StellarPlayer; // Back-compat alias
})(typeof window !== 'undefined' ? window : globalThis);
