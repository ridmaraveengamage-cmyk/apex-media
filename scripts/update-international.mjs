// Collects international racing news and results for the International tab.
// Runs on GitHub Actions every 30 minutes (Node 20+, no dependencies) and writes:
//   data/international.json  - headlines for every major series, from public RSS feeds
//   data/results.json        - results, standings and calendars for F1, MotoGP and NASCAR Cup
// If a source fails, its previous data is kept, so the site never goes blank.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';

const UA = 'ApexMediaBot/1.0 (+https://github.com/ridmaraveengamage-cmyk/apex-media)';
const PER_FEED = 15;         // newest items taken from each feed
const PER_SERIES = 15;       // max stories kept per series
const MAX_ITEMS = 180;       // max stories kept in total
const MAX_AGE_DAYS = 21;     // older stories are dropped

const MS = 'https://www.motorsport.com/rss';
const AS = 'https://www.autosport.com/rss';
// `series` set = every story in that feed belongs to that series.
// No `series` = general feed; the series is worked out from the story.
const FEEDS = [
  { name: 'Motorsport.com', url: `${MS}/all/news/` },
  { name: 'Autosport', url: `${AS}/feed/all` },
  { name: 'The Race', url: 'https://www.the-race.com/feed/' },
  { name: 'RaceFans', url: 'https://www.racefans.net/feed/' },
  { name: 'Formula1.com', url: 'https://www.formula1.com/en/latest/all.xml', series: 'F1' },
  { name: 'Crash.net', url: 'https://www.crash.net/rss/f1', series: 'F1' },
  { name: 'Motorsport.com', url: `${MS}/motogp/news/`, series: 'MotoGP' },
  { name: 'Autosport', url: `${AS}/motogp/news/`, series: 'MotoGP' },
  { name: 'Motorsport.com', url: `${MS}/wec/news/`, series: 'WEC' },
  { name: 'Autosport', url: `${AS}/le-mans/news/`, series: 'WEC' },
  { name: 'Motorsport.com', url: `${MS}/wrc/news/`, series: 'WRC' },
  { name: 'Motorsport.com', url: `${MS}/indycar/news/`, series: 'IndyCar' },
  { name: 'Motorsport.com', url: `${MS}/nascar-cup/news/`, series: 'NASCAR' },
  { name: 'Motorsport.com', url: `${MS}/formula-e/news/`, series: 'Formula E' },
  { name: 'Motorsport.com', url: `${MS}/wsbk/news/`, series: 'WorldSBK' },
  { name: 'Motorsport.com', url: `${MS}/imsa/news/`, series: 'IMSA' },
  { name: 'Motorsport.com', url: `${MS}/dtm/news/`, series: 'DTM' },
  { name: 'Motorsport.com', url: `${MS}/super-formula/news/`, series: 'Super Formula' },
  { name: 'Autosport', url: `${AS}/supercars/news/`, series: 'Supercars' },
  { name: 'Autosport', url: `${AS}/btcc/news/`, series: 'BTCC' },
  { name: 'Motorsport.com', url: `${MS}/f2/news/`, series: 'F2 / F3' },
  { name: 'Motorsport.com', url: `${MS}/f3/news/`, series: 'F2 / F3' },
  { name: 'Motorsport.com', url: `${MS}/dakar/news/`, series: 'Dakar' },
  { name: 'eKartingNews', url: 'https://www.ekartingnews.com/feed/', series: 'Karting' }
];

// For general feeds: first match wins (checked against categories, then URL, then title).
const SERIES = [
  ['MotoGP', /\bmotogp\b|\bmoto2\b|\bmoto3\b/i],
  ['WorldSBK', /superbike|\bwsbk\b|\bworldsbk\b/i],
  ['IMSA', /\bimsa\b|daytona 24|petit le mans/i],
  ['WEC', /\bwec\b|world endurance|le mans|hypercar/i],
  ['WRC', /\bwrc\b|world rally|\brally\b/i],
  ['Formula E', /formula[ -]?e\b/i],
  ['IndyCar', /indycar|indy 500|indianapolis 500/i],
  ['NASCAR', /nascar/i],
  ['DTM', /\bdtm\b/i],
  ['Super Formula', /super formula/i],
  ['Supercars', /supercars|bathurst/i],
  ['BTCC', /\bbtcc\b|british touring car/i],
  ['Dakar', /\bdakar\b/i],
  ['F2 / F3', /\bf2\b|\bf3\b|formula 2|formula 3/i],
  ['Karting', /karting|\bkart\b|\biame\b|\brotax\b/i],
  ['F1', /\bf1\b|formula[ -]?1|formula one|grand prix/i]
];

