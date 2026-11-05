// Collects international racing news and F1 data for the International tab.
// Runs on GitHub Actions (Node 20+, no dependencies) and writes:
//   data/international.json  - latest headlines from public RSS feeds
//   data/f1.json             - F1 calendar, last race result and standings
// If a source fails, the previous data for it is kept, so the site never goes blank.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const UA = 'ApexMediaBot/1.0 (+https://github.com/ridmaraveengamage-cmyk/apex-media)';
const MAX_ITEMS = 60;      // headlines kept on the site
const PER_SOURCE = 20;     // newest items taken from each feed
const MAX_AGE_DAYS = 10;   // older stories are dropped

const FEEDS = [
  { name: 'Formula1.com', url: 'https://www.formula1.com/en/latest/all.xml', series: 'F1' },
  { name: 'Motorsport.com', url: 'https://www.motorsport.com/rss/all/news/' },
  { name: 'Autosport', url: 'https://www.autosport.com/rss/feed/all' },
  { name: 'The Race', url: 'https://www.the-race.com/feed/' },
  { name: 'RaceFans', url: 'https://www.racefans.net/feed/' },
  { name: 'Crash.net', url: 'https://www.crash.net/rss/f1', series: 'F1' }
];

// Series detection: first match wins. Checked against feed categories, then URL, then title.
const SERIES = [
  ['MotoGP', /\bmotogp\b|\bmoto2\b|\bmoto3\b/i],
  ['WEC', /\bwec\b|world endurance|le mans|hypercar|imsa/i],
  ['WRC', /\bwrc\b|world rally|\brally\b/i],
  ['Formula E', /formula[ -]?e\b/i],
  ['IndyCar', /indycar|indy 500|indianapolis 500/i],
  ['NASCAR', /nascar/i],
  ['F2 / F3', /\bf2\b|\bf3\b|formula 2|formula 3/i],
  ['Karting', /karting|\bkart\b|iame|\bsws\b|\brotax\b/i],
  ['WSBK', /superbike|\bwsbk\b|\bworldsbk\b/i],
  ['F1', /\bf1\b|formula[ -]?1|formula one|grand prix/i]
];

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
function detectSeries(cats, url, title, fallback) {
  for (const hay of [cats.join(' | '), url, title]) {
    for (const [name, re] of SERIES) if (re.test(hay)) return name;
  }
  return fallback || 'Motorsport';
}

