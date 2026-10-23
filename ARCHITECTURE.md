# Valkyr Aero — Architecture (prototype → production)

> Status: **clickable prototype**. Everything in the app is DEMO data. This document describes how the prototype is built today and the
> production design it is meant to grow into. Items marked **UNVERIFIED** have not been confirmed against a real file or vendor spec.
> Cost figures are **estimates**, not quotes.

---

## 1. What runs today (prototype)

| Layer | Prototype implementation |
|---|---|
| UI | Vanilla HTML/CSS/JS single-page app, hash routing, works offline from `file://` (`index.html`) |
| Small state | Aircraft, due items, squawks, docs, bookings, budgets, avionics/device maps, limits → one JSON blob in IndexedDB store `kv` (`state`, v2) |
| High-volume data | IndexedDB `valkyr-aero` v2: `logbook` (indexes `date`, `ac_date`, `type_date`, `ac_type_date`) and `expenses` (indexes `date`, `ac_date`, `ref`) behind a small data-access layer (`db.js`) |
| Lists | `list.js`: one generic list control — search, filters, sorts, page sizes, timing readout. Large lists query IndexedDB page-by-page (cursor `advance`), only one page is ever rendered |
| Ingest | `importer.js`: pluggable parser registry + Web Worker (built from a Blob URL so it works from `file://`), chunked 4 MB reads, progress bar; zip via vendored **fflate** (MIT, `vendor/`) |
| FAA data | `data/faa-types.js` (ACFTREF + ENGINE, 94,138 types) and `data/faa-master-{1..9}.js` (MASTER, 317,972 registrations, sharded by first digit, **owner name/address excluded**), lazy-loaded only when Add Aircraft is opened |
| FAA sync | `faasync.js` + Settings › Data sources: dataset version + SHA-256 manifest (`data/faa-version.js`), delta/zip apply as an IndexedDB overlay, change reviews, pinned tier map, unmapped queue, AD applicability, rollback, audit log (section 13–14) |
| Tests | `test/app.test.js` (Puppeteer + Chrome headless) — flows, ledger, importer, FAA library, perf; results in `test/perf-results.json` |

Performance numbers measured on the large dataset are in the README and `test/perf-results.json`.

---

- **Navigation**: Costs is one hub (`views5.js`) with tabs `#/costs`, `#/costs/expenses` and `#/costs/report`. Legacy `#/expenses` and `#/tco` redirect with `location.replace`, keeping `?ac=`. The selected aircraft lives in `VA.costAc`, so all three tabs share it.
- **Query layer** (`db.js`): indexed reads use `getAll(range)` in batches, not cursors. Fleet-wide scans read from a whole-store array cache that a version counter invalidates on every write (`addLogs`, `putLog`, `putExpenses`, `deleteExpense`, clears). Unfiltered totals use `count()`. A new transaction is opened after each `await`, because IndexedDB transactions auto-commit.

## 2. Normalized data model

```
tenant ─┬─ user ── membership(role: owner|pilot|mechanic|viewer, aircraft scope)
        ├─ aircraft ── aircraft_type (FAA ACFTREF code) ── engine_type (FAA ENGINE code)
        │     ├─ component (engine/prop/APU/avionics unit: serial, TSN/TSO/CSN, install/remove)
        │     ├─ due_item (inspection | AD | SB | life-limit | calendar) ── due_rule (hours | cycles | months | first-of)
        │     ├─ maintenance_record (IMMUTABLE, 91.417) ── record_signature ── attachment
        │     ├─ flight (block/air/Hobbs/tach/cycles/landings/fuel, source, dedupe_key)
        │     │     └─ engine_session ── engine_series (downsampled) + raw_blob (object storage)
        │     ├─ squawk (draft|open|deferred|resolved|dismissed; grounding flag; MEL ref)
        │     ├─ booking (blocks on airworthiness)
        │     ├─ expense (18 categories, fixed/variable, ref → flight/squawk/record) ── budget
        │     └─ document (registration, airworthiness cert, insurance, W&B…, expiry) ── attachment
        ├─ device (avionics unit: product, system_id, aircraft_ident) ── device_mapping (learned → aircraft)
        └─ integration_account (ForeFlight, flyGarmin/Garmin FDL API, ADS-B provider…)
reference: faa_aircraft_ref, faa_engine_ref, faa_registration (no owner PII by default), faa_ad (AD feed)
```

Key rules
- **Hours are derived**, never typed twice: aircraft TT/Hobbs/tach = baseline + Σ flights. Due-item remaining = rule − (current − last done).
- **Expenses are a ledger**: fuel lines are generated from flights; maintenance lines from sign-offs/squawk resolutions; TCO/Costs read the ledger only.
- **Matching never merges silently**: an imported session links to an aircraft only after user confirmation, unless confidence ≥ 90 with a clear winner (≥ 20 points ahead); every link stores who/what confirmed it.

