# Apex Media

Motorsport news website with two tabs: **Sri Lanka** (local racing, karting focus) and **International** (all world motorsport).

- Live site (GitHub Pages, deploys from `main`): https://ridmaraveengamage-cmyk.github.io/apex-media/ — open a tab directly with `#srilanka` or `#international`.
- Repo (public): https://github.com/ridmaraveengamage-cmyk/apex-media

## Working with the owner

- After every change, give the live site link (with `#international` / `#srilanka` when relevant) and the repo link.
- The owner is not a developer: explain simply, lead with what changed and whether it worked.
- Use real, sourced data for real series, events and people. Anything made up must be labelled "sample" on the page; credit sources on the page.
- Test changes, check the live site after pushing, and say what could not be verified.
- Commit and push to `main` when a change is done and checked.

## Design

- Dark charcoal header, light reading area, neon green accent (`#3cff1a`) from the logo. Saira Condensed for headings, Titillium Web for body. Layout modelled on formula1.com.
- In November 2026 two alternative designs ("Pit Wall" dark dashboard, "Paddock" photo magazine) were tried and rejected. Build on the current design; don't propose a full redesign unless asked.

## Files

- `index.html` — the whole site (HTML, CSS, JS in one file). No build step, no frameworks.
- `team/` — separate **Apex Racing Team** site (live at `/apex-media/team/`), added Nov 2026 from a Claude Design canvas. Self-contained `team/index.html` + `team/assets/`. Dark charcoal + `#39FF14`, Saira Condensed + Inter, Apple-style scroll animations. Driver profiles open at `#driver-NN`. All drivers, results, partners (invented brands) and photos (Gemini-generated) are **sample content**, labelled by a banner at the top. Don't touch it when working on the news site.
- `assets/apex-logo.webp` — logo on a dark `#1f1f1f` background (not transparent). The header crops it with `background-size`/`background-position` and blends it with `mix-blend-mode: lighten`.
- `scripts/update-international.mjs` — data collector (Node 20+, no dependencies).
- `.github/workflows/update-international.yml` — runs the collector every 30 min (cron `7,37 * * * *`, plus a manual "Run workflow" button); commits `data/` only when it changed.
- `data/international.json` (news), `data/results.json` (F1, MotoGP, NASCAR Cup results and calendars), `data/standings.json` (21 championships) — **written by the workflow only.** After a local test run, restore with `git checkout -- data`; never commit them by hand.

## Local testing (Mac)

- Node is installed on the owner's Mac. Test collector changes with `node scripts/update-international.mjs` before pushing, then run `git checkout -- data` so the local data files are never committed.
- To preview the site, open `index.html` or serve the folder (e.g. `python3 -m http.server`), since `fetch` of `data/*.json` needs http.

## Sri Lanka tab (hand-edited)

- Data lives in the `SL` object in `index.html`, drawn from published 2026 reports (IAME Motorsport, ThePapare, The Morning, National Sports Calendar 2026).
- IAME Series Sri Lanka: 5 rounds at SpeedBay Circuit, Bandaragama; Cadet 8–12, Junior 12–15, Senior 15+, Master 30+; X30 engines, Komet tyres; Junior/Senior champions win IAME World Finals entry.
- SWS Sprint: 6 rounds, Sodi arrive-and-drive karts, Cadet/Junior/Senior/Masters/Women's, record 33-kart Senior grid.
- SWS Endurance: 3-hour team race, 16 teams; opener won by Team Avant (126 laps) ahead of Kartmen and Velocity X Racing; fastest lap Spark Racing 1:09.249. Officiated by the Ceylon Motor Sports Club.
- Supercross: Fox Hill (Diyatalawa, Apr), Cavalry (Jun), Gajaba (Saliyapura, Aug), Gunners (Minneriya, Sep). Sources conflict on some dates/venues; the page says so.
- **Sample data:** Sri Lanka standings (placeholder "Driver A" names) and endurance-results points. Keep them labelled.

## International tab (automated)

- News: 24 RSS feeds (Motorsport.com, Autosport, The Race, RaceFans, Formula1.com, Crash.net, plus per-series feeds and eKartingNews). Tagged by series, de-duplicated, max 15 per series, last 21 days, result headlines flagged by keyword. Only headline, summary, image and link are stored; every story links to the publisher.
- Results/calendars: F1 via Jolpica F1 API; MotoGP via api.motogp.pulselive.com; NASCAR Cup via cf.nascar.com (times are US Eastern without a zone).
- Standings (21): official feeds for F1 drivers/teams, MotoGP, Moto2, Moto3, NASCAR Cup/O'Reilly/Truck; Wikipedia season pages (re-read at most every 2 h, credited "Wikipedia (CC BY-SA)") for F2, F3, IndyCar, Formula E, Super Formula, WorldSBK, WEC Hypercar drivers/manufacturers, IMSA GTP, WRC, DTM, Supercars, BTCC. WRC manufacturers left out (table unreadable).
- A failed source keeps its last good data; the page falls back to built-in sample content if a data file can't load.
- Page loader: `loadLive()` in `index.html` reads the three data files and fills the `INT` object.

## Not built yet

- Apex TV / live coverage (live shows, race updates, live timing) — placeholder section and "Soon" badges only.
- Real photos for Sri Lanka stories (placeholder tiles).
- Newsletter form only shows a thank-you message.

## Known limits

- Keyword-picked result headlines are sometimes wrong.
- News photos are hotlinked from publishers; if the site goes commercial, get permission or drop images.
- GitHub pauses scheduled workflows after 60 days without repo activity (re-enable in Actions).
- Wikipedia standings can lag a few hours after a race.