function parseFeed(xml, feed) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, PER_SOURCE).map(b => {
    // drop site suffixes such as " | Formula 1"
    const title = stripTags(tag(b, 'title')).replace(/\s+\|\s+[^|]{2,30}$/, '');
    const link = cleanUrl(stripTags(tag(b, 'link')) || attr(b, 'link', 'href'));
    const dateRaw = stripTags(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    const date = new Date(dateRaw);
    const cats = [...b.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map(m => stripTags(m[1]));
    const desc = stripTags(tag(b, 'description') || tag(b, 'summary'));
    const image =
      attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') ||
      (/<enclosure\b[^>]*type=["']image/i.test(b) ? attr(b, 'enclosure', 'url') : '') ||
      attr(decode(tag(b, 'content:encoded') || tag(b, 'description')), 'img', 'src');
    return {
      title, url: link, source: feed.name,
      date: isNaN(date) ? null : date.toISOString(),
      series: detectSeries(cats, link, title, feed.series),
      summary: excerpt(desc),
      image: image && image.startsWith('https://') ? image : null
    };
  }).filter(i => i.title && i.url && i.date);
}

// Same story from two outlets: keep the first (newest) one.
const norm = t => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 3);
function isDuplicate(a, b) {
  if (a.url === b.url) return true;
  const A = new Set(norm(a.title)), B = norm(b.title);
  if (!A.size || !B.length) return false;
  const shared = B.filter(w => A.has(w)).length;
  return shared / Math.min(A.size, B.length) >= 0.8;
}

async function updateNews() {
  const previous = await readJson('data/international.json', { items: [] });
  const sources = [];
  let items = [];
  for (const feed of FEEDS) {
    try {
      const parsed = parseFeed(await get(feed.url), feed);
      items.push(...parsed);
      sources.push({ name: feed.name, ok: true, count: parsed.length });
    } catch (err) {
      // keep this source's previous stories so a short outage doesn't empty the page
      const kept = previous.items.filter(i => i.source === feed.name);
      items.push(...kept);
      sources.push({ name: feed.name, ok: false, count: kept.length, error: String(err.message || err) });
    }
  }
  const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
  items = items
    .filter(i => Date.parse(i.date) >= cutoff && Date.parse(i.date) <= Date.now() + 36e5)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const unique = [];
  for (const it of items) if (!unique.some(u => isDuplicate(u, it))) unique.push(it);
  if (unique.length < 5 && previous.items.length) {
    console.warn('Too few stories collected; keeping previous news file.');
    return previous;
  }
  return { updated: new Date().toISOString(), sources, items: unique.slice(0, MAX_ITEMS) };
}

/* ---------- F1 data (Jolpica, the community successor to the Ergast API) ---------- */
const API = 'https://api.jolpi.ca/ergast/f1/current';
const TEAM_COLORS = {
  mercedes: '#27f4d2', ferrari: '#e8002d', red_bull: '#3671c6', mclaren: '#ff8000', rb: '#6692ff',
  alpine: '#ff87bc', haas: '#b6babd', audi: '#bb0a30', sauber: '#52e252', williams: '#64c4ff',
  aston_martin: '#229971', cadillac: '#c9a227'
};
const color = id => TEAM_COLORS[id] || '#9aa29a';
const at = s => (s ? `${s.date}T${s.time || '00:00:00Z'}` : null);

async function updateF1() {
  const [cal, last, ds, cs] = await Promise.all([
    get(`${API}.json?limit=100`, 'json'),
    get(`${API}/last/results.json`, 'json'),
    get(`${API}/driverstandings.json`, 'json'),
    get(`${API}/constructorstandings.json`, 'json')
  ]);
  const races = cal.MRData.RaceTable.Races;
  const lastRace = last.MRData.RaceTable.Races[0];
  const calendar = races.map(r => ({
    round: +r.round, name: r.raceName, circuit: r.Circuit.circuitName,
    place: `${r.Circuit.Location.locality}, ${r.Circuit.Location.country}`,
    race: at(r),
    sessions: [
      ['Practice 1', r.FirstPractice], ['Sprint qualifying', r.SprintQualifying], ['Practice 2', r.SecondPractice],
      ['Practice 3', r.ThirdPractice], ['Sprint', r.Sprint], ['Qualifying', r.Qualifying], ['Race', r]
    ].filter(([, s]) => s && s.date).map(([label, s]) => ({ label, at: at(s) }))
  }));
  return {
    updated: new Date().toISOString(),
    season: cal.MRData.RaceTable.season,
    calendar,
    lastRace: lastRace && {
      round: +lastRace.round, name: lastRace.raceName, circuit: lastRace.Circuit.circuitName, date: lastRace.date,
      results: lastRace.Results.slice(0, 10).map(x => ({
        pos: +x.position, driver: `${x.Driver.givenName} ${x.Driver.familyName}`, code: x.Driver.code,
        team: x.Constructor.name, color: color(x.Constructor.constructorId),
        time: x.Time?.time || x.status, points: +x.points, fastest: x.FastestLap?.rank === '1'
      }))
    },
    drivers: ds.MRData.StandingsTable.StandingsLists[0]?.DriverStandings.map(d => ({
      pos: +d.position, name: `${d.Driver.givenName} ${d.Driver.familyName}`,
      team: d.Constructors.at(-1)?.name || '', color: color(d.Constructors.at(-1)?.constructorId), points: +d.points
    })) || [],
    teams: cs.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings.map(c => ({
      pos: +c.position, name: c.Constructor.name, color: color(c.Constructor.constructorId), points: +c.points
    })) || []
  };
}

/* ---------- run ---------- */
await mkdir('data', { recursive: true });

const news = await updateNews();
await writeFile('data/international.json', JSON.stringify(news, null, 2) + '\n');
console.log(`News: ${news.items.length} stories`);
for (const s of news.sources || []) console.log(`  ${s.ok ? 'ok  ' : 'FAIL'} ${s.name} (${s.count})${s.error ? ' - ' + s.error : ''}`);

try {
  const f1 = await updateF1();
  await writeFile('data/f1.json', JSON.stringify(f1, null, 2) + '\n');
  console.log(`F1: ${f1.calendar.length} rounds, last race ${f1.lastRace?.name}, ${f1.drivers.length} drivers`);
} catch (err) {
  console.warn(`F1 data not updated, keeping previous file: ${err.message || err}`);
}
