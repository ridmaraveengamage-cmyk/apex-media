# Apex Media

Design preview of the Apex Media motorsport news website.

- **Sri Lanka edition:** karting (SWS Sprint, SWS Endurance, IAME Series Sri Lanka at SpeedBay Circuit, Bandaragama) and supercross.
- **International edition:** world series news, results, standings and schedule.
- **Apex TV / live coverage:** placeholder, planned for a later phase.

Open `index.html` in a browser. No build step.

Notes: Sri Lanka items are based on published 2026 reports. Standings, International stories and article images are sample content.

## Automated international news and results

The International tab fills itself. Nothing needs to run on your computer.

1. **Every 30 minutes** GitHub Actions runs `.github/workflows/update-international.yml`.
2. It runs `scripts/update-international.mjs`, which:
   - reads 24 public RSS feeds: general feeds (Motorsport.com, Autosport, The Race, RaceFans, Formula1.com, Crash.net) and series feeds for MotoGP, WEC, WRC, IndyCar, NASCAR, Formula E, WorldSBK, IMSA, DTM, Super Formula, Supercars, BTCC, F2/F3, Dakar and karting;
   - tags each story by series, marks headlines that report a result (wins, titles, poles, podiums), removes duplicates, and keeps up to 15 stories per series from the last 21 days;
   - gets full race results, standings and calendars for **F1** (Jolpica F1 API), **MotoGP** (MotoGP's public results service) and **NASCAR Cup** (NASCAR's public data feeds).
   - builds championship standings for 21 championships: F1 drivers and teams, MotoGP, Moto2, Moto3 and NASCAR Cup, O'Reilly and Truck from official feeds; F2, F3, IndyCar, Formula E, Super Formula, WorldSBK, WEC (drivers and manufacturers), IMSA GTP, WRC, DTM, Supercars and BTCC from Wikipedia season pages (re-read every 2 hours and credited on the page).
3. It saves `data/international.json`, `data/results.json` and `data/standings.json`, and commits only if something changed. GitHub Pages republishes the site.
4. The page reads those files: lead stories from different series, a "By series" section, results and standings tabs, results headlines for every other series, and a combined calendar.

If a source is down, its previous data is kept. Full articles are never copied: each story links to the original publisher.

- **Refresh now:** GitHub → Actions → "Update international news" → Run workflow.
- **Add or remove a source:** edit the `FEEDS` list at the top of `scripts/update-international.mjs`.
