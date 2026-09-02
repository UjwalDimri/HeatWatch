# HeatWatch

**A personalized human thermal-stress monitoring prototype** — Smart India Hackathon.

HeatWatch computes the scientific thermal stress of the environment (**UTCI**) from live
temperature, humidity, wind and solar radiation, then personalizes that number into an
**HTSI** using each user's reported exposure and vulnerability profile.

> **Same environment → same UTCI. Different people → potentially different HTSI.**
> That separation is the core principle of the system: UTCI represents the environment;
> HTSI represents personalized risk.

---

## 1. Problem

Heatwaves do not affect everyone equally. Air temperature alone understates outdoor thermal
stress (it ignores radiation, humidity and wind), and a single city-wide number ignores that
an outdoor labourer doing heavy work for 8 hours faces very different risk than an office
worker in the same city. HeatWatch addresses both gaps:

1. **Scientific environmental stress** — the Universal Thermal Climate Index (UTCI), computed
   from air temperature, mean radiant temperature (Tmrt), wind speed and water vapour pressure.
2. **Personalized risk** — the Heat Thermal Stress Index (HTSI), which layers the user's
   exposure, activity, vulnerability and protection profile on top of the UTCI.

## 2. Architecture

```
OPEN-METEO (live)                    NASA POWER + IMD (historical)
      │                                        │
      ▼                                        ▼
Temperature · Humidity · Wind · Radiation   (same canonical schema)
      │                                        │
      ▼                                        ▼
Vapour pressure + Tmrt ──► ΔTmrt ──► UTCI ──► UTCI category
      │                                        │
      ▼                                        ▼
USER PROFILE (age, occupation,        SYNTHETIC vulnerability
exposure, activity, vulnerability,    profiles (seed 42)
acclimatization, protection)                   │
      │                                        ▼
      ▼                              synthetic_rule HTSI labels
    HTSI ◄──────────────────────────  Random Forest model
      │
      ▼
 RISK LEVEL (LOW / MODERATE / HIGH / VERY HIGH / EXTREME)
      │
 ┌────┼──────────────┐
 ▼    ▼              ▼
CITIZEN  GOVERNMENT  ADMIN
dashboard  GIS map   system console
 │           │
ALERTS    HOTSPOTS (Leaflet + OpenStreetMap)
```

The **same calculation modules** (`calculations/`) are used by the historical/training
pipeline and the live prediction pipeline — there is exactly one vapour-pressure formula,
one Tmrt implementation and one UTCI implementation in the codebase.

## 3. Technology stack

| Layer      | Technology |
|------------|-----------|
| Frontend   | EJS, HTML5, CSS3, vanilla JavaScript, Chart.js |
| GIS        | Leaflet.js + OpenStreetMap (base map only — OSM/Leaflet never compute risk) |
| Backend    | Node.js + Express.js |
| Database   | MongoDB + Mongoose |
| Auth       | bcrypt password hashing + JWT (httpOnly cookie), role middleware |
| Model      | ml-random-forest (pure JS — the backend stays Node.js) |
| Tests      | Node's built-in `node:test` runner |

## 4. Folder structure

```
heatwatch/
├── app.js                    Express entry point
├── config/                   database connection, risk levels/colors
├── calculations/             vapourPressure, tmrt, utci, utciCategory, htsi (rule engine)
├── services/                 openMeteo, nasaPower, imd, nominatim adapters;
│                             canonical schema; thermalPipeline; riskPipeline; logger
├── models/                   User, UserProfile, RiskPrediction, Alert, Location, LogEntry
├── middleware/               auth (JWT), role, errorHandler
├── ml/                       features, train, predict, evaluation, modelMetadata
├── scripts/                  generateSyntheticProfiles, seedUsers, buildTrainingData,
│                             trainModel, seedDemoMap
├── routes/                   auth, weather, utci, risk, government, admin, location,
│                             map, alerts, pages
├── views/                    EJS pages + partials
├── public/                   css/, js/ (dashboard, government, admin, map, charts)
├── data/raw/                 user_vulnerability.csv (synthetic)
├── data/processed/           weather_data.csv, utci_data.csv, htsi_training_data.csv
├── model_store/              htsi_model.json, model_metadata.json, model_metrics.json
└── tests/                    40 tests (calculations, pipeline, services, model, DB)
```