// Headlines that report a result (race win, title, pole, podium).
const RESULT = /\bwins?\b|\bwon\b|victory|victorious|triumph|clinch|crowned|takes? (the )?(win|victory|title|crown|pole)|claims? (the )?(win|victory|title|crown|pole|maiden)|race results?|\bpodium\b|\b1-2\b|on pole|takes pole/i;
const NOT_RESULT = /\b(how|why|what|can|could|would|will|if|chance|bid|hopes?|needs?|preview|to win|watch|odds|bets?|predictions?)\b/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, type = 'text') {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return type === 'json' ? await res.json() : await res.text();
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(1500 * attempt);
    }
  }
}
async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

/* ---------- RSS / Atom parsing (small, tolerant, no dependencies) ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
const stripTags = s => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}
function attr(block, name, attribute) {
  const m = block.match(new RegExp(`<${name}\\b[^>]*\\b${attribute}=["']([^"']+)["']`, 'i'));
  return m ? decode(m[1]) : '';
}
function cleanUrl(u) {
  try {
    const url = new URL(decode(u).trim());
    [...url.searchParams.keys()].filter(k => k.startsWith('utm_')).forEach(k => url.searchParams.delete(k));
    return url.toString();
  } catch { return ''; }
}
function excerpt(text, max = 220) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,.;:\s]+$/, '') + '…';
}
function detectSeries(cats, url, title) {
  for (const hay of [cats.join(' | '), url, title]) {
    for (const [name, re] of SERIES) if (re.test(hay)) return name;
  }
  return 'Motorsport';
}

function parseFeed(xml, feed) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, PER_FEED).map(b => {
    const title = stripTags(tag(b, 'title')).replace(/\s+\|\s+[^|]{2,30}$/, ''); // drop " | Formula 1" style suffixes
    const link = cleanUrl(stripTags(tag(b, 'link')) || attr(b, 'link', 'href'));
    const date = new Date(stripTags(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')));
    const cats = [...b.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map(m => stripTags(m[1]));
    const desc = stripTags(tag(b, 'description') || tag(b, 'summary'));
    const image =
      attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') ||
      (/<enclosure\b[^>]*type=["']image/i.test(b) ? attr(b, 'enclosure', 'url') : '') ||
      attr(decode(tag(b, 'content:encoded') || tag(b, 'description')), 'img', 'src');
    return {
      title, url: link, source: feed.name,
      date: isNaN(date) ? null : date.toISOString(),
      series: feed.series || detectSeries(cats, link, title),
      result: RESULT.test(title) && !NOT_RESULT.test(title),
      summary: excerpt(desc),
      image: image && image.startsWith('https://') ? image : null
    };
  }).filter(i => i.title && i.url);
}

// Same story from two outlets: keep the first (newest) one.
const words = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 3);
function isDuplicate(a, b) {
  if (a.url === b.url) return true;
  const A = new Set(words(a.title)), B = words(b.title);
  if (!A.size || !B.length) return false;
  const shared = B.filter(w => A.has(w)).length;
  return shared >= 4 && shared / Math.min(A.size, B.length) >= 0.6;
}

async function updateNews() {
  const previous = await readJson('data/international.json', { items: [] });
  const firstSeen = new Map(previous.items.map(i => [i.url, i.date]));
  const nowIso = new Date().toISOString();
  const sources = [];
  let items = [];
  const results = await Promise.allSettled(FEEDS.map(f => get(f.url)));
  results.forEach((r, idx) => {
    const feed = FEEDS[idx];
    const label = `${feed.name}${feed.series ? ' · ' + feed.series : ''}`;
    if (r.status === 'fulfilled') {
      const parsed = parseFeed(r.value, feed);
      items.push(...parsed);
      sources.push({ name: feed.name, label, ok: true, count: parsed.length });
    } else {
      sources.push({ name: feed.name, label, ok: false, count: 0, error: String(r.reason?.message || r.reason) });
    }
  });
  // Some feeds (Formula1.com) give no publish date: use the time we first saw the story.
  for (const it of items) if (!it.date) it.date = firstSeen.get(it.url) || nowIso;
  // A series feed knows its series better than a general feed: put those first when de-duplicating.
  const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
  items = items
    .filter(i => Date.parse(i.date) >= cutoff && Date.parse(i.date) <= Date.now() + 36e5)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const kept = [], perSeries = {};
  for (const it of items) {
    if (kept.some(k => isDuplicate(k, it))) continue;
    if ((perSeries[it.series] = (perSeries[it.series] || 0) + 1) > PER_SERIES) continue;
    kept.push(it);
    if (kept.length >= MAX_ITEMS) break;
  }
  // Keep stories from feeds that failed this time, so a short outage doesn't empty a series.
  for (const s of sources.filter(s => !s.ok)) {
    for (const old of previous.items.filter(i => i.source === s.name)) {
      if (!kept.some(k => k.url === old.url) && Date.parse(old.date) >= cutoff) kept.push(old);
    }
  }
  kept.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  if (kept.length < 10 && previous.items.length) {
    console.warn('Too few stories collected; keeping previous news file.');
    return previous;
  }
  const bySeries = {};
  for (const it of kept) bySeries[it.series] = (bySeries[it.series] || 0) + 1;
  return { updated: nowIso, sources, bySeries, items: kept };
}

/* ---------- F1 (Jolpica, the community successor to the Ergast API) ---------- */
const F1_API = 'https://api.jolpi.ca/ergast/f1/current';
const F1_COLORS = {
  mercedes: '#27f4d2', ferrari: '#e8002d', red_bull: '#3671c6', mclaren: '#ff8000', rb: '#6692ff',
  alpine: '#ff87bc', haas: '#b6babd', audi: '#bb0a30', sauber: '#52e252', williams: '#64c4ff',
  aston_martin: '#229971', cadillac: '#c9a227'
};
const f1Color = id => F1_COLORS[id] || '#9aa29a';
const at = s => (s ? `${s.date}T${s.time || '00:00:00Z'}` : null);

