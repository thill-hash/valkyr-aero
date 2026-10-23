# Valkyr Aero — clickable prototype (DEMO)

"The flight department in a box for 1–5 aircraft." Open `index.html` in Chrome/Edge/Safari — no server and no build step, and it works offline. Everything is **DEMO** data. The N-numbers N350VK / N612VK / N813ZK, and the large-dataset tails, were checked as **not** present in FAA MASTER, RESERVED or DEREG (2026-10-22).

## Screens
Sign in (DEMO: Explore the demo, email + password, Remember me, Forgot password, Create account) · Sign-up with billing (account → aircraft via FAA N-number lookup → plan + 14-day trial → simulated checkout) · Fleet · Aircraft detail · Schedule (blocks unairworthy aircraft) · Log flight (simulated ForeFlight, CSV import) · SD-card import (any avionics card or zip) · Maintenance (fleet due list) · Squawks (incl. auto-detected drafts) · Engine trends · Costs (tabs: Overview `#/costs`, Expenses `#/costs/expenses`, Report `#/costs/report`; old `#/expenses` and `#/tco` links redirect) · Integrations · Data sources (FAA registry versioning/updates, change review, AD feed) · Add aircraft (FAA N-number lookup + type library) · Plans.

## Pricing (per aircraft per month)
| Tier | Price |
|---|---|
| Midsize / heavy jets | $399 |
| Light jets | $299 |
| Turboprops | $249 |
| Turbine helicopters | $149 |
| Heavy piston twins | $149 |
| Piston helicopters | $49 |
| Light twins | $49 |
| Single-engine pistons, gyroplanes, gliders, balloons | $29 |
| Experimental & warbirds — $29 flat: homebuilt, racing, exhibition, every other experimental purpose, Limited category; any engine incl. jets (L-39, T-33, MiG, P-51) | $29 |

The demo fleet costs $527/mo ($6,324/yr). Mechanics are always free, there are no setup fees, and billing is month-to-month. Competitor line: $7,000–$20,700/yr for 3 aircraft.

## Files
- `index.html`, `styles.css`
- `db.js` (IndexedDB data-access layer), `data.js` (seed), `app.js` (state, airworthiness engine, ledger, routing), `list.js` (generic list control)
- `views*.js` (screens)
- `gen.js` (history + large dataset generator), `csv.js` (CSV and Garmin import, exceedances)
- `importer.js` (universal parser registry + Web Worker), `types.js` (FAA type library, tiers, templates), `faasync.js` (FAA versioning, deltas, reviews, AD matching)
- `data/` — FAA-derived data, built by `tools/build_faa.py` from ReleasableAircraft.zip (owner names/addresses excluded). `faa-version.js` holds the dataset version and SHA-256 hashes.
- `vendor/fflate.min.js` (MIT)
- `samples/` — DEMO avionics files, CSVs, `demo-sd-card.zip`, and `faa-update-SIMULATED-2026-10-23.json`. Regenerate with `node tools/make_samples.js` and `node tools/make_faa_update.js`.
- `test/app.test.js` — headless end-to-end tests, perf numbers and screenshots. Results go to `test/perf-results.json`.
- `ARCHITECTURE.md` — production design, data sources and citations, format matrix, FAA/AD sync, and the cost estimate.

## Run tests
```
mkdir -p /tmp/vtest && cd /tmp/vtest && npm i puppeteer-core fflate
cp /path/to/valkyr-aero/test/app.test.js . && node app.test.js     # uses /usr/bin/google-chrome
```

## Performance (headless Chrome, measured by test/app.test.js — Chrome/155.0.8059.84)
| Measure | Result |
|---|---|
| Standard demo cold boot (seed + IndexedDB) | 704 ms |
| Large dataset generation (50 aircraft, 251,583 logbook rows, 46,089 expenses) | 26.0 s |
| Cold boot on large dataset (to interactive fleet) | 1581 ms |
| Fleet render, 50 aircraft | 20 ms |
| Fleet search redraw ("King") | 1 ms (+90 ms debounce) |
| Fleet-wide due list (481 items) | 8.7 ms |
| Logbook page 1, one aircraft | 25.4 ms |
| Logbook deep seek (offset 5,000) | 45.2 ms |
| Logbook text search, one aircraft | 45.5 ms |
| Logbook page 1, whole fleet (251k rows, with total count) | 277.6 ms (was 906 ms) |
| Logbook text search, whole fleet (first search; later searches reuse the cache) | 1774.8 ms (was 4,505 ms) |
| Expenses page 1, whole fleet (with count + sum) | 24.5 ms (was 922 ms) |
| Expenses aircraft + category filter | 16.7 ms |
| Expenses text search, whole fleet | 16.7 ms (was 921 ms) |
| Costs › Report, fleet, trailing 12 months | 311.8 ms (was 1,069 ms) |
| SD-card zip ingest (Web Worker) | 96 ms |
| 1,000-row flights CSV import | 147 ms |
| FAA type library load (94,138 types) | 1294 ms |
| Type search "Cessna 172" | 11 ms |
| N-number lookup (lazy shard load) | 469 ms |

Speed-ups in the polish pass: index `getAll` batches instead of per-row cursors; a cached copy of the whole store for fleet-wide search, cleared on every write; and `count()` for unfiltered totals. The first whole-fleet text search still scans everything (about 1.8 s on 250k rows). Production would serve these from Postgres (indexes, FTS and rollups; see ARCHITECTURE.md).

## Polish pass (2026-10-23)
- Costs, Expenses and TCO are now one **Costs** nav item with Overview / Expenses / Report tabs. The aircraft picker is shared across the tabs, and old links redirect.
- Accessibility: visible keyboard focus everywhere, a "Skip to content" link, `aria-current` on the active nav item, toasts announced to screen readers, and modals that trap focus, close on Esc and return focus to what opened them. The dim-text colour was raised to 4.7:1 contrast.
- Forms show errors inline next to the field (`aria-invalid` plus the message) instead of only a toast.
- Lists: a loading spinner on slow queries, an error message with "Try again", and a "No matches" message with "clear filters". Lists also recover when the current page is past the end.
- Hover and press transitions, with reduced motion respected. Mobile fixes for tabs and list toolbars.

## Sign-in and billing (DEMO)
- First load shows the sign-in screen. **Explore the demo** signs in as the demo owner (Trevor Hill), or choose Pilot or Mechanic. Deep links are kept: open `#/costs/report` signed out, sign in, and you land there.
- **Create account:** account details → add aircraft by N-number (FAA lookup picks the tier; tails not in the file get a tier picker) → plan summary with a 14-day free trial (`VA.BILLING_CONFIG.trialDays`, placeholder) → "Continue to secure checkout" → *Demo checkout: no card is charged* → into the app with an active subscription.
- The header avatar menu holds **View as** (owner, pilot, mechanic), **Account**, **Billing** (owners only) and **Sign out**.
- Billing shows the plan per aircraft, the monthly total, the next invoice, demo invoices, a simulated payment-method update, and add/remove aircraft with a proration note.
- Accounts are stored only in this browser. Passwords are never stored, only a salted PBKDF2-SHA-256 hash (WebCrypto). No third-party sign-in or payment branding. Production auth and billing: ARCHITECTURE.md §15–16.