## 5. Setup

### Prerequisites
- Node.js ≥ 18 (developed on 22)
- MongoDB running locally (or a connection string)

### Install & configure
```bash
npm install
cp .env.example .env        # then edit
```

`.env` variables:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | e.g. `mongodb://127.0.0.1:27017/heatwatch` |
| `JWT_SECRET` | any long random string (required) |
| `PORT` | default 3000 |
| `IMD_API_BASE` | *optional* — IMD endpoint base URL if you have access. When unset, the IMD adapter reports `unconfigured`/`unavailable` honestly; it never fabricates Indian data. |

### Prepare data, accounts and the model
```bash
npm run generate:synthetic          # data/raw/user_vulnerability.csv (default 2,000 rows, seed 42)
node scripts/generateSyntheticProfiles.js 100000 42   # full 100k dataset if desired
npm run seed:users                  # demo accounts + imports synthetic profiles into MongoDB
npm run build:training -- --demo    # offline training data (clearly labelled synthetic_demo)
# or with real history: npm run build:training -- --lat 27.18 --lon 78.01 --start 20240401 --end 20240430
npm run train:model                 # trains the HTSI Random Forest, writes model_store/
node scripts/seedDemoMap.js         # populates the government GIS map with labelled demo points
node scripts/seedDemoMap.js --live  # ...or with real Open-Meteo data (needs network)
```

### Run
```bash
npm start                           # http://localhost:3000
npm test                            # 40 tests; DB tests auto-skip if MongoDB is down
```

### Demo accounts (created by `npm run seed:users`)
| Role | Email | Password |
|---|---|---|
| Citizen | `citizen@heatwatch.demo` | `heatwatch-demo` |
| Government | `government@heatwatch.demo` | `heatwatch-demo` |
| Admin | `admin@heatwatch.demo` | `heatwatch-demo` |

## 6. Data sources & separation of responsibilities

| Source | Role | Notes |
|---|---|---|
| **Open-Meteo** | Primary **live** source | `temperature_2m`, `relative_humidity_2m`, `wind_speed_10m`, `shortwave_radiation`, `direct_radiation`, `diffuse_radiation`, `direct_normal_irradiance`, `cloud_cover` — only variables the endpoint actually supports. |
| **NASA POWER** | **Historical/supplementary** only | Hourly `T2M`, `RH2M`, `WS10M`, short-wave components and measured `ALLSKY_SFC_LW_DWN` (downward long-wave). Fill values (−999) become `null`, never numbers. Never called on live requests. |
| **IMD** | Indian **fallback** | Used only if `IMD_API_BASE` is configured; otherwise status = `unavailable`. Open-Meteo/NASA data is never relabelled as IMD. |
| **Nominatim** | Optional **geocoding** | Place-name → lat/lon only. Not a weather API. |
| **OpenStreetMap / Leaflet** | Base map / visualization | They display risk; HeatWatch computes it. |

Every environmental record carries lineage: `source` (`open_meteo` \| `nasa_power` \| `imd` \|
`synthetic_demo`), `sourceTimestamp`, `retrievedAt`, coordinates, and status fields.
Fallback use is surfaced to the frontend (`dataStatus: "fallback"`), never hidden.

## 7. Scientific calculations

- **Vapour pressure** (`calculations/vapourPressure.js`) — Magnus/Tetens over water:
  `es = 0.61094·exp(17.625·T/(T+243.04))` kPa, `e = es·RH/100`. Inputs °C and %, output kPa.