async function f1() {
  const [cal, last, ds, cs] = await Promise.all([
    get(`${F1_API}.json?limit=100`, 'json'), get(`${F1_API}/last/results.json`, 'json'),
    get(`${F1_API}/driverstandings.json`, 'json'), get(`${F1_API}/constructorstandings.json`, 'json')
  ]);
  const lr = last.MRData.RaceTable.Races[0];
  return {
    label: 'Formula 1', season: cal.MRData.RaceTable.season,
    calendar: cal.MRData.RaceTable.Races.map(r => ({
      round: +r.round, name: r.raceName, place: `${r.Circuit.Location.locality}, ${r.Circuit.Location.country}`,
      start: at(r.FirstPractice) || at(r), main: at(r),
      sessions: [['Practice 1', r.FirstPractice], ['Sprint qualifying', r.SprintQualifying], ['Practice 2', r.SecondPractice],
        ['Practice 3', r.ThirdPractice], ['Sprint', r.Sprint], ['Qualifying', r.Qualifying], ['Race', r]]
        .filter(([, s]) => s && s.date).map(([label, s]) => ({ label, at: at(s) }))
    })),
    lastRace: lr && {
      name: lr.raceName, place: lr.Circuit.circuitName, date: lr.date,
      results: lr.Results.slice(0, 10).map(x => ({
        pos: +x.position, name: `${x.Driver.givenName} ${x.Driver.familyName}`, team: x.Constructor.name,
        color: f1Color(x.Constructor.constructorId), time: x.Time?.time || x.status, points: +x.points, fastest: x.FastestLap?.rank === '1'
      }))
    },
    standings: {
      drivers: (ds.MRData.StandingsTable.StandingsLists[0]?.DriverStandings || []).slice(0, 10).map(d => ({
        pos: +d.position, name: `${d.Driver.givenName} ${d.Driver.familyName}`, team: d.Constructors.at(-1)?.name || '',
        color: f1Color(d.Constructors.at(-1)?.constructorId), points: +d.points })),
      teams: (cs.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings || []).map(c => ({
        pos: +c.position, name: c.Constructor.name, team: '', color: f1Color(c.Constructor.constructorId), points: +c.points }))
    }
  };
}

