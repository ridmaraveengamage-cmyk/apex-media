# Apex Media

Design preview of the Apex Media motorsport news website.

- **Sri Lanka edition:** karting (SWS Sprint, SWS Endurance, IAME Series Sri Lanka at SpeedBay Circuit, Bandaragama) and supercross.
- **International edition:** world series news, results, standings and schedule.
- **Apex TV / live coverage:** placeholder, planned for a later phase.

Open `index.html` in a browser. No build step.

Notes: Sri Lanka items are based on published 2026 reports. Standings, International stories and article images are sample content.

## Automated international news

The International tab fills itself. Nothing needs to run on your computer.

1. **Every 30 minutes** GitHub Actions runs `.github/workflows/update-international.yml`.
2. It runs `scripts/update-international.mjs`, which:
   - reads the public RSS news feeds of Formula1.com, Motorsport.com, Autosport, The Race, RaceFans and Crash.net;
   - keeps the headline, a short summary, the image, date and source, tags each story by series (F1, MotoGP, WEC, WRC, IndyCar, Formula E, karting and more), removes duplicates and keeps the newest 60 from the last 10 days;
   - gets the F1 calendar, last race result and driver/team standings from the free Jolpica F1 API.
3. It saves `data/international.json` and `data/f1.json` and commits them only if something changed. GitHub Pages then republishes the site.
4. The page loads those files when someone opens the International tab. If they are missing, it shows the sample content.

If a source is down, its previous stories are kept. Full articles are never copied: each story links to the original publisher.

- **Refresh now:** GitHub → Actions → "Update international news" → Run workflow.
- **Add or remove a source:** edit the `FEEDS` list at the top of `scripts/update-international.mjs`.