- **Tmrt** (`calculations/tmrt.js`) — six-directional radiation balance on a standing person:
  `Tmrt = (Sstr/(fa·ε·σ))^0.25 − 273.15` with σ = 5.670374419×10⁻⁸, α ≈ 0.7, ε ≈ 0.97,
  fa = 0.5 (long-wave view halves), projected-area factor fp(γ) for direct beam, ground
  albedo 0.2 for `Sref`, solar position computed from timestamp + coordinates.
  - If measured `Ldown`/`Lup` are present (NASA POWER): `tmrt_status = "calculated"`.
  - If long-wave must be estimated from Ta, vapour pressure and cloud cover (Open-Meteo
    provides no long-wave): `tmrt_status = "approximation"` — an **explicitly labelled
    approximation mode**, shown as such in the UI.
  - If short-wave radiation inputs are missing: `tmrt_c = null`, `tmrt_status = "unavailable"`.
    **Air temperature is never silently substituted for Tmrt.**
- **UTCI** (`calculations/utci.js`) — the official 6th-order polynomial regression of the
  UTCI-Fiala model (Bröde et al. 2012; the same coefficient set used by `pythermalcomfort`
  and the reference Fortran). Deterministic — **no ML computes UTCI.** Conventions verified
  and tested: Ta −50…50 °C, ΔTmrt −30…70 K, wind is 10 m wind clamped to 0.5…17 m/s,
  vapour pressure in kPa internally (polynomial term in Pa/1000). Reference case
  Ta=25, Tmrt=25, v=1.0, RH=50% → **24.6 °C** (unit test enforces it).
- **UTCI categories** (`calculations/utciCategory.js`) — the standard 10-band official
  stress scale ("no thermal stress", "strong heat stress", …), kept strictly separate from
  the application's HTSI risk levels.

## 8. HTSI — the personalization layer

`HTSI = f(UTCI, profile)` where the profile contributes: age / age-vulnerability flag
(prototype rule: age < 5 or ≥ 65), health-risk category, multiple conditions, outdoor
exposure hours + category, activity level, occupational heat exposure, heat acclimatization,
cooling / hydration / shade access, protective clothing, break frequency.

- **Rule engine** (`calculations/htsi.js`): transparent additive scoring (0–100) with a
  per-factor breakdown that the citizen dashboard shows under "Why this level?".
- **Random Forest model** (`ml/`): trained on `htsi_training_data.csv` where labels come
  from the same rule engine (`label_source = synthetic_rule`). The live pipeline uses the
  trained model when present and degrades to the rule engine otherwise (`modelStatus`
  reports which). **The ML layer never replaces UTCI** — if UTCI is unavailable, HTSI is
  unavailable.
- **Training hygiene**: chronological split (earlier → train, later → test — no future
  leakage), identical feature preprocessing (`ml/features.js`) for training and live,
  versioned artifacts in `model_store/` (never silently overwritten),
  `model_metadata.json` + `model_metrics.json` (MAE / RMSE / R² and risk-level accuracy /
  precision / recall / F1 / confusion matrix).

## 9. Dashboards

- **`/dashboard` (Citizen)** — current conditions, thermal environment (vapour pressure,
  Tmrt, UTCI + category with status chips), personalized HTSI with risk level, scale
  marker, factor-by-factor explanation, alerts, and history charts (temperature, UTCI,
  HTSI). GPS or Nominatim place search.
- **`/government`** — full-bleed Leaflet + OSM GIS map of latest stored assessment points,
  color-coded by risk level, marker popups with full environmental + thermal + risk detail
  and source (synthetic points prominently labelled **SYNTHETIC / DEMO DATA**), regional
  statistics and risk-distribution chart.
- **`/admin`** — system statistics, user management view, **live API probes** for
  Open-Meteo / NASA POWER / IMD / Nominatim (real connectivity checks — never hard-coded
  "Operational"), data-file status, model version/metrics, and system logs (API failures,
  fallback events, calculation errors, auth events).