/* ---------- MotoGP (public results service used by motogp.com) ---------- */
const MGP = 'https://api.motogp.pulselive.com/motogp/v1/results';
const MGP_COLORS = { ducati: '#d40000', aprilia: '#41bfaa', ktm: '#ff6600', honda: '#e4002b', yamaha: '#1f3c96' };
const mgpColor = c => MGP_COLORS[String(c || '').toLowerCase()] || '#9aa29a';
const titleCase = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\bOf\b/g, 'of');

async function motogp() {
  const seasons = await get(`${MGP}/seasons`, 'json');
  const season = seasons.find(s => s.current) || seasons[0];
  const [past, future] = await Promise.all([
    get(`${MGP}/events?seasonUuid=${season.id}&isFinished=true`, 'json'),
    get(`${MGP}/events?seasonUuid=${season.id}&isFinished=false`, 'json')
  ]);
  const all = [...past, ...future].filter(e => !e.test);
  all.sort((a, b) => Date.parse(a.date_start) - Date.parse(b.date_start));
  const finished = all.filter(e => Date.parse(e.date_end) + 864e5 < Date.now());
  const calendar = all.map((e, i) => ({
    round: i + 1, name: titleCase(e.name), place: `${e.circuit?.name || ''}${e.country?.name ? ', ' + e.country.name : ''}`,
    start: `${e.date_start}T09:00:00Z`, main: `${e.date_end}T13:00:00Z`, sessions: []
  }));

  let lastRace = null, category = null;
  for (const ev of finished.slice(-2).reverse()) {           // newest finished event that has a race result
    const cats = await get(`${MGP}/categories?eventUuid=${ev.id}`, 'json');
    category = cats.find(c => /^motogp/i.test(c.name)) || category;
    if (!category) continue;
    const sessions = await get(`${MGP}/sessions?eventUuid=${ev.id}&categoryUuid=${category.id}`, 'json');
    const race = sessions.find(s => s.type === 'RAC');
    if (!race) continue;
    const cl = await get(`${MGP}/session/${race.id}/classification?test=false`, 'json');
    const rows = (cl.classification || []).filter(r => r.position);
    if (!rows.length) continue;
    lastRace = {
      name: titleCase(ev.name), place: ev.circuit?.name || '', date: ev.date_end,
      results: rows.slice(0, 10).map(r => ({
        pos: r.position, name: r.rider?.full_name, team: r.team?.name || r.constructor?.name, color: mgpColor(r.constructor?.name),
        time: r.position === 1 ? r.time : (r.gap?.first ? `+${r.gap.first}` : r.status), points: r.points ?? 0, fastest: false
      }))
    };
    break;
  }
  let drivers = [];
  if (category) {
    const st = await get(`${MGP}/standings?seasonUuid=${season.id}&categoryUuid=${category.id}`, 'json');
    drivers = (st.classification || []).slice(0, 10).map(r => ({
      pos: r.position, name: r.rider?.full_name, team: r.team?.name || '', color: mgpColor(r.constructor?.name), points: r.points }));
  }
  return { label: 'MotoGP', season: String(season.year), calendar, lastRace, standings: { drivers } };
}

