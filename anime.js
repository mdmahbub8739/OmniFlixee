(function (global) {
  'use strict';

  const AL_API   = 'https://graphql.anilist.co';
  const SWR_KEY  = 'omniflix_anilist_swr_v1';
  const SWR_TTL  = 1000 * 60 * 60 * 6;

  const _qCache   = new Map();
  const _pending  = new Map();

  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const html = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtScore = (n) => n ? (Math.round(n)/10).toFixed(1) : '—';

  function swrRead(key) {
    try {
      const raw = localStorage.getItem(SWR_KEY);
      if (!raw) return null;
      const all = JSON.parse(raw);
      const rec = all[key];
      if (!rec) return null;
      return { data: rec.d, stale: (Date.now() - rec.t) > SWR_TTL };
    } catch { return null; }
  }
  function swrWrite(key, data) {
    try {
      const raw = localStorage.getItem(SWR_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[key] = { d: data, t: Date.now() };
      localStorage.setItem(SWR_KEY, JSON.stringify(all));
    } catch {}
  }

  async function gql(query, variables = {}) {
    const key = JSON.stringify({ query, variables });
    if (_qCache.has(key)) return _qCache.get(key);
    if (_pending.has(key)) return _pending.get(key);
    const p = fetch(AL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    }).then(r => { if (!r.ok) throw new Error('AniList ' + r.status); return r.json(); })
      .then(j => { if (j.errors) throw new Error(j.errors[0].message); _qCache.set(key, j.data); _pending.delete(key); return j.data; })
      .catch(err => { _pending.delete(key); throw err; });
    _pending.set(key, p);
    return p;
  }

  async function gqlSwr(swrKey, query, variables, onData) {
    const cached = swrRead(swrKey);
    if (cached) {
      onData(cached.data, true);
      if (!cached.stale) return;
    }
    try {
      const fresh = await gql(query, variables);
      swrWrite(swrKey, fresh);
      onData(fresh, false);
    } catch (e) {
      if (!cached) throw e;
    }
  }

  const CARD_FRAG = `
    fragment Card on Media {
      id
      title { romaji english }
      coverImage { extraLarge large medium color }
      format averageScore seasonYear
      startDate { year }
    }
  `;

  const HERO_QUERY = `
    ${CARD_FRAG}
    query {
      trending: Page(perPage: 16) { media(type: ANIME, sort: TRENDING_DESC, isAdult: false) { ...Card } }
      hero: Page(perPage: 5) {
        media(type: ANIME, sort: TRENDING_DESC, status: RELEASING, isAdult: false) {
          ...Card bannerImage description(asHtml: false) genres
        }
      }
    }
  `;

  const RAILS_QUERY = `
    ${CARD_FRAG}
    query($season: MediaSeason, $year: Int) {
      season: Page(perPage: 16)  { media(type: ANIME, sort: POPULARITY_DESC, season: $season, seasonYear: $year, isAdult: false) { ...Card } }
      popular: Page(perPage: 16) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ...Card } }
      topRated: Page(perPage: 16){ media(type: ANIME, sort: SCORE_DESC, isAdult: false) { ...Card } }
      action: Page(perPage: 16)  { media(type: ANIME, sort: TRENDING_DESC, genre: "Action", isAdult: false) { ...Card } }
      romance: Page(perPage: 16) { media(type: ANIME, sort: TRENDING_DESC, genre: "Romance", isAdult: false) { ...Card } }
      adventure: Page(perPage: 16) { media(type: ANIME, sort: TRENDING_DESC, genre: "Adventure", isAdult: false) { ...Card } }
      comedy: Page(perPage: 16) { media(type: ANIME, sort: TRENDING_DESC, genre: "Comedy", isAdult: false) { ...Card } }
      drama: Page(perPage: 16)  { media(type: ANIME, sort: TRENDING_DESC, genre: "Drama", isAdult: false) { ...Card } }
      fantasy: Page(perPage: 16){ media(type: ANIME, sort: TRENDING_DESC, genre: "Fantasy", isAdult: false) { ...Card } }
      scifi: Page(perPage: 16)  { media(type: ANIME, sort: TRENDING_DESC, genre: "Sci-Fi", isAdult: false) { ...Card } }
      sliceOfLife: Page(perPage: 16) { media(type: ANIME, sort: TRENDING_DESC, genre: "Slice of Life", isAdult: false) { ...Card } }
      sports: Page(perPage: 16) { media(type: ANIME, sort: TRENDING_DESC, genre: "Sports", isAdult: false) { ...Card } }
      supernatural: Page(perPage: 16) { media(type: ANIME, sort: TRENDING_DESC, genre: "Supernatural", isAdult: false) { ...Card } }
      mystery: Page(perPage: 16){ media(type: ANIME, sort: TRENDING_DESC, genre: "Mystery", isAdult: false) { ...Card } }
      horror: Page(perPage: 16) { media(type: ANIME, sort: TRENDING_DESC, genre: "Horror", isAdult: false) { ...Card } }
      psychological: Page(perPage: 16) { media(type: ANIME, sort: TRENDING_DESC, genre: "Psychological", isAdult: false) { ...Card } }
      mecha: Page(perPage: 16)  { media(type: ANIME, sort: TRENDING_DESC, genre: "Mecha", isAdult: false) { ...Card } }
      music: Page(perPage: 16)  { media(type: ANIME, sort: TRENDING_DESC, genre: "Music", isAdult: false) { ...Card } }
      thriller: Page(perPage: 16) { media(type: ANIME, sort: TRENDING_DESC, genre: "Thriller", isAdult: false) { ...Card } }
    }
  `;

  // Airing schedule (Crunchyroll-style). AiringSchedule returns timestamps for
  // upcoming + recent episodes. We bucket by weekday on the client.
  const SCHEDULE_QUERY = `
    query($from: Int, $to: Int) {
      Page(perPage: 50) {
        airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
          airingAt
          episode
          media {
            id
            title { romaji english }
            coverImage { large medium color }
            format
            status
            averageScore
            isAdult
          }
        }
      }
    }
  `;

  const BROWSE_QUERY = `
    ${CARD_FRAG}
    query($page: Int, $perPage: Int, $sort: [MediaSort], $genre: String, $format: MediaFormat, $status: MediaStatus, $search: String) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage }
        media(type: ANIME, sort: $sort, genre: $genre, format: $format, status: $status, search: $search, isAdult: false) { ...Card }
      }
    }
  `;

  const RAIL_PAGE_QUERY = `
    ${CARD_FRAG}
    query($page: Int, $sort: [MediaSort], $genre: String, $season: MediaSeason, $seasonYear: Int, $status: MediaStatus) {
      Page(page: $page, perPage: 12) {
        pageInfo { hasNextPage }
        media(type: ANIME, sort: $sort, genre: $genre, season: $season, seasonYear: $seasonYear, status: $status, isAdult: false) { ...Card }
      }
    }
  `;

  function currentSeason() {
    const m = new Date().getMonth();
    const seasons = ['WINTER','WINTER','SPRING','SPRING','SPRING','SUMMER','SUMMER','SUMMER','FALL','FALL','FALL','WINTER'];
    return { season: seasons[m], year: new Date().getFullYear() };
  }

  function titleOf(m) { return m.title?.english || m.title?.romaji || 'Unknown'; }
  function coverOf(m) { return m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || ''; }
  function yearOf(m)  { return m.seasonYear || m.startDate?.year || ''; }
  function fmtFormat(f) { return ({ TV:'Series', TV_SHORT:'Short', MOVIE:'Film', SPECIAL:'Special', OVA:'OVA', ONA:'ONA', MUSIC:'Music' })[f] || f || ''; }

  function animeCard(m) {
    const poster = coverOf(m);
    const rating = m.averageScore ? `<span class="title-card__rating"><i class="ri-star-fill"></i> ${fmtScore(m.averageScore)}</span>` : '';
    const isFilm = m.format === 'MOVIE';
    const badge  = `<span class="title-card__badge">${isFilm ? 'Film' : 'Series'}</span>`;
    const art = poster
      ? `<img src="${poster}" alt="${html(titleOf(m))}" loading="lazy" decoding="async">`
      : `<div class="title-card__placeholder"><i class="ri-${isFilm ? 'film-line' : 'tv-2-line'}"></i></div>`;
    return `<a class="title-card" href="#" data-anilist="${m.id}" data-format="${m.format || ''}" data-poster="${html(poster)}" data-title="${html(titleOf(m))}">
      <div class="title-card__poster"><div class="title-card__shimmer"></div>${art}${rating}${badge}</div>
      <div class="title-card__meta">
        <div class="title-card__title">${html(titleOf(m))}</div>
        <div class="title-card__sub">${yearOf(m) || '—'}</div>
      </div>
    </a>`;
  }

  function skTitleCard() {
    return `<div class="sk-card"><div class="sk sk--poster"></div><div class="sk sk--line sk--line-lg"></div><div class="sk sk--line sk--line-sm"></div></div>`;
  }
  function skRail() {
    return `<div class="rail"><div class="rail__strip">${Array.from({length:7}, skTitleCard).join('')}</div></div>`;
  }
  function skHero() {
    return `<section class="hero an-hero-sk">
      <div class="an-hero-sk__bg"></div>
      <div class="hero__scrim"></div>
      <div class="hero__content">
        <div class="an-hero-sk__eyebrow"></div>
        <div class="an-hero-sk__title"></div>
        <div class="an-hero-sk__meta"></div>
        <div class="an-hero-sk__line"></div>
        <div class="an-hero-sk__line" style="width:70%"></div>
        <div class="an-hero-sk__actions">
          <div class="an-hero-sk__btn"></div>
          <div class="an-hero-sk__btn an-hero-sk__btn--ghost"></div>
        </div>
      </div>
    </section>`;
  }

  function section(id, title, sub, key, params) {
    return `<section class="section an-rail" id="${id}" data-rail-key="${key || ''}" data-rail-params='${params ? JSON.stringify(params) : ''}'>
      <header class="section__head">
        <div>
          <h2 class="section__title">${title}</h2>
          ${sub ? `<div class="section__sub">${sub}</div>` : ''}
        </div>
      </header>
      ${skRail()}
    </section>`;
  }

  function resolveAndOpen(anilistId /*, format, poster, title */) {
    if (global.OMNIFLIX && typeof global.OMNIFLIX.go === 'function') {
      global.OMNIFLIX.go(`/watch/anime/${anilistId}/1`);
    }
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'an-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('is-visible'));
    setTimeout(() => { t.classList.remove('is-visible'); setTimeout(() => t.remove(), 240); }, 2400);
  }

  function wireCards(root) {
    root.addEventListener('click', (e) => {
      const card = e.target.closest('.title-card[data-anilist]');
      if (!card) return;
      e.preventDefault();
      resolveAndOpen(+card.dataset.anilist, card.dataset.format || '', card.dataset.poster || '', card.dataset.title || '');
    });
  }

  function renderHeroSlide(m, i, active) {
    const hasBanner = !!m.bannerImage;
    const bg = m.bannerImage || coverOf(m);
    const score = m.averageScore || 0;
    const desc = (m.description || '').replace(/<[^>]+>/g, '').split('. ')[0].slice(0, 200);
    return `<div class="hero__slide ${active ? 'active' : ''}" data-i="${i}" data-bg-type="${hasBanner ? 'banner' : 'cover'}">
      <div class="hero__backdrop" style="background-image:url(${bg})"></div>
      <div class="hero__scrim"></div>
      <div class="hero__content">
        <span class="eyebrow"><span class="dot"></span> Featured · Anime</span>
        <h1 class="hero__title">${html(titleOf(m))}</h1>
        <div class="hero__meta">
          ${score ? `<span class="score"><i class="ri-star-fill"></i> ${score}%</span><span class="dot"></span>` : ''}
          <span>${yearOf(m) || ''}</span>
          <span class="dot"></span>
          <span class="mono">${fmtFormat(m.format).toUpperCase()}</span>
        </div>
        <p class="hero__synopsis">${html(desc)}${desc.length >= 200 ? '…' : ''}</p>
        <div class="hero__actions">
          <button class="btn-primary" data-anilist="${m.id}" data-format="${m.format || ''}" data-poster="${html(coverOf(m))}" data-title="${html(titleOf(m))}"><i class="ri-play-fill"></i> Watch now</button>
          <button class="btn-ghost" data-anilist="${m.id}" data-format="${m.format || ''}" data-poster="${html(coverOf(m))}" data-title="${html(titleOf(m))}"><i class="ri-information-line"></i> More info</button>
        </div>
      </div>
    </div>`;
  }

  function wireHero(wrap, items) {
    wrap.querySelectorAll('button[data-anilist]').forEach(b => {
      b.addEventListener('click', () => resolveAndOpen(+b.dataset.anilist, b.dataset.format, b.dataset.poster, b.dataset.title));
    });
    if (items.length < 2) return;
    const slides = wrap.querySelectorAll('.hero__slide');
    const dots = wrap.querySelector('.hero__dots');
    let idx = 0, timer = null;

    function setSlide(i) {
      idx = ((i % slides.length) + slides.length) % slides.length;
      slides.forEach((s, j) => s.classList.toggle('active', j === idx));
      if (dots) dots.querySelectorAll('button').forEach((d, j) => d.classList.toggle('active', j === idx));
    }
    function startTimer() {
      if (timer) clearInterval(timer);
      timer = setInterval(() => setSlide(idx + 1), 7000);
    }
    startTimer();

    if (dots) {
      dots.querySelectorAll('button').forEach((d, i) => d.addEventListener('click', () => {
        setSlide(i);
        startTimer();
      }));
    }

    let sx = 0, sy = 0, tracking = false;
    wrap.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (e.target.closest('button, a')) return;
      sx = e.clientX; sy = e.clientY; tracking = true;
    }, { passive: true });
    wrap.addEventListener('pointermove', () => {}, { passive: true });
    wrap.addEventListener('pointerup', (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        setSlide(idx + (dx < 0 ? 1 : -1));
        startTimer();
      }
    }, { passive: true });
    wrap.addEventListener('pointercancel', () => { tracking = false; }, { passive: true });
  }

  function paintHero(view, items) {
    const filtered = items.filter(m => m.bannerImage || coverOf(m)).slice(0, 5);
    if (!filtered.length) return;
    const html_ = `<section class="hero hero--anime">
      ${filtered.map((m, i) => renderHeroSlide(m, i, i === 0)).join('')}
      ${filtered.length > 1 ? `<div class="hero__dots">${filtered.map((_, i) => `<button class="${i===0?'active':''}" aria-label="Slide ${i+1}"></button>`).join('')}</div>` : ''}
    </section>`;
    const old = view.querySelector('.hero');
    if (old) old.outerHTML = html_;
    else view.insertAdjacentHTML('afterbegin', html_);
    wireHero(view.querySelector('.hero'), filtered);
  }

  function paintRail(view, sel, items) {
    const sec = view.querySelector(sel);
    if (!sec) return;
    const rail = sec.querySelector('.rail');
    if (!rail) return;
    if (!items?.length) { rail.outerHTML = '<p class="an-empty">No titles found.</p>'; return; }
    rail.innerHTML = `<div class="rail__strip">${items.map(animeCard).join('')}</div>`;
    setupRailInfinite(sec);
  }

  function setupRailInfinite(sec) {
    if (sec.dataset.infiniteWired === '1') return;
    sec.dataset.infiniteWired = '1';
    const strip = sec.querySelector('.rail__strip');
    const rail  = sec.querySelector('.rail');
    if (!strip || !rail) return;
    let page = 1, loading = false, exhausted = false;

    const sentinel = document.createElement('div');
    sentinel.className = 'an-rail-end';
    strip.appendChild(sentinel);

    const params = sec.dataset.railParams ? JSON.parse(sec.dataset.railParams) : null;
    if (!params) return;

    const io = new IntersectionObserver(async (entries) => {
      if (!entries[0].isIntersecting || loading || exhausted) return;
      loading = true;
      sentinel.classList.add('is-loading');
      try {
        page += 1;
        const data = await gql(RAIL_PAGE_QUERY, { ...params, page });
        const items = data.Page?.media || [];
        if (items.length) {
          const frag = document.createElement('div');
          frag.innerHTML = items.map(animeCard).join('');
          [...frag.children].forEach(c => strip.insertBefore(c, sentinel));
        }
        if (!data.Page?.pageInfo?.hasNextPage) {
          exhausted = true;
          sentinel.classList.add('is-done');
        }
      } catch {} finally {
        loading = false;
        sentinel.classList.remove('is-loading');
      }
    }, { root: rail, rootMargin: '0px 600px 0px 0px' });

    io.observe(sentinel);
  }

  // ─── Weekly airing schedule (Crunchyroll-style) ──────────────────────
  // Week boundaries (Mon → Sun, locale-agnostic). Returns { startSec, endSec }.
  function weekBounds() {
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // 0 = Mon
    const start = new Date(now); start.setHours(0,0,0,0); start.setDate(start.getDate() - day);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    return { startSec: Math.floor(start.getTime()/1000), endSec: Math.floor(end.getTime()/1000), todayIdx: day };
  }

  const WD_NAMES  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const WD_LONG   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  function renderScheduleSection() {
    return `<section class="section an-schedule-wrap" id="an-schedule">
      <header class="section__head">
        <div>
          <h2 class="section__title">Anime <em>schedule</em></h2>
          <div class="section__sub">Episodes airing this week · pick a day</div>
        </div>
      </header>
      <div class="an-sched-days" id="anSchedDays"></div>
      <div class="an-sched-list" id="anSchedList">${Array.from({length:6}, skTitleCard).join('')}</div>
    </section>`;
  }

  function schedCard(entry, nowSec) {
    const m = entry.media; if (!m) return '';
    const t = m.title?.english || m.title?.romaji || 'Unknown';
    const cover = m.coverImage?.large || m.coverImage?.medium || '';
    const d = new Date(entry.airingAt * 1000);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const aired = entry.airingAt < nowSec;
    return `<a class="an-sched-card ${aired ? 'is-aired' : ''}" href="#" data-anilist="${m.id}" data-title="${html(t)}">
      <div class="an-sched-card__art">
        ${cover ? `<img src="${cover}" loading="lazy" alt="">` : ''}
        <span class="an-sched-card__time">${time}</span>
      </div>
      <div class="an-sched-card__body">
        <div class="an-sched-card__title">${html(t)}</div>
        <div class="an-sched-card__ep">${aired ? 'Aired · ' : 'Airs · '}E${entry.episode}</div>
        <div class="an-sched-card__meta">
          ${fmtFormat(m.format) ? `<span>${fmtFormat(m.format)}</span>` : ''}
          ${m.averageScore ? `<span class="dot"></span><span><i class="ri-star-fill" style="color:var(--accent)"></i> ${fmtScore(m.averageScore)}</span>` : ''}
        </div>
      </div>
    </a>`;
  }

  async function loadSchedule(view) {
    const { startSec, endSec, todayIdx } = weekBounds();
    const daysEl = view.querySelector('#anSchedDays');
    const listEl = view.querySelector('#anSchedList');
    if (!daysEl || !listEl) return;

    let active = todayIdx;
    let buckets = Array.from({length:7}, () => []);

    daysEl.innerHTML = WD_NAMES.map((n, i) => {
      const d = new Date((startSec + i*86400) * 1000);
      const dom = d.getDate();
      return `<button class="an-sched-day ${i===active?'is-active':''} ${i===todayIdx?'is-today':''}" data-d="${i}">
        ${n}<small>${dom}</small>
      </button>`;
    }).join('');

    function paint() {
      const nowSec = Math.floor(Date.now()/1000);
      const items = buckets[active] || [];
      if (!items.length) {
        listEl.innerHTML = `<div class="an-sched-empty">No episodes airing on ${WD_LONG[active]}.</div>`;
        return;
      }
      listEl.innerHTML = items.map(e => schedCard(e, nowSec)).join('');
      listEl.querySelectorAll('a[data-anilist]').forEach(a => {
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          resolveAndOpen(+a.dataset.anilist);
        });
      });
    }

    daysEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.an-sched-day'); if (!btn) return;
      active = +btn.dataset.d;
      daysEl.querySelectorAll('.an-sched-day').forEach(x => x.classList.toggle('is-active', +x.dataset.d === active));
      paint();
    });

    try {
      const data = await gql(SCHEDULE_QUERY, { from: startSec, to: endSec });
      const all = (data?.Page?.airingSchedules || []).filter(x => x.media && !x.media.isAdult);
      all.forEach(x => {
        const d = new Date(x.airingAt * 1000);
        const idx = (d.getDay() + 6) % 7;
        buckets[idx].push(x);
      });
      paint();
    } catch (_) {
      listEl.innerHTML = `<div class="an-sched-empty">Couldn't load this week's schedule.</div>`;
    }
  }

  async function renderPage(view) {
    const tabs = [
      { id: 'discover', label: 'Discover',  icon: 'compass-3-line' },
      { id: 'schedule', label: 'Schedule',  icon: 'calendar-event-line' },
      { id: 'genres',   label: 'Genres',    icon: 'price-tag-3-line' },
      { id: 'browse',   label: 'Browse',    icon: 'function-line' },
    ];

    const initialTab = (location.hash || '').replace('#an-', '').replace('#', '');
    let active = tabs.find(t => t.id === initialTab)?.id || 'discover';

    view.innerHTML = `
      <header class="al-page-head">
        <span class="eyebrow"><span class="dot"></span> Anime · AniList</span>
        <h1 class="al-page-title">Watch <em>anime</em></h1>
        <p class="al-page-sub">Discovery, schedule, every genre — separated, so the page breathes.</p>
      </header>
      <nav class="al-tabs" role="tablist">
        ${tabs.map(t => `<button class="al-tab ${t.id===active?'is-active':''}" role="tab" data-tab="${t.id}"><i class="ri-${t.icon}"></i> ${t.label}</button>`).join('')}
      </nav>
      <div class="al-tab-body" id="alTabBody" data-tab=""></div>
    `;

    function switchTab(id) {
      active = id;
      $$('.al-tab', view).forEach(b => b.classList.toggle('is-active', b.dataset.tab === id));
      const body = $('#alTabBody', view);
      body.dataset.tab = id;
      body.innerHTML = '';
      const stillActive = () => body.dataset.tab === id;
      if (id === 'discover') renderDiscover(body, stillActive);
      else if (id === 'schedule') renderScheduleTab(body, stillActive);
      else if (id === 'genres') renderGenresTab(body, stillActive);
      else if (id === 'browse') renderBrowseTab(body, stillActive);
      try { history.replaceState(null, '', location.pathname + '#an-' + id); } catch(_){}
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    view.addEventListener('click', (e) => {
      const t = e.target.closest('.al-tab');
      if (!t) return;
      const id = t.dataset.tab;
      if (id !== active) switchTab(id);
    });

    wireCards(view);
    switchTab(active);
  }

  function renderDiscover(body, stillActive) {
    const { season, year } = currentSeason();
    body.innerHTML = `
      ${skHero()}
      ${section('an-trending', 'Trending <em>right now</em>', 'What the community is watching this week.', 'trending', { sort: ['TRENDING_DESC'] })}
      ${section('an-season',   `${season.charAt(0)+season.slice(1).toLowerCase()} <em>${year}</em>`, 'Currently airing this season.', 'season', { sort: ['POPULARITY_DESC'], season, seasonYear: year })}
      ${section('an-popular',  'Most <em>popular</em>', 'All-time fan favourites.', 'popular', { sort: ['POPULARITY_DESC'] })}
      ${section('an-toprated', '<em>Top</em>-rated', 'Highest community scores.', 'topRated', { sort: ['SCORE_DESC'] })}
    `;

    gqlSwr('hero', HERO_QUERY, {}, (data) => {
      if (!stillActive() || !body.isConnected) return;
      paintHero(body, data.hero?.media || []);
      paintRail(body, '#an-trending', data.trending?.media || []);
    });

    gqlSwr('rails:discover:' + season + year, `
      ${CARD_FRAG}
      query($season: MediaSeason, $year: Int) {
        season:   Page(perPage: 16) { media(type: ANIME, sort: POPULARITY_DESC, season: $season, seasonYear: $year, isAdult: false) { ...Card } }
        popular:  Page(perPage: 16) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) { ...Card } }
        topRated: Page(perPage: 16) { media(type: ANIME, sort: SCORE_DESC, isAdult: false) { ...Card } }
      }`, { season, year }, (data) => {
      if (!stillActive() || !body.isConnected) return;
      paintRail(body, '#an-season',   data.season?.media || []);
      paintRail(body, '#an-popular',  data.popular?.media || []);
      paintRail(body, '#an-toprated', data.topRated?.media || []);
    });
  }

  function renderScheduleTab(body) {
    body.innerHTML = `
      <section class="section an-schedule-wrap an-schedule-wrap--full" id="an-schedule">
        <header class="section__head">
          <div>
            <h2 class="section__title">This week's <em>schedule</em></h2>
            <div class="section__sub">Every airing episode, bucketed by weekday. Pick a day to drill in.</div>
          </div>
        </header>
        <div class="an-sched-days" id="anSchedDays"></div>
        <div class="an-sched-list" id="anSchedList">${Array.from({length:8}, skTitleCard).join('')}</div>
      </section>
    `;
    loadSchedule(body);
  }

  const GENRE_LIST = [
    { id: 'Action',        label: 'Action',        icon: 'sword-line' },
    { id: 'Adventure',     label: 'Adventure',     icon: 'compass-line' },
    { id: 'Romance',       label: 'Romance',       icon: 'heart-line' },
    { id: 'Comedy',        label: 'Comedy',        icon: 'emotion-laugh-line' },
    { id: 'Drama',         label: 'Drama',         icon: 'theater-line' },
    { id: 'Fantasy',       label: 'Fantasy',       icon: 'sparkling-2-line' },
    { id: 'Sci-Fi',        label: 'Sci-Fi',        icon: 'rocket-line' },
    { id: 'Slice of Life', label: 'Slice of Life', icon: 'cup-line' },
    { id: 'Sports',        label: 'Sports',        icon: 'basketball-line' },
    { id: 'Supernatural',  label: 'Supernatural',  icon: 'ghost-line' },
    { id: 'Mystery',       label: 'Mystery',       icon: 'search-eye-line' },
    { id: 'Horror',        label: 'Horror',        icon: 'skull-2-line' },
    { id: 'Psychological', label: 'Psychological', icon: 'brain-line' },
    { id: 'Mecha',         label: 'Mecha',         icon: 'robot-line' },
    { id: 'Thriller',      label: 'Thriller',      icon: 'flashlight-line' },
    { id: 'Music',         label: 'Music',         icon: 'music-2-line' },
  ];

  function renderGenresTab(body) {
    body.innerHTML = `
      <section class="section">
        <header class="section__head">
          <div>
            <h2 class="section__title">Browse by <em>genre</em></h2>
            <div class="section__sub">Pick a genre — the catalogue refreshes below.</div>
          </div>
        </header>
        <div class="al-genre-chips" id="alGenreChips">
          ${GENRE_LIST.map((g, i) => `<button class="al-genre-chip ${i===0?'is-active':''}" data-g="${g.id}"><i class="ri-${g.icon}"></i> ${g.label}</button>`).join('')}
        </div>
        <div class="browse-grid" id="alGenreGrid">${Array.from({length:18}, skTitleCard).join('')}</div>
        <div class="an-load-more"><button class="btn-ghost" id="alGenreLoadMore"><i class="ri-add-line"></i> Load more</button></div>
      </section>
    `;

    const state = { genre: GENRE_LIST[0].id, page: 1, hasMore: true, loading: false };
    const grid = $('#alGenreGrid', body);
    const loadBtn = $('#alGenreLoadMore', body);

    async function load(reset = false) {
      if (state.loading) return;
      state.loading = true;
      if (reset) { state.page = 1; state.hasMore = true; grid.innerHTML = Array.from({length:18}, skTitleCard).join(''); }
      try {
        const data = await gql(BROWSE_QUERY, {
          page: state.page, perPage: 24, sort: ['TRENDING_DESC'], genre: state.genre,
        });
        const items = data.Page?.media || [];
        if (reset) grid.innerHTML = '';
        else $$('.sk-card', grid).forEach(el => el.remove());
        grid.insertAdjacentHTML('beforeend', items.map(animeCard).join(''));
        state.hasMore = !!data.Page?.pageInfo?.hasNextPage;
        state.page++;
      } catch {
        if (reset) grid.innerHTML = '<p class="an-empty">Failed to load. Try again.</p>';
      }
      state.loading = false;
      if (loadBtn) loadBtn.style.display = state.hasMore ? '' : 'none';
    }

    $$('#alGenreChips .al-genre-chip', body).forEach(c => {
      c.addEventListener('click', () => {
        if (c.classList.contains('is-active')) return;
        $$('#alGenreChips .al-genre-chip', body).forEach(x => x.classList.remove('is-active'));
        c.classList.add('is-active');
        state.genre = c.dataset.g;
        load(true);
      });
    });
    loadBtn?.addEventListener('click', () => load(false));
    load(true);
  }

  function renderBrowseTab(body) {
    body.innerHTML = `
      <section class="section" id="an-browse">
        <header class="section__head">
          <div>
            <h2 class="section__title">Browse the <em>catalogue</em></h2>
            <div class="section__sub">Filter the full AniList catalogue.</div>
          </div>
        </header>
        <div class="chips" id="anFilters" style="margin-bottom:14px">
          <button class="chip active" data-filter="sort" data-value="TRENDING_DESC">Trending</button>
          <button class="chip" data-filter="sort" data-value="POPULARITY_DESC">Popular</button>
          <button class="chip" data-filter="sort" data-value="SCORE_DESC">Top rated</button>
          <button class="chip" data-filter="sort" data-value="START_DATE_DESC">Newest</button>
        </div>
        <div class="chips" id="anGenres" style="margin-bottom:14px">
          <button class="chip active" data-filter="genre" data-value="">All genres</button>
          ${['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller','Psychological','Mecha','Ecchi'].map(g =>
            `<button class="chip" data-filter="genre" data-value="${g}">${g}</button>`).join('')}
        </div>
        <div class="browse-grid" id="anBrowseGrid">${Array.from({length:18}, skTitleCard).join('')}</div>
        <div class="an-load-more"><button class="btn-ghost" id="anLoadMore"><i class="ri-add-line"></i> Load more</button></div>
      </section>
    `;
    setupBrowse(body);
  }

  function setupBrowse(view) {
    const state = { sort: 'TRENDING_DESC', genre: '', format: '', status: '', search: '', page: 1, hasMore: true, loading: false };
    const grid = view.querySelector('#anBrowseGrid');
    const loadBtn = view.querySelector('#anLoadMore');

    async function load(reset = false) {
      if (state.loading) return;
      if (reset) { state.page = 1; state.hasMore = true; grid.innerHTML = Array.from({length:18}, skTitleCard).join(''); }
      if (!state.hasMore) return;
      state.loading = true;
      try {
        const vars = {
          page: state.page, perPage: 24, sort: [state.sort],
          ...(state.genre && { genre: state.genre }),
          ...(state.format && { format: state.format }),
          ...(state.status && { status: state.status }),
          ...(state.search && { search: state.search }),
        };
        const data = await gql(BROWSE_QUERY, vars);
        const items = data.Page?.media || [];
        if (reset) grid.innerHTML = '';
        else $$('.sk-card', grid).forEach(el => el.remove());
        grid.insertAdjacentHTML('beforeend', items.map(animeCard).join(''));
        state.hasMore = !!data.Page?.pageInfo?.hasNextPage;
        state.page++;
      } catch {
        if (reset) grid.innerHTML = '<p class="an-empty">Failed to load. Try again.</p>';
      }
      state.loading = false;
      if (loadBtn) loadBtn.style.display = state.hasMore ? '' : 'none';
    }

    function bindChips(containerSel, key) {
      view.querySelectorAll(`${containerSel} .chip`).forEach(c => {
        c.addEventListener('click', () => {
          view.querySelectorAll(`${containerSel} .chip`).forEach(x => x.classList.remove('active'));
          c.classList.add('active');
          state[key] = c.dataset.value || '';
          load(true);
        });
      });
    }
    bindChips('#anFilters', 'sort');
    bindChips('#anGenres', 'genre');
    loadBtn?.addEventListener('click', () => load(false));
    load(true);
  }

  function initTopnavAutoHide() {
    if (window.__anTopnavWired) return;
    window.__anTopnavWired = true;
    const nav = document.querySelector('.topnav');
    if (!nav) return;
    let last = window.scrollY, ticking = false, idleTimer = null;
    function update() {
      const y = window.scrollY;
      const delta = y - last;
      if (y < 30) { nav.classList.remove('an-nav-hidden'); nav.classList.remove('an-nav-solid'); }
      else { nav.classList.add('an-nav-solid'); }
      if (Math.abs(delta) > 5) {
        if (delta > 0 && y > 80) nav.classList.add('an-nav-hidden');
        else nav.classList.remove('an-nav-hidden');
        last = y;
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => nav.classList.remove('an-nav-hidden'), 1200);
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }
  initTopnavAutoHide();

  global.AniListModule = { renderPage };
})(window);