Role middleware enforces: citizens cannot reach `/government` or `/admin`; government
cannot reach `/admin`.

## 10. Alerts

When a stored assessment reaches risk level **HIGH** or above, an alert is created
(severity = risk level, message includes UTCI and HTSI, source preserved) and shown on the
citizen dashboard. Alert language is advisory ("Personalized heat risk is currently
HIGH…") — never a medical diagnosis or a guarantee of outcome.

## 11. Missing data & error handling

Central rule: **never fabricate, never silently substitute.**

- Missing humidity → vapour pressure `unavailable` → UTCI `unavailable`.
- Missing radiation → Tmrt `unavailable` → UTCI `unavailable` → risk `unavailable`, with a
  human-readable explanation ("Required environmental radiation data is unavailable,
  therefore UTCI cannot currently be calculated.").
- Open-Meteo failure → configured fallback attempted (IMD if available), surfaced as
  `dataStatus: "fallback"`; if nothing is available → HTTP 503 with
  `dataStatus/utciStatus/riskStatus = "unavailable"`.
- Centralized Express error handler; all failures logged to the `LogEntry` collection and
  visible in the admin dashboard.

Status vocabulary: `dataStatus` complete/fallback/demo/unavailable ·
`tmrtStatus` calculated/approximation/unavailable · `utciStatus` calculated/unavailable ·
`modelStatus` calculated/unavailable.

## 12. Testing

`npm test` runs 40 tests:

- Vapour pressure against known Magnus values; Tmrt physics (sunny > Ta, night ≈ Ta,
  measured long-wave → `calculated`, missing radiation → `unavailable` with **no** air-temp
  substitution); UTCI against the published reference value and determinism/clamping/domain
  checks; official category mapping.
- **The critical scientific test (spec §62)**: User A (outdoor labour, high exposure, heavy
  activity) and User B (software engineer, low exposure, light activity) under *identical*
  environment → **identical UTCI, different HTSI (A > B)**.
- Canonical schema lineage + validation; full pipeline missing-data cascades;
  training/live consistency (same record → same outputs).
- Open-Meteo / NASA POWER normalization with mocked HTTP; IMD unconfigured behavior.
- Feature encoding, metric sanity, model-fallback interface.
- DB-backed integration tests (signup → profile, duplicate/bad-login rejection, bcrypt
  hashes, role authorization, end-to-end `/api/risk` with mocked extreme-heat weather →
  alert generation, logout). These auto-skip with a notice when MongoDB is unreachable.

## 13. Limitations & disclaimers

- **Synthetic data**: `user_vulnerability.csv` (seed 42) and all `synthetic_demo` records
  are generated for prototype development, testing and demonstration. They are **not real
  patient data** and the encoded occupation/health relationships are **not medically
  validated causal relationships**. The age-vulnerability rule (age < 5 or ≥ 65) is a
  prototype feature, not an official medical rule.
- **HTSI is not medically validated.** Training labels are `synthetic_rule` prototype
  labels, not clinical outcomes. HeatWatch provides *estimated personalized heat risk* —
  never diagnosis, never guaranteed outcomes.
- **Tmrt approximation mode**: with Open-Meteo (no long-wave variables), long-wave fluxes
  are estimated (Prata-style clear-sky emissivity + cloud correction) and the result is
  explicitly labelled `approximation`. NASA POWER's measured `LW_DWN` yields
  `calculated` status in the historical pipeline.
- **IMD access** depends on credentials/endpoints you actually have; without configuration
  the adapter honestly reports `unavailable`.
- This build was validated in a sandbox without outbound access to the weather APIs and
  without a running MongoDB; live-API code paths are covered by mocked-HTTP tests and the
  admin dashboard's real probes will reflect your environment at runtime.
# HeatWatch