---

## 3. Postgres schema (production)

```sql
-- every tenant-owned table carries tenant_id; RLS enforces isolation (section 6)
create table aircraft (
  id uuid primary key, tenant_id uuid not null, tail text not null, faa_code text, engine_code text,
  tier text not null, serial text, year int, base_icao text, tt_baseline numeric(9,1), created_at timestamptz default now(),
  unique (tenant_id, tail));

create table flight (
  id uuid, tenant_id uuid not null, aircraft_id uuid not null, flown_on date not null,
  block_out timestamptz, block_in timestamptz, air_hrs numeric(5,2), hobbs numeric(5,2), tach numeric(5,2),
  landings int, cycles int, fuel_gal numeric(7,1), dep text, arr text, pilot_id uuid,
  source text not null, dedupe_key text, created_at timestamptz default now(),
  primary key (tenant_id, flown_on, id)
) partition by range (flown_on);              -- yearly partitions; 20+ yrs of history stays cheap
create index on flight (tenant_id, aircraft_id, flown_on desc);
create unique index on flight (tenant_id, aircraft_id, dedupe_key) where dedupe_key is not null;

create table expense (
  id uuid, tenant_id uuid not null, aircraft_id uuid, spent_on date not null, category text not null,
  fixed boolean not null, amount_cents bigint not null, vendor text, description text, qty numeric, unit text,
  ref_type text, ref_id uuid, receipt_key text, primary key (tenant_id, spent_on, id)
) partition by range (spent_on);
create index on expense (tenant_id, aircraft_id, spent_on desc);
create index on expense (tenant_id, category, spent_on desc);
create index expense_fts on expense using gin (to_tsvector('simple', coalesce(vendor,'')||' '||coalesce(description,'')));

create table engine_series (            -- downsampled (e.g. 1 point / 30 s) per session; raw 1 Hz file in object storage
  tenant_id uuid, session_id uuid, t timestamptz, param text, value real,
  primary key (tenant_id, session_id, param, t)) partition by range (t);   -- or TimescaleDB hypertable

create table due_item (id uuid primary key, tenant_id uuid not null, aircraft_id uuid not null, kind text, name text, ref text,
  int_hrs numeric, int_cycles int, int_months int, last_hrs numeric, last_date date, required boolean, verified_by uuid, verified_at timestamptz);
create index on due_item (tenant_id, aircraft_id);

create table maintenance_record (       -- append-only; see section 8
  id uuid primary key, tenant_id uuid not null, aircraft_id uuid not null, performed_on date not null,
  description text not null, tt_at numeric, signer_cert text not null, signer_name text not null,
  content_sha256 bytea not null, prev_sha256 bytea, supersedes uuid references maintenance_record(id),
  created_at timestamptz default now());
create index on maintenance_record (tenant_id, aircraft_id, performed_on desc);
```
Derived/rollup tables: `monthly_cost_rollup(tenant, aircraft, month, category, amount)` refreshed on write → TCO for any period is a few hundred rows, not a ledger scan.

---

## 4. Object storage + OCR pipeline

