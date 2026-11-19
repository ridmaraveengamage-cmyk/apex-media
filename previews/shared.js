// Shared by the design previews: helpers, live data loading, and Sri Lanka content.
// Live data comes from ../data/*.json, written every 30 minutes by the GitHub workflow.
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => (/^https:\/\/[^\s"'<>]+$/.test(u || '') ? u : '');
  const hex = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '');
  function ago(iso) {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (m < 60) return Math.max(1, m) + ' min ago';
    const h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hr ago' : ' hrs ago');
    const d = Math.round(h / 24); return d === 1 ? 'Yesterday' : d + ' days ago';
  }
  const day = (iso, opt) => new Date(iso).toLocaleDateString('en-GB', opt || { day: 'numeric', month: 'short' });
  const time = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const ORDER = ['F1', 'MotoGP', 'WEC', 'WRC', 'IndyCar', 'NASCAR', 'Formula E', 'WorldSBK', 'IMSA', 'DTM', 'Super Formula', 'Supercars', 'BTCC', 'F2 / F3', 'Dakar', 'Karting', 'Motorsport',
    'IAME Sri Lanka', 'SWS Sprint', 'SWS Endurance', 'Supercross', 'National'];
  const HUES = { F1: 2, MotoGP: 22, WEC: 200, WRC: 42, 'Formula E': 185, IndyCar: 220, NASCAR: 50, WorldSBK: 330, IMSA: 260, DTM: 300, 'Super Formula': 350, Supercars: 12, BTCC: 160, 'F2 / F3': 275, Dakar: 32, Karting: 110, Motorsport: 150,
    'IAME Sri Lanka': 110, 'SWS Sprint': 140, 'SWS Endurance': 175, Supercross: 28, National: 210 };
  const color = s => `hsl(${HUES[s] ?? 150} 78% 46%)`;

  async function getJson(p) { try { const r = await fetch(p, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } }

  // Normalised international data for both previews
  async function loadInternational() {
    const [news, res, stand] = await Promise.all([getJson('../data/international.json'), getJson('../data/results.json'), getJson('../data/standings.json')]);
    const items = (news?.items || []).map(n => ({
      title: esc(n.title), url: safeUrl(n.url), source: esc(n.source), date: n.date, series: n.series, summary: esc(n.summary),
      image: safeUrl(n.image), result: !!n.result
    }));
    const results = [];
    for (const [key, v] of Object.entries(res?.series || {})) {
      if (!v.lastRace?.results?.length) continue;
      results.push({ key, label: esc(v.label), race: esc(v.lastRace.name), place: esc(v.lastRace.place), date: v.lastRace.date,
        rows: v.lastRace.results.map(r => ({ pos: +r.pos, name: esc(r.name), team: esc(r.team), time: esc(r.time), points: +r.points || 0, color: hex(r.color), fastest: !!r.fastest })) });
    }
    const now = Date.now(), calendar = [];
    for (const [key, v] of Object.entries(res?.series || {})) {
      for (const r of v.calendar || []) {
        if (!r.main) continue;
        const done = Date.parse(r.main) + 3 * 36e5 < now;
        calendar.push({ series: key === 'NASCAR' ? 'NASCAR' : key, label: esc(v.label), round: r.round, name: esc(r.name), place: esc(r.place), start: r.start || r.main, main: r.main, done,
          live: !done && now >= Date.parse(r.start || r.main) - 12 * 36e5, sessions: r.sessions || [] });
      }
    }
    calendar.sort((a, b) => Date.parse(a.main) - Date.parse(b.main));
    const champs = (stand?.championships || []).filter(c => c.rows?.length >= 2).map(c => ({
      id: esc(c.id), group: esc(c.group), series: c.series, title: esc(c.title), col: esc(c.col), season: esc(c.season), source: esc(c.source), link: safeUrl(c.link), updated: c.updated,
      rows: c.rows.map(r => ({ pos: +r.pos, name: esc(r.name), team: esc(r.team), points: +r.points || 0, color: hex(r.color) }))
    }));
    return { ok: items.length > 0, updated: news?.updated, items, results, calendar, champs, sample: false };
  }

  // Sri Lanka edition: published 2026 reports (IAME Motorsport, ThePapare, The Morning, National Sports Calendar)
  const SL_NEWS = [
    ['IAME Series Sri Lanka Round 5: finals day at SpeedBay', 'IAME Sri Lanka', 'Cadet, Junior, Senior and Master drivers raced at Bandaragama for Round 5. Junior and Senior champions win free entry to the IAME World Finals.', true, '2026-11-01T10:00:00Z'],
    ['Team Avant win the SWS Endurance Cup opener with 126 laps', 'SWS Endurance', 'Sixteen teams raced for three hours at SpeedBay. Kartmen and Velocity X Racing completed the podium.', true, '2026-03-06T10:00:00Z'],
    ['33 karts: Senior class sets Sri Lanka’s biggest-ever grid', 'SWS Sprint', 'The first SWS Sprint Championship round drew the largest single grid in Sri Lankan karting history.', false, '2026-03-06T09:00:00Z'],
    ['SpeedBay launches Sri Lanka’s first SWS Sprint Championship', 'SWS Sprint', 'Six rounds of individual racing in arrive-and-drive Sodi karts, with a route to the SWS World Finals.', false, '2026-03-05T09:00:00Z'],
    ['Spark Racing set the endurance opener’s fastest lap: 1:09.249', 'SWS Endurance', 'The fastest lap of the three-hour race at SpeedBay Circuit.', false, '2026-03-06T08:00:00Z'],
    ['Drivers from six countries join the SWS grid at SpeedBay', 'SWS Sprint', 'Entries came from Pakistan, China, the UK, the Maldives, Germany and the Czech Republic.', false, '2026-03-05T08:00:00Z'],
    ['IAME classes explained: X30 engines, Komet tyres and weight limits', 'IAME Sri Lanka', 'Cadet 8–12, Junior 12–15, Senior 15+ and Master 30+, all on IAME X30 power.', false, '2026-01-20T08:00:00Z'],
    ['SLARDAR launches the Sri Lanka Super Series 2026', 'National', 'Rallying, circuit racing and off-road events under one championship banner.', false, '2026-03-22T08:00:00Z'],
    ['Fuel supply concerns put the early-season calendar under review', 'National', 'SLARDAR said races scheduled up to April may be postponed, with a revised calendar to follow.', false, '2026-03-22T07:00:00Z'],
    ['Gunners Supercross returns to Minneriya', 'Supercross', 'Race meet at the Minneriya army base.', false, '2026-09-20T08:00:00Z'],
    ['Gajaba Supercross heads to Saliyapura', 'Supercross', 'Late-August race meet at Saliyapura.', false, '2026-08-15T08:00:00Z'],
    ['Fox Hill Supercross back at Diyatalawa', 'Supercross', 'The April classic in the hills.', false, '2026-04-10T08:00:00Z']
  ].map(([title, series, summary, result, date]) => ({ title, series, summary, result, date, source: 'Apex Media', url: '', image: '' }));
  const SL_CAL = [
    ['IAME Sri Lanka', 'Round 1', 'SpeedBay Circuit', 'Bandaragama', '2026-01-24', '2026-01-25'],
    ['Supercross', 'Race meet', 'Fox Hill Supercross', 'Diyatalawa', '2026-04-17', '2026-04-18'],
    ['SWS Sprint', 'Round 2', 'SpeedBay Circuit', 'Bandaragama', '2026-04-25', '2026-04-26'],
    ['IAME Sri Lanka', 'Round 2', 'SpeedBay Circuit', 'Bandaragama', '2026-06-13', '2026-06-14'],
    ['Supercross', 'Race meet', 'Cavalry Supercross', 'Venue to be confirmed', '2026-06-27', '2026-06-28'],
    ['IAME Sri Lanka', 'Round 3', 'SpeedBay Circuit', 'Bandaragama', '2026-08-01', '2026-08-02'],
    ['Supercross', 'Race meet', 'Gajaba Supercross', 'Saliyapura', '2026-08-22', '2026-08-23'],
    ['IAME Sri Lanka', 'Round 4', 'SpeedBay Circuit', 'Bandaragama', '2026-09-19', '2026-09-20'],
    ['Supercross', 'Race meet', 'Gunners Supercross', 'Minneriya', '2026-09-26', '2026-09-27'],
    ['IAME Sri Lanka', 'Round 5', 'SpeedBay Circuit', 'Bandaragama', '2026-10-31', '2026-11-01']
  ].map(([series, round, name, place, s, e]) => ({ series, label: series, round, name, place, start: s + 'T04:00:00Z', main: e + 'T10:00:00Z',
    done: Date.parse(e + 'T10:00:00Z') + 3 * 36e5 < Date.now(), live: false, sessions: [] }));
  const SL_RESULTS = [{ key: 'SWS', label: 'SWS Endurance Cup', race: 'Opener · 3 hours', place: 'SpeedBay Circuit', date: '2026',
    rows: [{ pos: 1, name: 'Team Avant', team: '126 laps', time: '126 laps', points: 0, color: '' }, { pos: 2, name: 'Kartmen', team: '', time: '—', points: 0, color: '' },
      { pos: 3, name: 'Velocity X Racing', team: '', time: '—', points: 0, color: '' }], note: 'Top three as reported by ThePapare. Fastest lap: Spark Racing, 1:09.249.' }];
  const sampleRows = n => Array.from({ length: 6 }, (_, i) => ({ pos: i + 1, name: `Driver ${String.fromCharCode(65 + i + n)}`, team: 'Senior · sample', points: [112, 104, 91, 77, 63, 52][i] - n * 4, color: '' }));
  const SL_CHAMPS = [
    { id: 'iame', group: 'Karting', series: 'IAME Sri Lanka', title: 'IAME Senior', col: 'Driver', season: '2026', source: 'Sample data', link: '', rows: sampleRows(0), sample: true },
    { id: 'sws', group: 'Karting', series: 'SWS Sprint', title: 'SWS Sprint Senior', col: 'Driver', season: '2026', source: 'Sample data', link: '', rows: sampleRows(6), sample: true }
  ];
  const SL = { ok: true, items: SL_NEWS, results: SL_RESULTS, calendar: SL_CAL, champs: SL_CHAMPS, sample: true };

  window.Apex = { esc, safeUrl, hex, ago, day, time, ORDER, color, loadInternational, SL };
})();
