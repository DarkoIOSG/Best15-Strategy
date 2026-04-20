# Best15 Strategy Dashboard

A Next.js dashboard for monitoring the Best15 crypto strategy — portfolio performance, rebalance history, and the BTC Cycle Signal model.

## Pages

| Route | Description |
|---|---|
| `/` | Main dashboard — cumulative returns, drawdown, monthly heatmap, metrics, asset comparison, latest weights |
| `/cycle-signals` | BTC Cycle Signal — daily exposure, composite score, vol regime, signal breakdown, 90-day chart |

## Data Updates

Two GitHub Actions workflows run automatically each day:

- **`update-performance.yml`** — 08:00 UTC — runs `update_performance.py`, writes `data/performance.json`
- **`update-cycle-signals.yml`** — 09:00 UTC — runs `cs_morning_report_v2_2_2.py`, writes `data/cycle_state.json`, `data/cycle_history.json`, and appends to `data/combo_v2_vol_regime.csv` / `data/exposure_v2_vol_regime.csv`

Both workflows commit and push the updated data files automatically.

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Running the Cycle Signal Script Locally

Requires a `CRYPTOQUANT_KEY` and `FRED_API_KEY` environment variable.

```bash
pip install -r requirements.txt
CRYPTOQUANT_KEY=xxx FRED_API_KEY=xxx python scripts/cs_morning_report_v2_2_2.py
```

Output is written to `data/cycle_state.json` and `data/cycle_history.json`.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Recharts
- **Data pipeline**: Python (pandas, yfinance, fredapi)
- **Automation**: GitHub Actions (scheduled daily)

## Required Secrets

Set these in GitHub → Settings → Secrets → Actions:

| Secret | Purpose |
|---|---|
| `CRYPTOQUANT_KEY` | CryptoQuant API — on-chain BTC data |
| `FRED_API_KEY` | FRED API — macro indicators |