1. Client uploads directly to object storage (S3/GCS) with a pre-signed URL: `tenant/{tid}/aircraft/{aid}/{kind}/{sha256}`. SSE-KMS, per-tenant prefix, versioning + object lock for records (section 8).
2. Event → queue → OCR worker (AWS Textract / Google Document AI). Receipts: vendor/date/total/line items → **draft** expense. Logbook scans: page images → text + key fields (date, TT, description, signer cert #) → **draft** maintenance records for IA review. Nothing OCR'd becomes a record without human confirmation.
3. Raw avionics files (SD cards, zips) are stored as-is (proof + re-parse when a parser improves); parsed sessions keep `raw_key` + parser version.

---

## 5. Integration ingest

| Source | Path | Status / requirement |
|---|---|---|
| **Garmin SD card** (G1000/NXi/Perspective, G3X) | File/zip import (today, in prototype) → parser registry → session → match → confirm | Format verified from published samples (section 10) |
| **Garmin Aviation Flight Data Log API** | Server-to-server pull of flight logs uploaded by Garmin Pilot / Flight Stream 510 / flyGarmin: Hobbs/tach, engine, fuel, position | **Licensed partner API — "License fee applies"; apply via Garmin's "Apply Now" form.** Source: https://developer.garmin.com/flight-data-log/ . We do not have access; no endpoints are invented here |
| **Flight Stream 510 + G1000 NXi / TXi** | Pilot's Garmin Pilot app auto-uploads logs to flyGarmin (legacy G1000/G3X can upload from SD card); flyGarmin offers exceedance alerts | Requires the Garmin FDL API agreement above to reach Valkyr. Sources: Garmin blog posts on flyGarmin engine data/exceedance notifications |
| **ForeFlight** | Logbook/track export (CSV/KML/GPX) today; partner/API access via ForeFlight business development | Prototype only **simulates** ForeFlight auto-import. API specifics **UNVERIFIED** |
| **ADS-B** | Commercial providers (e.g. FlightAware AeroAPI, ADS-B Exchange, Spire) for flight detection when no log arrives → "Did N350VK fly? Confirm 1.3 h" prompt | Paid API key per provider; Mode S hex comes from FAA MASTER |
| **FAA registry** | Daily download of `ReleasableAircraft.zip` (MASTER, ACFTREF, ENGINE, DEREG, RESERVED) → `faa_*` tables; diff → alert on registration expiry/status change | Public: https://registry.faa.gov/database/ReleasableAircraft.zip ; layout: https://registry.faa.gov/database/ardata.pdf |
| **FAA ADs** | Federal Register / FAA DRS AD feed → match by make/model/engine/prop/appliance → draft AD due items for IA applicability review | Applicability determination always requires the IA/DOM |

Ingest service: queue-backed workers, idempotent on `(tenant, source, external_id | dedupe_key)`; dedupe flights by aircraft + date + Δtime ≤ 0.3 h + route (same rule as prototype `VA.findDuplicate`).

---

## 6. Multi-tenant isolation

- Shared Postgres, `tenant_id` on every row, **Row-Level Security** policies `using (tenant_id = current_setting('app.tenant')::uuid)`; app connects as a non-owner role; tenant set per request from the auth token.
- Aircraft-scoped roles (owner / pilot / mechanic / viewer); mechanics free and may belong to many tenants.
- Object storage prefixes per tenant + IAM conditions; KMS key per tenant for records & documents (optional for enterprise).
- Per-tenant export (CSV + PDF + raw files) and hard delete on cancellation (except legally retained records, exported to the owner first).

## 7. Offline-first sync

- Client keeps the prototype's IndexedDB shape (state + logbook + expenses). Writes go to an **outbox** with client-generated UUIDs and Lamport/HLC timestamps.
- Sync endpoint: push outbox, pull changes since cursor (per-table `updated_at` + tombstones). Conflict policy: flights/expenses append-only (no conflict); squawks/bookings last-writer-wins per field with server-side airworthiness re-check (a booking created offline on an aircraft that was grounded meanwhile is flagged, never silently accepted); maintenance records never conflict (immutable).
- Large history is paged lazily (last 24 months local, older on demand).

## 8. Immutable maintenance records (14 CFR 91.417)

14 CFR 91.417 requires the owner/operator to keep records of maintenance, preventive maintenance, alteration, 100-hour/annual/progressive inspections (description, date, signature and certificate number of the person approving return to service) and current status items (TT, life-limited parts, overhaul time, inspection status, AD status incl. method of compliance, major alterations). Source: https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-91/subpart-E/section-91.417

Design: `maintenance_record` is **append-only** (no UPDATE/DELETE grants; corrections are new records that `supersede` the old one); each row stores `content_sha256` and `prev_sha256` (hash chain per aircraft); signed PDFs/scans in object storage with **object lock (WORM)**; periodic chain verification job; full audit log of every read/export of records.

## 9. Backups & DR

Managed Postgres with PITR (7–35 days) + nightly logical dumps to a second region; object storage versioning + cross-region replication; quarterly restore drill; RPO ≤ 5 min, RTO ≤ 4 h targets.

---

## 10. Avionics / engine-data formats — supported matrix (also in-app: Avionics & integrations)

| System | Status | What we read | Sources |
|---|---|---|---|
| Garmin G1000 / NXi / Cirrus Perspective(+) | **Verified** | `data_log/*.csv`: line 1 `#airframe_info, log_version, airframe_name, system_id…`, units row, header row (Lcl Date, Lcl Time, UTCOfst, …, E1 FFlow, E1 OilT, E1 OilP, E1 MAP, E1 RPM, E1 CHT1-4, E1 EGT1-4 …), 1 Hz | NTSB WPR21LA068 G1000 factual report; published DA40 G1000 sample (r/flying, CloudAhoy file); Savvy Aviation data_log guide |
| G1000 turbine parameters (E1 ITT/NG/Torq…) | **UNVERIFIED** | Parsed by keyword if present | — |
| Garmin G3000 / G5000 | **UNVERIFIED** | Expected same `#airframe_info` family | — |
| Garmin G3X / G3X Touch | **Verified** | `#airframe_info … product="GDU …" aircraft_ident, system_id, airframe_hours, engine_hours`; label row + short-name row | Van's Air Force forum example (Aug 2023); Van's "Garmin G3X: How to Export Flight Data" |
| Dynon SkyView / HDX | **Partial** | File name `DATE-TAIL-SN…-USER_LOG_DATA.csv` (tail parsed); first row "Name (Units)". Lat/Lon/CHT/FF header names UNVERIFIED (keyword-mapped) | Dynon SkyView Installation Guide App. F; NTSB WPR21FA243 |
| Avidyne Entegra R9 | **Partial** | `C_ENGINE.CSV`, `C_FLIGHT.CSV`, `C_SYSTEM.CSV` (names verified, merged by time); columns UNVERIFIED | Savvy Aviation R9 guide; Avidyne dealer KB; RISCfuture R9 data loader (GitHub) |
| JPI EDM (.JPI/.DAT) | **Detect-only** | ASCII `$U,tail` / `$C,model` header recognized; binary records not decoded | JPI EDM-900 Pilot Guide; Savvy guide; community JPI filespec (GitHub) |
| GPX | **Verified** | trkpt lat/lon/ele/time | GPX 1.1 schema |
| KML (gx:Track) | **Partial** | when/gx:coord; app-specific variants UNVERIFIED | OGC KML 2.2 |
| EI MVP-50 / CGR-30 | Unsupported | Format not public — "send us a sample" | EI product pages |
| Aspen Evolution | Unsupported | No public log format found | — |
| Garmin TXi EIS / GI 275 EIS | Unsupported | Via flyGarmin/FDL API in production | Garmin blog |
| Collins Pro Line / Honeywell Primus/Apex | Unsupported | OEM ground tools / OEM data services | — |

Unknown files get: *"Unsupported CSV layout — send us a sample and we will add a parser."* Matching: tail in file 95, learned device mapping 92, system_id on file 90, airframe name 40, engine-type ± , home base +15, booking +25; auto-confirm only ≥ 90 with a 20-point lead.

---

## 11. FAA type library, N-number lookup, pricing tiers

**Source:** FAA Aircraft Registration Releasable Database, https://registry.faa.gov/database/ReleasableAircraft.zip (file layout: https://registry.faa.gov/database/ardata.pdf). **The FAA refreshes it daily** (each federal working day). Bundled copy built 2026-10-22 with `tools/build_faa.py`. Production: nightly job downloads, diffs and upserts `faa_*` tables; the app CDN-caches the compact type index.

- `ACFTREF` → type library (code, mfr, model, TYPE-ACFT, TYPE-ENG, BUILD-CERT-IND, NO-ENG, NO-SEATS, AC-WEIGHT class, speed). `ENGINE` → engine type/hp/thrust.
- `MASTER` → N-number lookup: serial, type/engine codes, year, status, cert issue, airworthiness date, expiration, registrant type, Mode S hex, **CERTIFICATION** (airworthiness class + operation codes). **Owner names and addresses are not bundled**; production shows them only if the operator opts in.
- Note: for amateur-built types, FAA ACFTREF's "manufacturer" field is often the builder's name; this is FAA public reference data, but the UI should not surface it prominently.

**Type → tier mapping** (`types.js → classify`)

| Rule | Tier | Price / aircraft / mo |
|---|---|---|
| **Experimental & warbirds** (confirmed by Trevor): MASTER CERTIFICATION class 4 Experimental — every purpose (amateur-built 2, exhibition 3, racing 4, R&D 1, kit-built 7, light-sport 8A/8B/8C …) — **or** class 2 **Limited** (most ex-military warbirds) **or** a known warbird type (L-29/39/59, T-33, MiG, F-86, Hunter, Vampire, Jet Provost, Strikemaster, Magister, T-37/A-37, P-51, P-38, P-40, P-47, F4U, F6F, Spitfire, B-17/24/25, A-26, T-28 …) **or**, without a registration, ACFTREF BUILD-CERT-IND 1. Overrides the jet / turboprop / twin tiers. No review flag | Experimental & warbirds, flat regardless of engine count/type | $29 |
| TYPE-ACFT 6 (rotorcraft), TYPE-ENG turboshaft/turbo* | Turbine helicopter | $149 |
| TYPE-ACFT 6 (rotorcraft), reciprocating | Piston helicopter | $49 |
| TYPE-ENG turbo-jet/turbo-fan, AC-WEIGHT CLASS 3 (≥ 20,000 lb) | Midsize / heavy jet | $399 |
| turbo-jet/fan, class 1–2 | Light jet (class 2 flagged) | $299 |
| turbo-prop / turbo-shaft fixed-wing | Turboprop | $249 |
| piston, ≥ 2 engines, model in heavy list (Baron, Navajo, 310–421, Aerostar…) or ≥ 8 seats | Heavy piston twin (heuristic, flagged) | $149 |
| piston, ≥ 2 engines, otherwise | Light twin | $49 |
| piston single (incl. special light-sport class 9 — S-LSA is not experimental) | Single | $29 |
| MASTER class 3 **Restricted** (ag, firefighting, external load …) — not covered by the warbird rule | By aircraft class, flagged for review | — |
| gyroplane (TYPE-ACFT 9), glider (1), balloon (2) | Single | $29 |
| weight-shift (7), powered parachute (8), other (O), electric | Single, flagged for review (not yet confirmed) | $29 |

Certification codes per ardata.pdf: class 1 Standard, 2 Limited, 3 Restricted, 4 Experimental, 5 Provisional, 6 Multiple, 7 Primary, 8 Special Flight Permit, 9 Light Sport; experimental ops 0 compliance, 1 R&D, 2 amateur built, 3 exhibition, 4 racing, 5 crew training, 6 market survey, 7 operating kit built, 8A/8B/8C light-sport, 9A–9E unmanned.

**Inspection templates** — only sourced intervals; everything else generic for the IA to customize:
- Annual inspection — 14 CFR 91.409(a), 12 calendar months (type-certificated pistons).
- 100-hour inspection — 14 CFR 91.409(b), when carrying persons for hire / flight instruction for hire (optional item).
- Condition inspection — per the aircraft's operating limitations, 12 months (experimental / light-sport).
- Large/turbine multi-engine — 14 CFR 91.409(e)/(f): operator selects a program (manufacturer progressive, CAMP, approved program) → generic placeholder flagged for IA.
- King Air phase program — 200 h / 12 mo placeholder **flagged "confirm intervals in current maintenance manual" (UNVERIFIED)**.

**FAR calendar items** (added to every new aircraft as unverified items for the IA to confirm):
- ELT inspection, 12 calendar months — 14 CFR 91.207(d); ELT battery replacement/recharge — 91.207(c) (1 hr cumulative use or 50% useful life).
- Transponder test, 24 calendar months — 14 CFR 91.413 (with 43 App. F).
- Altimeter / static system / encoder test, 24 calendar months (IFR) — 14 CFR 91.411 (with 43 App. E/F).
- VOR check within the preceding 30 days for IFR — 14 CFR 91.171.
- Registration expiration, 7 years — 14 CFR 47.40.
eCFR: https://www.ecfr.gov/current/title-14 (parts 47, 91).

**Typical avionics per model/year** (pre-selects the parser) is a heuristic table (e.g. Cirrus SR2x 2008+ → Perspective, Cessna 172/182 2005+ → G1000, Van's → G3X/Dynon). **UNVERIFIED** — the user confirms.

---

## 12. Hosting cost per 1,000 aircraft — ESTIMATE

Assumptions: 300 flight-hours/aircraft/yr; 1 Hz engine logs ≈ 1 MB raw per flight-hour (our G1000 samples: ~1 MB per 50-min flight) → ~300 GB/yr raw for 1,000 aircraft (compressed ~60–100 GB); downsampled series in Postgres ~10–20 GB/yr; ~2 GB of documents/scans per aircraft at onboarding; AWS us-east list prices, 2026, rounded.

| Item | Est. $/month |
|---|---|
| Managed Postgres (e.g. 2 vCPU/16 GB Multi-AZ, 500 GB) + PITR | 450–700 |
| App/API + ingest workers (containers) | 150–300 |
| Object storage (≈2.3 TB docs + raw logs growing ~0.1 TB/yr compressed) + requests | 60–90 |
| OCR ongoing (≈500 pages/aircraft/yr) | 50–70 |
| Queue, CDN, egress, email/push | 50–100 |
| Monitoring, logs, backups to 2nd region | 100–200 |
| **Total** | **≈ $860–1,460 / month ≈ $0.90–1.50 per aircraft / month** |

One-time onboarding OCR of historical logbooks (~10,000 pages/aircraft × $1.50/1,000 pages) ≈ **$15 per aircraft**. Third-party data (ADS-B API, Garmin FDL licence fee) is **not included** — fees unknown until partner agreements.

---

## 13. Keeping FAA reference data current (it changes daily)

### Versioning
- Every dataset load is a **version**: `{dataset, version (FAA file date), source zip SHA-256, per-file SHA-256 + size, record counts, built-at}`. Prototype: `data/faa-version.js` (bundled 2026-10-22, zip SHA-256 `5e0778af…c6f9`); tenant state stores the applied version, source hash and history.
- **Record-level keys**: ACFTREF by `CODE` (the 7-character MFR-MDL-SERIES code); ENGINE by `CODE`; MASTER by **N-number + serial number** (a serial change under the same N-number = N-number reassigned to a different airframe); DEREG by N-number + serial + cancel date.
- Production tables: `faa_aircraft_ref`, `faa_engine_ref`, `faa_registration` each with `valid_from_version`, `valid_to_version` (SCD type 2) so any past version can be reconstructed; `faa_dataset_version(version, zip_sha256, files jsonb, counts jsonb, status, applied_at)`.

### Nightly server job (FAA publishes daily)
1. 02:00 local: download `https://registry.faa.gov/database/ReleasableAircraft.zip` (retry with backoff; alert if no new file in 3 days).
2. Hash the zip; if unchanged → record "no change" and stop. Validate: expected files present, header layout matches `ardata.pdf`, row counts within ±2 % of the previous version (guards against truncated/partial files) — otherwise **quarantine** and alert, do not apply.
3. Load into staging tables; diff against current by record key (added / changed field-by-field / removed). Owner names never leave the server: an **owner hash** (salted SHA-256 of NAME + street) is compared to detect ownership change.
4. Apply in one transaction (close `valid_to`, insert new versions); write `faa_change_log(version, table, key, change, old jsonb, new jsonb)`.
5. Fan out per tenant: for each fleet aircraft whose registration record changed — status, expiration date, owner hash / registrant type / certificate-issue date (ownership change), deregistration (DEREG), serial under the same N-number (reassignment), model code — create a **review notification** with old/new side-by-side; registration expiring ≤ 90 days or deregistered also creates/updates a system due-list item (14 CFR 47.40 / 91.203). **User-entered aircraft fields are never overwritten**; accepting a review updates only the FAA snapshot.
6. Model codes → tiers/templates: existing mappings are **pinned** (`type_tier_map(code, tier, template, pinned_by, at)`); if a changed ACFTREF record would classify differently, the pinned mapping is kept and an admin notice is logged. **New codes** land in an **unmapped queue** with a best-guess tier for admin review.
7. Clients receive a compact delta (`valkyr-faa-delta/1`) on next sync and patch their local type index incrementally (prototype: IndexedDB overlay on top of the bundled library).

### Audit, rollback, alerting
- Change log + per-tenant review decisions (who/when/accepted/ignored) are append-only.
- **Rollback**: mark a version `rolled_back`, re-open `valid_to` of the prior rows, retract still-open reviews/system items created by that version (decided reviews are kept for audit). Prototype implements the same for the last applied update.
- Alerts (PagerDuty/Slack): download failure, validation quarantine, diff size anomaly (> N× normal), job runtime, fan-out failures.

### Prototype behaviour
- Settings › Data sources shows dataset version/date, source hash, last synced/checked, record keys and counts.
- **Check for updates** tries to fetch the live zip; from a browser this is blocked by CORS (registry.faa.gov sends no `Access-Control-Allow-Origin`), so the app explains that production syncs server-side. Users can instead load a delta file or a `ReleasableAircraft.zip` they downloaded (full ACFTREF diff + MASTER/DEREG rows for fleet tails, owner columns dropped before anything is stored).
- **Apply sample update (SIMULATED)** loads `samples/faa-update-SIMULATED-2026-10-23.json` (fictitious codes `SIM000x`, fictitious demo tails, fictitious ADs `2026-SIM-xx`).

## 14. Airworthiness Directive changes

**Sources (production):**
- FAA Dynamic Regulatory System (DRS) — AD collection (current, superseded, revised), https://drs.faa.gov — searchable by make/model/product; bulk/API access to be confirmed with FAA (**UNVERIFIED** for automated bulk use).
- Federal Register — AD final rules and emergency ADs published under 14 CFR part 39; the Federal Register API (https://www.federalregister.gov/developers/documentation/api/v1) supports queries by agency (FAA) and CFR part 39. Biweekly AD summaries are also published by FAA.
- 14 CFR part 39 (ADs are mandatory; owner/operator responsible for compliance), https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-39 ; AD status must be in the 91.417(a)(2)(v) records.

**Pipeline:** nightly ingest → parse AD number, status (new / revised / superseding with `supersedes`), effective date, applicability (product type: aircraft / engine / propeller / appliance; make, models, serial ranges, part numbers) → normalized `ad` + `ad_applicability` tables → match against each aircraft's FAA make/model + serial, installed engines, propellers and appliances (component table) → create **“New AD applicability — review”** items (or “Revised / Superseding AD — review”) assigned to the IA/DOM. Matching is deliberately broad (false positives are cheaper than misses); the IA records applicability and method of compliance. **Compliance is never auto-marked**; superseded AD items are left as-is until the IA closes them.

Prototype: the SIMULATED delta carries five fictitious ADs (airframe + serial range, engine, revised/superseding, appliance, and one that matches nothing). Review items are non-grounding until the IA decides.

## 15. Authentication & access control

**What the prototype does (DEMO only).** `auth.js` shows a sign-in screen whenever there's no session, and keeps the requested deep link so it can return there after sign-in. Accounts live only in this browser's `localStorage` (`va.accounts`). The password is never stored. Each account keeps a random 16-byte salt and a PBKDF2-HMAC-SHA-256 hash (150,000 iterations, WebCrypto). The session (`va.session`) holds no secrets. It goes in `localStorage` with "Remember me" and in `sessionStorage` without it. "Forgot password" only shows a confirmation, and nothing is sent. None of this is security: anyone with this browser profile can read or edit it, and the static site has no server to enforce anything. The role switcher ("View as") is a demo convenience.

**Production design**
- **Server-side auth only.** The browser never decides who someone is. A managed or self-hosted identity service (e.g. Auth0, AWS Cognito, Keycloak, Ory, or our own) issues sessions, and the API checks them on every request.
- **Sessions.** Short-lived access tokens plus rotating refresh tokens, or a server session in an `HttpOnly; Secure; SameSite=Lax` cookie. Never tokens in `localStorage`. Add CSRF protection for cookie sessions, revoke on sign-out and on password change, and offer "sign out all devices".
- **Passwords.**
  - Hash with Argon2id (or bcrypt or scrypt, with per-user salt and tuned cost) on the server.
  - Enforce a minimum length and check against known-breached password lists.
  - Rate-limit and lock out per account and per IP.
  - Error messages never reveal whether an email exists.
- **Password reset.**
  - Single-use, hashed, 30-minute token sent by email; old sessions are revoked once the reset completes.
  - **Email verification** is required before billing goes live.
- **MFA.**
  - TOTP and WebAuthn/passkeys, with recovery codes.
  - Required for owners and for anyone who can sign off maintenance (return to service under 14 CFR 43.9/91.417 needs a strongly authenticated signer).
  - Optional for pilots.
- **SSO** for larger operators: SAML/OIDC per organization, configured by the owner. No consumer social logins in v1.
- **Tenancy.** Every row carries `org_id` (see §6), and Postgres row-level security keys off the session's org. Users can belong to several orgs through `memberships(user_id, org_id, role)`. The API resolves the active org on every request.
- **Roles (RBAC), enforced in the API, not the UI:**

| Role | Access |
|---|---|
| owner | Everything, plus billing, members and data sources |
| pilot | Schedule, log flights, squawks, read-only aircraft status |
| mechanic | Maintenance, squawks, sign-offs (IA flag for annuals/ADs), data sources |
| viewer | Optional, read-only |

  - The nav only hides what the API would refuse anyway.
  - Sign-offs record the authenticated user ID, certificate number and timestamp in the append-only log (§8).
- **Audit.** Sign-in, MFA, role, membership, billing and sign-off events go to an immutable audit log.

## 16. Billing (processor-neutral)

**What the prototype does (DEMO only).**
- Sign-up runs: account → aircraft → plan → checkout → app.
  - Each N-number is looked up in the bundled FAA data, and `types.classify` picks the tier. Tails not in the file get a manual tier picker.
  - The plan summary lists each aircraft, its tier, the monthly price and total, plus a free-trial line. The trial length is `VA.BILLING_CONFIG.trialDays = 14`, a placeholder.
  - "Continue to secure checkout" shows a labeled simulated confirmation ("Demo checkout: no card is charged"). No card fields are rendered or collected, and no payment brand is shown.
- The Billing page (owner only, in the account menu) shows:
  - plan per aircraft and the monthly total
  - next invoice date
  - demo invoice history
  - a simulated "Update payment method"
  - add/remove aircraft with proration
- Subscription and invoice records live in `localStorage` (`va.billing`).

**Tiers (per aircraft per month):**

| Tier | Price |
|---|---|
| Single | $29 |
| Light twin | $49 |
| Piston helicopter | $49 |
| Heavy piston twin | $149 |
| Turbine helicopter | $149 |
| Turboprop | $249 |
| Light jet | $299 |
| Midsize/heavy jet | $399 |
| Experimental & warbirds | $29 |

**Source of truth is our database, not the processor.**
```
billing_customers(org_id, provider, provider_customer_id, tax_country, tax_region, tax_exempt_cert_id)
subscriptions(id, org_id, status[trialing|active|past_due|grace|canceled], trial_ends_at, current_period_start, current_period_end,
              anchor_day, provider, provider_subscription_id, cancel_at_period_end)
subscription_items(id, subscription_id, aircraft_id, tier, unit_price_cents, quantity, added_at, removed_at)   -- one row per aircraft
invoices(id, org_id, number, period_start, period_end, subtotal_cents, tax_cents, total_cents, status[draft|open|paid|failed|void],
         provider_invoice_id, hosted_url, pdf_object_key)
invoice_lines(invoice_id, kind[recurring|proration|credit|tax], description, aircraft_id, amount_cents)
billing_events(id, provider, provider_event_id UNIQUE, type, payload_json, received_at, processed_at)        -- idempotent webhook log
```
- The tier comes from our classifier (pinned per aircraft, §11), never from the processor. Prices are versioned (`price_book`), so a price change only affects new periods.
- Line items are per tier with quantities (e.g. `turboprop × 2`, `single × 1`), plus our own per-aircraft breakdown on the invoice.

**Adapter interface.** Each provider is one module, and nothing else in the codebase imports a provider SDK.
```ts
interface BillingAdapter {
  createCustomer(org: Org, contact: BillingContact): Promise<{ providerCustomerId: string }>;
  startCheckout(input: { customerId: string; items: TierLine[]; trialDays: number; successUrl: string; cancelUrl: string })
    : Promise<{ hostedUrl: string; sessionId: string }>;          // hosted payment page: card data never touches our servers (PCI SAQ-A)
  createSubscription(input: { customerId: string; items: TierLine[]; trialEndsAt?: Date; anchorDay?: number })
    : Promise<{ providerSubscriptionId: string }>;                 // TierLine = { tier, unitPriceCents, quantity }
  updateQuantity(subId: string, tier: Tier, quantity: number, opts: { prorate: true; effective: 'now' | 'period_end' })
    : Promise<{ prorationCents: number }>;
  updatePaymentMethod(customerId: string, returnUrl: string): Promise<{ hostedUrl: string }>;
  cancel(subId: string, opts: { atPeriodEnd: boolean }): Promise<void>;
  parseWebhook(rawBody: Buffer, headers: Record<string, string>): BillingEvent;   // verify signature, normalize
}
type BillingEvent =
  | { type: 'invoice.paid'; providerInvoiceId: string; amountCents: number; periodEnd: Date }
  | { type: 'invoice.payment_failed'; providerInvoiceId: string; attempt: number; nextRetryAt?: Date }
  | { type: 'subscription.canceled'; providerSubscriptionId: string; at: Date }
  | { type: 'subscription.updated'; providerSubscriptionId: string };
```
- **Webhook handler.**
  - Verify the signature, then insert into `billing_events` with a unique `provider_event_id`, so duplicates are no-ops.
  - Handle events on a queue, in order per subscription. Update `subscriptions` and `invoices`, and never trust client redirects.
  - `paid` → status active, store invoice and PDF. `failed` → start dunning. `canceled` → set status canceled at period end.
- **Proration.** Adding or removing an aircraft calls `updateQuantity(..., prorate)`. Our own math: tier price × days left in the period ÷ days in the period, charged or credited on the next invoice. It is shown before confirming and must match the provider's number within one cent, or we alert. No proration during the trial.
- **Dunning and grace period.**
  - Retries on days 1, 3, 5 and 7, with an email at each step plus an in-app banner for owners.
  - After the last retry: `grace` for 7 days, all features still on.
  - Then `past_due`: read-only. Logging and maintenance records stay readable and exportable, because records required by 91.417 are never held hostage.
  - Cancel at 30 days. Data is kept 90 days, then deleted after an export offer.
- **Sales tax.** SaaS is taxable in some US states (e.g. TX, NY, PA, WA, CT, OH, at varying rates and rules). Options:
  - **(a)** A merchant of record collects and remits everything and is the seller on the receipt.
  - **(b)** A gateway plus a tax engine (e.g. Avalara, TaxJar, Anrok, Numeral), computed from the billing address, with exemption certificates stored on `billing_customers`. Register where economic nexus is reached.
  - Tax is a separate invoice line.
- **Candidate providers** (any one plugs in behind the adapter):
  - **Merchant of record (handles global sales tax/VAT, fastest to launch):** Paddle, Lemon Squeezy.
  - **Gateways (we own the subscription logic and tax engine):** Braintree, Square, Authorize.net, Helcim.
  - **Subscription layers over a gateway (proration, dunning and invoicing out of the box):** Chargebee, Recurly.
  - Recommendation for v1: a merchant of record, because tax and fewer moving parts matter more for 1–5-aircraft customers. Keep the adapter so a later move to a gateway plus tax engine doesn't reach the domain model.