/* ---------- NASCAR Cup Series (public data feeds used by nascar.com) ---------- */
const NASCAR_COLORS = { chevrolet: '#d6a400', ford: '#1f4fa0', toyota: '#eb0a1e' };
const nasColor = m => NASCAR_COLORS[String(m || '').toLowerCase()] || '#9aa29a';
// NASCAR times are US Eastern without a zone: add the offset (daylight time roughly mid-March to early November).
function eastern(local) {
  if (!local) return null;
  const d = new Date(local + 'Z'), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  const dst = (m > 3 && m < 11) || (m === 3 && day >= 8) || (m === 11 && day < 2);
  return new Date(d.getTime() + (dst ? 4 : 5) * 36e5).toISOString();
}

async function nascar() {
  const year = new Date().getUTCFullYear();
  const races = (await get(`https://cf.nascar.com/cacher/${year}/1/race_list_basic.json`, 'json'))
    .filter(r => r.race_type_id === 1)
    .sort((a, b) => Date.parse(a.race_date) - Date.parse(b.race_date));
  const calendar = races.map((r, i) => ({
    round: i + 1, name: r.race_name, place: r.track_name, start: eastern(r.race_date), main: eastern(r.race_date), sessions: []
  }));
  const done = races.filter(r => r.winner_driver_id && Date.parse(eastern(r.race_date)) < Date.now());
  let lastRace = null;
  const last = done.at(-1);
  if (last) {
    const w = await get(`https://cf.nascar.com/cacher/${year}/1/${last.race_id}/weekend-feed.json`, 'json');
    const res = (w.weekend_race?.[0]?.results || []).sort((a, b) => a.finishing_position - b.finishing_position);
    lastRace = {
      name: last.race_name, place: last.track_name, date: eastern(last.race_date)?.slice(0, 10),
      results: res.slice(0, 10).map(r => ({
        pos: r.finishing_position, name: r.driver_fullname, team: `#${r.car_number} ${r.team_name}`, color: nasColor(r.car_make),
        time: r.finishing_position === 1 ? `${r.laps_completed} laps` : (r.diff_laps ? `+${r.diff_laps} lap${r.diff_laps > 1 ? 's' : ''}` : r.finishing_status),
        points: r.points_earned, fastest: false
      }))
    };
  }
  const pts = await get(`https://cf.nascar.com/cacher/${year}/1/points-feed.json`, 'json');
  const drivers = pts.slice(0, 10).map(p => ({
    pos: p.position, name: p.driver_name, team: `#${p.car_no} ${p.manufacturer || ''}`.trim(), color: nasColor(p.manufacturer), points: p.points }));
  return { label: 'NASCAR Cup', season: String(year), calendar, lastRace, standings: { drivers } };
}

async function updateResults() {
  const previous = await readJson('data/results.json', { series: {} });
  const series = {}, status = {};
  for (const [key, fn] of [['F1', f1], ['MotoGP', motogp], ['NASCAR', nascar]]) {
    try { series[key] = await fn(); status[key] = 'ok'; }
    catch (err) { series[key] = previous.series?.[key]; status[key] = `kept previous: ${err.message || err}`; }
    if (!series[key]) delete series[key];
  }
  return { updated: new Date().toISOString(), status, series };
}

/* ---------- run ---------- */
await mkdir('data', { recursive: true });

const news = await updateNews();
await writeFile('data/international.json', JSON.stringify(news, null, 1) + '\n');
console.log(`News: ${news.items.length} stories`);
console.log('  by series: ' + Object.entries(news.bySeries || {}).map(([k, v]) => `${k} ${v}`).join(', '));
for (const s of news.sources || []) if (!s.ok) console.log(`  FAIL ${s.label} - ${s.error}`);
console.log(`  feeds ok: ${(news.sources || []).filter(s => s.ok).length}/${FEEDS.length}`);

const results = await updateResults();
await writeFile('data/results.json', JSON.stringify(results, null, 1) + '\n');
for (const [k, v] of Object.entries(results.series)) {
  console.log(`Results ${k}: ${results.status[k]} | last race ${v.lastRace?.name || '-'} | ${v.standings?.drivers?.length || 0} in standings | ${v.calendar.length} rounds`);
}
await rm('data/f1.json', { force: true }); // replaced by data/results.json
