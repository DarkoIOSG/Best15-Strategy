"""
btc_combined_backtest.py  –  v5.0
==================================
Nine strategies combining:
  A) signals_backtesting_ml.py  – 31 on-chain/macro signals, ternary ML walk-forward
  B) btc_regime_backtest.py     – technical signals + walk-forward combinatorics

Signal convention (consistent across both source files):
  Positive composite → bearish (increase cash / reduce BTC exposure)
  Negative composite → bullish (reduce cash / increase BTC exposure)

Requirements:
  pip install yfinance pandas numpy matplotlib scipy requests
  CRYPTOQUANT_KEY env var  – optional (enables on-chain signals; proxies used without it)
  FRED_API_KEY env var     – optional (enables real HY Spread)
"""

import numpy as np
import pandas as pd
import yfinance as yf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from dataclasses import dataclass
from itertools import combinations
from abc import ABC, abstractmethod
from scipy.stats import spearmanr
import os
import pickle
import time
import hashlib
import warnings
import requests

warnings.filterwarnings("ignore")

try:
    from fredapi import Fred
    FRED_AVAILABLE = True
except ImportError:
    FRED_AVAILABLE = False

# ============================================================
# 1. GLOBAL CONFIG
# ============================================================

EVAL_START  = "2020-01-01"
TRAIN_START = "2015-01-01"
OUT_DIR     = os.path.expanduser("~")

FWD_HORIZONS    = [3, 7, 14, 30, 90, 180]
HORIZON_WEIGHTS = {3: 0.05, 7: 0.10, 14: 0.15, 30: 0.30, 90: 0.25, 180: 0.15}
MIN_EVENTS      = 5
CLUSTER_GAP     = 30
FEE_PER_UNIT    = 0.0010

S1_N_SIGNALS         = 10
S1_SELECTION_WINDOW  = 1095
S1_HIST_RETURN_DAYS  = 365
S1_PERCENTILE_WINDOW = 730
S1_PERCENTILE_HI     = 80
S1_PERCENTILE_LO     = 20
S1_MIN_VALID_FRAC    = 0.70
S1_CASH_MIN          = 0.20
S1_CASH_MID          = 0.35
S1_CASH_MAX          = 0.50
S1_SIGMOID_K         = 3.0
S1_WIDE_CASH_MIN     = 0.00
S1_WIDE_CASH_MAX     = 0.50

MVRV_REGIME_BOUNDS = [
    ("COLD",    -np.inf,  0.0),
    ("NEUTRAL",  0.0,     2.0),
    ("HOT",      2.0,     5.0),
    ("EXTREME",  5.0,  np.inf),
]
MIN_REGIME_TRAIN_DAYS = 120

DELTA_LOOKBACKS = [7, 30]
DELTA_SIGNAL_COLS = [
    "MVRV", "SOPR", "SOPR_Adj", "STH_SOPR", "LTH_SOPR",
    "NVT", "NVM", "S2F_Dev", "Exch_Reserve", "Exch_Netflow",
    "Whale_Ratio", "MPI", "Puell", "SOPR_Ratio", "SSR",
    "Dormancy", "Lev_Ratio", "Open_Interest", "Coinbase_Prem", "NRPL",
    "MVRV_Proxy", "Puell_Proxy", "RealVol_30", "RealVol_90",
    "LR_1Y", "LR_2Y_Z", "VIX", "DXY", "SP500_Trend", "Gold_90d",
]

TIER_THRESHOLDS = [0.35, 0.60]
MIN_CONFIDENCE  = 0.20
PRESCREEN_N     = 20
GATE_SWEEP_LEVELS = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50]

CONVICTION_GAMMA = 2.0
V5_VARIANTS = {
    "V0 Base":     (30,  False, None),
    "V1 +M":       (30,  True,  None),
    "V2 +Cg2":     (30,  False, 2.0),
    "V2b +Cg1":    (30,  False, 1.0),
    "V3 +M+Cg2":   (30,  True,  2.0),
    "V4 +H90":     (90,  False, None),
    "V5 +H90+Cg2": (90,  False, 2.0),
}

RETRAIN_MONTHS = 3

STRATEGY_BENCHMARK = {
    "Base":                   "BTC 75% Fixed",
    "Base+Delta":             "BTC 75% Fixed",
    "Base+MVRV":              "BTC 75% Fixed",
    "Base+Delta+MVRV":        "BTC 75% Fixed",
    "Base+MVRV+Tiered":                "BTC 75% Fixed",
    "Base+MVRV+Gate":                 "BTC 75% Fixed",
    "Base+MVRV+Tiered+Gate":          "BTC 75% Fixed",
    "Base+Delta+MVRV+Gate":           "BTC 75% Fixed",
    "Base+Delta+MVRV+Gate (PS20)":    "BTC 75% Fixed",
}

RETRAIN_STUDY = os.environ.get("RETRAIN_STUDY", "0") == "1"

CQUANT_BASE = "https://api.cryptoquant.com/v1"

CACHE_DIR           = os.path.expanduser("~/.btc_cache")
CACHE_MAX_AGE_HOURS = 24
FORCE_REFRESH       = os.environ.get("FORCE_REFRESH", "0") == "1"
os.makedirs(CACHE_DIR, exist_ok=True)


# ============================================================
# CACHE HELPERS
# ============================================================

def _cache_path(key: str) -> str:
    safe = hashlib.md5(key.encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{safe}.pkl")


def _is_stale(path: str, max_age_hours: float = CACHE_MAX_AGE_HOURS) -> bool:
    if not os.path.exists(path):
        return True
    return (time.time() - os.path.getmtime(path)) / 3600 > max_age_hours


def _load_cache(key: str):
    path = _cache_path(key)
    if FORCE_REFRESH or _is_stale(path):
        return None
    try:
        with open(path, "rb") as f:
            return pickle.load(f)
    except Exception:
        return None


def _save_cache(key: str, data) -> None:
    path = _cache_path(key)
    try:
        with open(path, "wb") as f:
            pickle.dump(data, f)
    except Exception as e:
        print(f"  Cache write failed: {e}")


# ============================================================
# 2. CRYPTOQUANT API HELPERS
# ============================================================

def _fetch_cquant(endpoint: str, token: str, field: str,
                  start: str = TRAIN_START, exchange: str = None):
    params = {"window": "day", "from": start.replace("-", ""), "limit": 10000}
    if exchange:
        params["exchange"] = exchange
    headers = {"Authorization": f"Bearer {token}"}
    try:
        r = requests.get(f"{CQUANT_BASE}/{endpoint}",
                         params=params, headers=headers, timeout=30)
        if r.status_code != 200:
            print(f"  CQ {endpoint}: HTTP {r.status_code}")
            return None
        rows = r.json().get("result", {}).get("data", [])
        if not rows:
            return None
        df = pd.DataFrame(rows)
        if "date" not in df.columns or field not in df.columns:
            print(f"  CQ {endpoint}: missing col (have: {list(df.columns)[:6]})")
            return None
        df["date"] = pd.to_datetime(df["date"])
        s = pd.to_numeric(df.set_index("date")[field], errors="coerce")
        s.name = field
        return s.sort_index()
    except Exception as e:
        print(f"  CQ {endpoint}: {e}")
        return None


def fetch_cquant_signals(token: str, start: str = TRAIN_START) -> dict:
    FETCHES = {
        "MVRV":          ("btc/market-indicator/mvrv",                       "mvrv",                       None),
        "SOPR":          ("btc/market-indicator/sopr",                       "sopr",                       None),
        "SOPR_Adj":      ("btc/market-indicator/sopr",                       "a_sopr",                     None),
        "STH_SOPR":      ("btc/market-indicator/sopr",                       "sth_sopr",                   None),
        "LTH_SOPR":      ("btc/market-indicator/sopr",                       "lth_sopr",                   None),
        "NVT":           ("btc/network-indicator/nvt",                       "nvt",                        None),
        "NVM":           ("btc/network-indicator/nvm",                       "nvm",                        None),
        "S2F_Dev":       ("btc/network-indicator/stock-to-flow",             "stock_to_flow_reversion",    None),
        "Exch_Reserve":  ("btc/exchange-flows/reserve",                      "reserve",                    "binance"),
        "Exch_Netflow":  ("btc/exchange-flows/netflow",                      "netflow_total",              "binance"),
        "Whale_Ratio":   ("btc/flow-indicator/exchange-whale-ratio",         "exchange_whale_ratio",       "binance"),
        "MPI":           ("btc/flow-indicator/mpi",                          "mpi",                        None),
        "Puell":         ("btc/network-indicator/puell-multiple",            "puell_multiple",             None),
        "SOPR_Ratio":    ("btc/market-indicator/sopr-ratio",                 "sopr_ratio",                 None),
        "Dormancy":      ("btc/network-indicator/dormancy",                  "average_dormancy",           None),
        "Lev_Ratio":     ("btc/market-indicator/estimated-leverage-ratio",   "estimated_leverage_ratio",   "binance"),
        "SSR":           ("btc/market-indicator/stablecoin-supply-ratio",    "stablecoin_supply_ratio",    None),
        "Open_Interest": ("btc/market-data/open-interest",                   "open_interest",              "binance"),
        "Coinbase_Prem": ("btc/market-data/coinbase-premium-index",          "coinbase_premium_index",     None),
        "NRPL":          ("btc/network-indicator/nrpl",                      "nrpl",                       None),
    }

    out = {}
    for name, (ep, fld, exch) in FETCHES.items():
        cache_key = f"cq_{name}_{start}"
        cached = _load_cache(cache_key)
        if cached is not None:
            out[name] = cached
            print(f"  CQ {name}: cached ({len(cached)} pts)")
            continue
        print(f"  Fetching CQ {name}...", end=" ", flush=True)
        s = _fetch_cquant(ep, token, fld, start=start, exchange=exch)
        if s is not None:
            out[name] = s
            _save_cache(cache_key, s)
            print(f"OK ({len(s)} pts)")
        else:
            print("FAILED")
    return out


# ============================================================
# 3. PROXY SIGNALS
# ============================================================

def compute_proxy_signals(close: pd.Series,
                          sp500: pd.Series,
                          vix:   pd.Series,
                          dxy:   pd.Series,
                          gold:  pd.Series,
                          hy:    pd.Series = None) -> dict:
    out = {}
    idx = close.index

    log_ret = np.log(close / close.shift(1))

    ma200 = close.rolling(200, min_periods=100).mean()
    out["MVRV_Proxy"] = (close / ma200.replace(0, np.nan)).rename("MVRV_Proxy")

    ret14  = close.pct_change(14)
    ret365 = close.pct_change(365).replace(0, np.nan)
    out["Puell_Proxy"] = (ret14 / ret365).clip(-5, 5).rename("Puell_Proxy")

    out["RealVol_30"] = (log_ret.rolling(30, min_periods=10).std() * np.sqrt(365)).rename("RealVol_30")
    out["RealVol_90"] = (log_ret.rolling(90, min_periods=30).std() * np.sqrt(365)).rename("RealVol_90")
    out["LR_1Y"] = np.log(close / close.shift(365)).rename("LR_1Y")

    lr = np.log(close)
    lr_mean = lr.rolling(730, min_periods=180).mean()
    lr_std  = lr.rolling(730, min_periods=180).std().replace(0, np.nan)
    out["LR_2Y_Z"] = ((lr - lr_mean) / lr_std).rename("LR_2Y_Z")

    if vix is not None and len(vix) > 30:
        out["VIX"] = vix.reindex(idx, method="ffill").rename("VIX")

    if dxy is not None and len(dxy) > 30:
        out["DXY"] = dxy.reindex(idx, method="ffill").rename("DXY")

    if sp500 is not None and len(sp500) > 200:
        sp = sp500.reindex(idx, method="ffill")
        sp_ma200 = sp.rolling(200, min_periods=100).mean()
        out["SP500_Trend"] = ((sp - sp_ma200) / sp_ma200.replace(0, np.nan)).rename("SP500_Trend")

    if gold is not None and len(gold) > 90:
        g = gold.reindex(idx, method="ffill")
        out["Gold_90d"] = g.pct_change(90).rename("Gold_90d")

    if hy is not None and len(hy) > 30:
        out["HY_Spread"] = hy.reindex(idx, method="ffill").rename("HY_Spread")

    return out


# ============================================================
# 4. SIGNAL DIRECTION REGISTRY
# ============================================================

SIGNAL_DIRECTION = {
    "MVRV":          "normal",
    "SOPR":          "normal",
    "SOPR_Adj":      "normal",
    "STH_SOPR":      "normal",
    "LTH_SOPR":      "normal",
    "NVT":           "normal",
    "NVM":           "normal",
    "S2F_Dev":       "normal",
    "Exch_Reserve":  "normal",
    "Exch_Netflow":  "normal",
    "Whale_Ratio":   "normal",
    "MPI":           "normal",
    "Puell":         "normal",
    "Supply_Profit": "normal",
    "SOPR_Ratio":    "normal",
    "Dormancy":      "normal",
    "Lev_Ratio":     "normal",
    "SSR":           "normal",
    "Stable_Inflow": "inverse",
    "Funding":       "normal",
    "Open_Interest": "normal",
    "Coinbase_Prem": "inverse",
    "GBTC_Prem":     "inverse",
    "NRPL":          "normal",
    "MVRV_Proxy":    "normal",
    "Puell_Proxy":   "normal",
    "RealVol_30":    "normal",
    "RealVol_90":    "normal",
    "LR_1Y":         "normal",
    "LR_2Y_Z":       "normal",
    "VIX":           "inverse",
    "DXY":           "normal",
    "SP500_Trend":   "inverse",
    "Gold_90d":      "normal",
    "HY_Spread":     "normal",
}


# ============================================================
# 5. TERNARY SCORING
# ============================================================

def compute_ternary_matrix(raw_df: pd.DataFrame) -> pd.DataFrame:
    result = pd.DataFrame(index=raw_df.index)
    min_p  = max(30, S1_PERCENTILE_WINDOW // 4)

    for col in raw_df.columns:
        s         = raw_df[col].copy()
        _base     = col.rsplit("_d", 1)[0] if (col not in SIGNAL_DIRECTION
                    and "_d" in col and col.split("_d")[-1].isdigit()) else col
        direction = SIGNAL_DIRECTION.get(col, SIGNAL_DIRECTION.get(_base, "normal"))

        p_hi = s.rolling(S1_PERCENTILE_WINDOW, min_periods=min_p).quantile(
            S1_PERCENTILE_HI / 100.0)
        p_lo = s.rolling(S1_PERCENTILE_WINDOW, min_periods=min_p).quantile(
            S1_PERCENTILE_LO / 100.0)

        ternary = pd.Series(0.0, index=s.index)
        valid   = s.notna() & p_hi.notna() & p_lo.notna()
        ternary[valid & (s > p_hi)] = +1.0
        ternary[valid & (s < p_lo)] = -1.0

        if direction == "inverse":
            ternary = -ternary

        result[col] = ternary

    return result


# ============================================================
# 5b. DELTA SIGNALS
# ============================================================

def compute_delta_signals(raw_df: pd.DataFrame,
                          lookbacks: list = None) -> pd.DataFrame:
    if lookbacks is None:
        lookbacks = DELTA_LOOKBACKS
    out = {}
    for col in raw_df.columns:
        s = raw_df[col].dropna()
        for N in lookbacks:
            out[f"{col}_d{N}"] = s.diff(N)
    return pd.DataFrame(out, index=raw_df.index)


# ============================================================
# 6. S1 WALK-FORWARD ENGINE
# ============================================================

def run_s1_walkforward(raw_df: pd.DataFrame,
                       ternary_df: pd.DataFrame,
                       close: pd.Series):
    target = np.log(close / close.shift(S1_HIST_RETURN_DAYS))

    first_rd = (pd.Timestamp(TRAIN_START)
                + pd.Timedelta(days=S1_SELECTION_WINDOW + S1_PERCENTILE_WINDOW))
    first_rd = max(first_rd, pd.Timestamp(EVAL_START))

    rebalance_dates = pd.date_range(start=first_rd, end=close.index[-1], freq="MS")

    composite        = pd.Series(np.nan, index=close.index, name="S1_Composite")
    selection_history = {}

    print(f"\nS1 walk-forward: {len(rebalance_dates)} monthly rebalances")

    last_top_signals = list(ternary_df.columns[:S1_N_SIGNALS])

    for i, rd in enumerate(rebalance_dates):
        train_start = rd - pd.Timedelta(days=S1_SELECTION_WINDOW)
        next_rd     = (rebalance_dates[i + 1]
                       if i + 1 < len(rebalance_dates)
                       else close.index[-1] + pd.Timedelta(days=1))

        in_window   = (ternary_df.index >= train_start) & (ternary_df.index <= rd)
        t_ternary   = ternary_df.loc[in_window]
        t_target    = target.loc[in_window]
        n_window    = int(in_window.sum())

        if n_window < 60:
            continue

        ranked = []
        for col in ternary_df.columns:
            raw_col    = raw_df[col] if col in raw_df.columns else t_ternary[col]
            valid_frac = raw_col.loc[in_window].notna().sum() / n_window
            if valid_frac < S1_MIN_VALID_FRAC:
                continue

            sig_vals = t_ternary[col].dropna()
            tgt_vals = t_target.reindex(sig_vals.index).dropna()
            common   = sig_vals.index.intersection(tgt_vals.index)

            if len(common) < MIN_EVENTS:
                continue

            try:
                corr, _ = spearmanr(sig_vals.loc[common], tgt_vals.loc[common])
                if not np.isnan(corr):
                    ranked.append((col, abs(corr)))
            except Exception:
                continue

        if not ranked:
            top_signals = last_top_signals
        else:
            ranked.sort(key=lambda x: -x[1])
            top_signals      = [c for c, _ in ranked[:S1_N_SIGNALS]]
            last_top_signals = top_signals

        selection_history[rd.date()] = top_signals

        oos_dates = close.index[(close.index >= rd) & (close.index < next_rd)]
        for t in oos_dates:
            if t not in ternary_df.index:
                continue
            vals = ternary_df[top_signals].loc[t].dropna()
            if len(vals) > 0:
                composite.loc[t] = float(vals.mean())

    composite = composite.ffill().fillna(0.0)
    return composite, selection_history


# ============================================================
# 7. S1 COMPOSITE → BTC EXPOSURE
# ============================================================

def s1_composite_to_exposure(composite: pd.Series,
                              cash_min: float = S1_CASH_MIN,
                              cash_max: float = S1_CASH_MAX,
                              k: float        = S1_SIGMOID_K) -> pd.Series:
    def _sigmoid(x):
        return 1.0 / (1.0 + np.exp(-float(x)))

    cash = composite.apply(
        lambda c: cash_min + (cash_max - cash_min)
                  * (_sigmoid(k * c) if not np.isnan(c) else _sigmoid(0))
    )
    return (1.0 - cash).rename("S1_Exposure")


# ============================================================
# 8. BASE SIGNAL CLASS
# ============================================================

class BaseSignal(ABC):
    def __init__(self, name: str):
        self.name = name

    @abstractmethod
    def compute(self, close: pd.Series, extra: dict = None) -> pd.Series:
        pass


# ============================================================
# 9. TECHNICAL SIGNAL CLASSES
# ============================================================

class MABreakSignal(BaseSignal):
    def __init__(self, ma_type="SMA", freq="daily", windows=None):
        self.ma_type = ma_type
        self.freq    = freq
        self.windows = windows or [7, 30, 50, 200]
        super().__init__(f"MABreak_{ma_type}_{freq}_{'_'.join(map(str, self.windows))}")
        self.min_hist      = 400
        self.search_window = 60
        self.decay_hl      = 15

    def _compute_mas(self, close):
        price = close.resample("W-FRI").last().dropna() if self.freq == "weekly" else close.copy()
        mas = {}
        for w in self.windows:
            mas[w] = (price.rolling(w, min_periods=w).mean() if self.ma_type == "SMA"
                      else price.ewm(span=w, adjust=False).mean())
        if self.freq == "weekly":
            mas = {w: s.reindex(close.index, method="ffill") for w, s in mas.items()}
        return mas

    def _state_vector(self, close, mas):
        ws   = sorted(mas.keys())
        bits = {f"P>{w}": (close > mas[w]).astype(int) for w in ws}
        for i, sw in enumerate(ws):
            for lw in ws[i + 1:]:
                bits[f"{sw}>{lw}"] = (mas[sw] > mas[lw]).astype(int)
        return pd.DataFrame(bits, index=close.index)

    def _get_priority(self, cols):
        def sk(c):
            p = c.replace("P>", "0>").split(">")
            return -(int(p[1]) * 1000 + (1000 - int(p[0])))
        return sorted(cols, key=sk)

    def _detect_breaks(self, sdf):
        recs, diff = [], sdf - sdf.shift(1)
        for col in sdf.columns:
            f = diff[col]
            for d in f[f == 1].index:
                recs.append({"date": d, "bit": col, "direction": 1,
                             "holding": sdf.loc[d].to_dict()})
            for d in f[f == -1].index:
                recs.append({"date": d, "bit": col, "direction": -1,
                             "holding": sdf.loc[d].to_dict()})
        return (pd.DataFrame(recs).sort_values("date").reset_index(drop=True)
                if recs else pd.DataFrame())

    def _related_keys(self, bit, all_keys):
        nums = set()
        for p in bit.replace("P>", "0>").split(">"):
            try:
                nums.add(int(p))
            except Exception:
                pass
        rel = []
        for k in all_keys:
            if k == bit:
                continue
            for p in k.replace("P>", "0>").split(">"):
                try:
                    if int(p) in nums:
                        rel.append(k)
                        break
                except Exception:
                    pass
        return rel[:3]

    def _find_events(self, brk_df, close, bit, dirn, holding, before, horizons):
        m     = ((brk_df["bit"] == bit) & (brk_df["direction"] == dirn)
                 & (brk_df["date"] < before))
        cands = brk_df[m].copy()
        if cands.empty:
            return pd.DataFrame()
        for k in self._related_keys(bit, list(holding.keys())):
            if cands.empty:
                break
            if k in holding and k != bit:
                try:
                    cands = cands[cands["holding"].apply(
                        lambda h: isinstance(h, dict) and h.get(k) == holding[k])]
                except Exception:
                    break
        if cands.empty:
            return pd.DataFrame()
        clustered, ld = [], None
        for _, r in cands.iterrows():
            if ld is None or (r["date"] - ld).days >= CLUSTER_GAP:
                clustered.append(r)
                ld = r["date"]
        cands = pd.DataFrame(clustered)
        if cands.empty:
            return pd.DataFrame()
        evts = []
        for _, r in cands.iterrows():
            d = r["date"]
            if d not in close.index:
                continue
            p0  = close.loc[d]
            rec = {"date": d, "bit": bit, "direction": dirn, "price": p0}
            for h in horizons:
                fi = close.index.searchsorted(d) + h
                if fi < len(close):
                    rec[f"fwd_{h}d"] = close.iloc[fi] / p0 - 1
                else:
                    rec[f"fwd_{h}d"] = np.nan
            evts.append(rec)
        return pd.DataFrame(evts)

    def _eval_events(self, evts):
        scores = []
        for h in FWD_HORIZONS:
            rc = f"fwd_{h}d"
            if rc not in evts.columns:
                continue
            v = evts[rc].dropna()
            if len(v) < MIN_EVENTS:
                continue
            hr, med = (v > 0).mean(), v.median()
            if   hr >= 0.75 and med >  0.02: s = -1.0
            elif hr >= 0.60 and med >  0:    s = -0.5
            elif hr <= 0.25 and med < -0.02: s =  1.0
            elif hr <= 0.40 and med <  0:    s =  0.5
            else:                             s =  0.0
            scores.append((h, s))
        if not scores:
            return 0.0
        tw = sum(HORIZON_WEIGHTS.get(h, 0.1) for h, _ in scores)
        return sum(HORIZON_WEIGHTS.get(h, 0.1) * s for h, s in scores) / tw if tw > 0 else 0.0

    def compute(self, close, extra=None):
        mas    = self._compute_mas(close)
        sdf    = self._state_vector(close, mas)
        pri    = self._get_priority(list(sdf.columns))
        bdf    = self._detect_breaks(sdf)
        scores = pd.Series(0.0, index=close.index, name=self.name)
        start  = close.index[0] + pd.Timedelta(days=self.min_hist)
        for t in close.index[close.index >= start]:
            cutoff = t - pd.Timedelta(days=self.search_window)
            if bdf.empty:
                continue
            rec = bdf[(bdf["date"] > cutoff) & (bdf["date"] <= t)]
            if rec.empty:
                continue
            brk = None
            for b in pri:
                mm = rec[rec["bit"] == b]
                if not mm.empty:
                    r   = mm.iloc[-1]
                    brk = {"date": r["date"], "bit": r["bit"],
                           "direction": r["direction"], "holding": r["holding"],
                           "days_since": (t - r["date"]).days}
                    break
            if brk is None:
                continue
            evts = self._find_events(bdf, close, brk["bit"], brk["direction"],
                                     brk["holding"], t, FWD_HORIZONS)
            if evts.empty:
                continue
            raw = self._eval_events(evts)
            pi  = close.index.searchsorted(t)
            if pi >= 30:
                p30 = close.iloc[pi] / close.iloc[pi - 30] - 1
                if brk["direction"] == -1 and p30 >  0.10:
                    raw *= 0.5
                elif brk["direction"] ==  1 and p30 < -0.10:
                    raw *= 0.5
            scores.loc[t] = np.clip(raw * 0.5 ** (brk["days_since"] / self.decay_hl), -1, 1)
        return scores


class RSISignal(BaseSignal):
    def __init__(self, period=14, ob=70, os_=30, freq="daily"):
        self.period, self.ob, self.os, self.freq = period, ob, os_, freq
        super().__init__(f"RSI_{period}_{freq}")

    def _rsi(self, price):
        d  = price.diff()
        ag = d.clip(lower=0).ewm(span=self.period, adjust=False).mean()
        al = (-d.clip(upper=0)).ewm(span=self.period, adjust=False).mean()
        return 100 - 100 / (1 + ag / al.replace(0, np.nan))

    def compute(self, close, extra=None):
        price = close.resample("W-FRI").last().dropna() if self.freq == "weekly" else close
        rsi   = self._rsi(price)
        if self.freq == "weekly":
            rsi = rsi.reindex(close.index, method="ffill")
        mid, hr = (self.ob + self.os) / 2, (self.ob - self.os) / 2
        score   = ((rsi - mid) / hr).clip(-1, 1).fillna(0)
        score.name = self.name
        return score


class MACDSignal(BaseSignal):
    def __init__(self, fast=12, slow=26, signal_p=9, freq="daily"):
        self.fast, self.slow, self.signal_p, self.freq = fast, slow, signal_p, freq
        super().__init__(f"MACD_{fast}_{slow}_{signal_p}_{freq}")

    def compute(self, close, extra=None):
        price = close.resample("W-FRI").last().dropna() if self.freq == "weekly" else close
        hist  = (price.ewm(span=self.fast, adjust=False).mean()
                 - price.ewm(span=self.slow, adjust=False).mean())
        hist  = hist - hist.ewm(span=self.signal_p, adjust=False).mean()
        if self.freq == "weekly":
            hist = hist.reindex(close.index, method="ffill")
        rm    = hist.rolling(252, min_periods=60).mean()
        rs    = hist.rolling(252, min_periods=60).std()
        z     = ((hist - rm) / rs.replace(0, np.nan)).fillna(0)
        score = (-z / 3).clip(-1, 1)
        score.name = self.name
        return score


class BollingerSignal(BaseSignal):
    def __init__(self, period=20, num_std=2.0, freq="daily"):
        self.period, self.num_std, self.freq = period, num_std, freq
        super().__init__(f"Boll_{period}_{num_std}_{freq}")

    def compute(self, close, extra=None):
        price = close.resample("W-FRI").last().dropna() if self.freq == "weekly" else close
        sma   = price.rolling(self.period, min_periods=self.period).mean()
        std   = price.rolling(self.period, min_periods=self.period).std()
        pct_b = (price - (sma - self.num_std * std)) / (2 * self.num_std * std).replace(0, np.nan)
        if self.freq == "weekly":
            pct_b = pct_b.reindex(close.index, method="ffill")
        score = ((pct_b - 0.5) * 2).clip(-1, 1).fillna(0)
        score.name = self.name
        return score


class ZScoreMASignal(BaseSignal):
    def __init__(self, ma_period=50, z_window=252, ma_type="SMA", freq="daily"):
        self.ma_period, self.z_window, self.ma_type, self.freq = ma_period, z_window, ma_type, freq
        super().__init__(f"Zscore_{ma_type}{ma_period}_{freq}")

    def compute(self, close, extra=None):
        price = close.resample("W-FRI").last().dropna() if self.freq == "weekly" else close
        ma    = (price.rolling(self.ma_period, min_periods=self.ma_period).mean()
                 if self.ma_type == "SMA"
                 else price.ewm(span=self.ma_period, adjust=False).mean())
        dev   = (price - ma) / ma
        rm    = dev.rolling(self.z_window, min_periods=60).mean()
        rs    = dev.rolling(self.z_window, min_periods=60).std()
        z     = ((dev - rm) / rs.replace(0, np.nan)).fillna(0)
        if self.freq == "weekly":
            z = z.reindex(close.index, method="ffill")
        score = (z / 3).clip(-1, 1)
        score.name = self.name
        return score


class PercentileGapSignal(BaseSignal):
    def __init__(self, ma_period: int, window: int = 252, ma_type: str = "SMA"):
        super().__init__(f"GapPct_{ma_type}{ma_period}_{window}d")
        self.ma_period = ma_period
        self.window    = window
        self.ma_type   = ma_type

    def compute(self, close: pd.Series, extra: dict = None) -> pd.Series:
        if self.ma_type == "SMA":
            ma = close.rolling(self.ma_period).mean()
        else:
            ma = close.ewm(span=self.ma_period, adjust=False).mean()
        gap  = (close / ma - 1).fillna(0)
        rank  = gap.rolling(self.window, min_periods=self.window // 4).rank(pct=True)
        score = (rank * 2 - 1).clip(-1, 1)
        score.name = self.name
        return score


class SP500OverlaySignal(BaseSignal):
    def __init__(self, ma_type="SMA", windows=None):
        self.ma_type = ma_type
        self.windows = windows or [50, 200]
        super().__init__(f"SP500_{ma_type}_{'_'.join(map(str, self.windows))}")

    def compute(self, close, extra=None):
        sp = extra.get("sp500") if extra else None
        if sp is None:
            return pd.Series(0.0, index=close.index, name=self.name)
        sp  = sp.reindex(close.index, method="ffill").ffill()
        mas = {w: (sp.rolling(w, min_periods=w).mean() if self.ma_type == "SMA"
                   else sp.ewm(span=w, adjust=False).mean()) for w in self.windows}
        bits = {f"SP>MA{w}": (sp > mas[w]).astype(float) for w in sorted(self.windows)}
        ws   = sorted(self.windows)
        for i, sw in enumerate(ws):
            for lw in ws[i + 1:]:
                bits[f"SP_MA{sw}>MA{lw}"] = (mas[sw] > mas[lw]).astype(float)
        avg   = pd.DataFrame(bits).mean(axis=1)
        score = (-(avg - 0.5) * 2).clip(-1, 1).fillna(0)
        score.name = self.name
        return score


class SP500RSISignal(BaseSignal):
    def __init__(self, period=14):
        self.period = period
        super().__init__(f"SP500_RSI_{period}")

    def compute(self, close, extra=None):
        sp = extra.get("sp500") if extra else None
        if sp is None:
            return pd.Series(0.0, index=close.index, name=self.name)
        sp  = sp.reindex(close.index, method="ffill").ffill()
        d   = sp.diff()
        ag  = d.clip(lower=0).ewm(span=self.period, adjust=False).mean()
        al  = (-d.clip(upper=0)).ewm(span=self.period, adjust=False).mean()
        rsi = 100 - 100 / (1 + ag / al.replace(0, np.nan))
        score = -((rsi - 50) / 20).clip(-1, 1).fillna(0)
        score.name = self.name
        return score


# ============================================================
# 10. TECHNICAL SIGNAL REGISTRY
# ============================================================

def build_technical_signal_registry():
    sigs = []
    for mt in ["SMA", "EMA"]:
        sigs.append(MABreakSignal(mt, "daily",  [30, 90, 180, 365]))
        sigs.append(MABreakSignal(mt, "daily",  [50, 100, 200, 365]))
        sigs.append(MABreakSignal(mt, "weekly", [4, 13, 26, 52]))
    for mt in ["SMA", "EMA"]:
        for mp in [50, 90, 200, 365]:
            sigs.append(ZScoreMASignal(mp, 252, mt, "daily"))
        sigs.append(ZScoreMASignal(26, 252, mt, "weekly"))
    sigs.append(SP500OverlaySignal("SMA", [50, 200]))
    sigs.append(SP500OverlaySignal("EMA", [50, 200]))
    for mt in ["SMA", "EMA"]:
        for mp in [90, 200, 365]:
            sigs.append(PercentileGapSignal(mp, window=365, ma_type=mt))
    return sigs


def compute_technical_signals(close: pd.Series,
                               sp500: pd.Series,
                               sigs: list) -> pd.DataFrame:
    extra, results = {"sp500": sp500}, {}
    for sig in sigs:
        print(f"  {sig.name}...", end=" ", flush=True)
        try:
            s   = sig.compute(close, extra)
            act = (s.abs() > 0.01).mean()
            results[sig.name] = s
            print(f"active {act:.1%}")
        except Exception as e:
            print(f"FAILED: {e}")
    return pd.DataFrame(results, index=close.index)


# ============================================================
# 11. COMBINATORICS ENGINE
# ============================================================

def discretize_signals(score_df, thresholds=(-0.3, 0.3)):
    lo, hi = thresholds
    d = pd.DataFrame(0, index=score_df.index, columns=score_df.columns)
    d[score_df <= lo] = -1
    d[score_df >= hi] =  1
    return d


def compute_forward_returns(close, horizons=FWD_HORIZONS):
    return pd.DataFrame({h: close.shift(-h) / close - 1 for h in horizons},
                        index=close.index)


def evaluate_joint_state(disc, fwd, s1, s2, js, before):
    mask  = ((disc[s1] == js[0]) & (disc[s2] == js[1]) & (disc.index < before))
    dates = disc.index[mask]
    if len(dates) < MIN_EVENTS:
        return None
    out = {}
    for h in fwd.columns:
        safe = dates[dates + pd.Timedelta(days=h) < before]
        rets = fwd.loc[safe, h].dropna()
        if len(rets) < MIN_EVENTS:
            continue
        out[h] = {"hit_rate": (rets > 0).mean(), "median": rets.median(), "n": len(rets)}
    return out or None


_REGIME_ORDER = ["COLD", "NEUTRAL", "HOT", "EXTREME"]
_REGIME_WEIGHT = {0: 1.0, 1: 0.5, 2: 0.1}


def _regime_weights(mvrv_tr: pd.Series, current_regime: str) -> pd.Series:
    try:
        cur_idx = _REGIME_ORDER.index(current_regime)
    except ValueError:
        cur_idx = 1

    def _w(v):
        reg = _get_regime(v)
        try:
            dist = abs(_REGIME_ORDER.index(reg) - cur_idx)
        except ValueError:
            dist = 2
        return _REGIME_WEIGHT.get(min(dist, 2), 0.1)

    return mvrv_tr.apply(_w)


def pair_power(disc_window, fwd_window, s1, s2, cutoff, weights=None,
               primary_horizon: int = 30, use_magnitude: bool = False):
    best = 0
    if primary_horizon not in fwd_window.columns:
        return best
    min_ev = MIN_EVENTS * max(1, primary_horizon // 30)
    for js in [(-1, -1), (-1, 1), (1, -1), (1, 1), (-1, 0), (0, -1), (1, 0), (0, 1)]:
        mask = (disc_window[s1] == js[0]) & (disc_window[s2] == js[1])
        hits = disc_window.index[mask]
        if len(hits) < MIN_EVENTS:
            continue
        safe = hits[hits + pd.Timedelta(days=primary_horizon) < cutoff]
        if len(safe) < min_ev:
            continue
        rets = fwd_window.loc[safe, primary_horizon].dropna()
        if len(rets) < min_ev:
            continue
        if weights is not None:
            w = weights.reindex(rets.index).fillna(0.1)
            w_sum = w.sum()
            if w_sum == 0:
                continue
            hit_rate = (w * (rets > 0)).sum() / w_sum
            n_eff    = w_sum ** 2 / (w ** 2).sum()
        else:
            hit_rate = (rets > 0).mean()
            n_eff    = len(rets)
        if primary_horizon > 30:
            n_eff = n_eff / (primary_horizon / 30)
        score = abs(hit_rate - 0.5) * n_eff
        if use_magnitude:
            rv = fwd_window[primary_horizon].std()
            if rv > 0:
                score *= rets.abs().median() / rv
        best = max(best, score)
    return best


def score_at_date(disc, fwd, top_pairs, t, conviction_gamma=None):
    scores = []
    for s1, s2 in top_pairs:
        st1, st2 = disc.loc[t, s1], disc.loc[t, s2]
        res = evaluate_joint_state(disc, fwd, s1, s2, (st1, st2), t)
        if res is None:
            continue
        ws, tw = 0.0, 0.0
        for h, stats in res.items():
            w    = HORIZON_WEIGHTS.get(h, 0.1)
            hr   = stats["hit_rate"]
            med  = stats["median"]
            if conviction_gamma is not None:
                if hr >= 0.60 and med > 0:
                    sv = -(2 * (hr - 0.5)) ** conviction_gamma
                elif hr <= 0.40 and med < 0:
                    sv =  (2 * (0.5 - hr)) ** conviction_gamma
                else:
                    sv = 0.0
            else:
                if   hr >= 0.75 and med >  0.02: sv = -1.0
                elif hr >= 0.60 and med >  0:    sv = -0.5
                elif hr <= 0.25 and med < -0.02: sv =  1.0
                elif hr <= 0.40 and med <  0:    sv =  0.5
                else:                             sv =  0.0
            ws += w * sv
            tw += w
        if tw > 0:
            scores.append(np.clip(ws / tw, -1, 1))
    return float(np.mean(scores)) if scores else 0.0


def _prescreen_signals(disc_tr: pd.DataFrame, fwd_tr: pd.DataFrame,
                       sigs: list, n: int) -> list:
    if 30 not in fwd_tr.columns or n >= len(sigs):
        return sigs
    fwd30 = fwd_tr[30].dropna()
    scores = []
    for s in sigs:
        common = disc_tr[s].dropna().index.intersection(fwd30.index)
        if len(common) < MIN_EVENTS:
            continue
        try:
            corr, _ = spearmanr(disc_tr[s].loc[common], fwd30.loc[common])
            if not np.isnan(corr):
                scores.append((s, abs(corr)))
        except Exception:
            pass
    if not scores:
        return sigs[:n]
    scores.sort(key=lambda x: -x[1])
    return [s for s, _ in scores[:n]]


def build_combo_score_wf(score_df: pd.DataFrame,
                          close: pd.Series,
                          train_years: int = 3,
                          retrain_months: int = 6,
                          top_n: int = 15,
                          label: str = "COMBO_WF",
                          prescreen_n: int = None,
                          primary_horizon: int = 30,
                          use_magnitude: bool = False,
                          conviction_gamma=None):
    disc  = discretize_signals(score_df)
    fwd   = compute_forward_returns(close)
    sigs  = list(score_df.columns)

    eval_start      = pd.Timestamp(EVAL_START)
    rebalance_dates = pd.date_range(eval_start, close.index[-1],
                                    freq=f"{retrain_months}MS")

    print(f"\n  {label}: {len(sigs)} signals, {len(rebalance_dates)} rebalances")

    combo        = pd.Series(0.0, index=close.index, name=label)
    pair_history = {}

    for i, rd in enumerate(rebalance_dates):
        train_start = rd - pd.DateOffset(years=train_years)
        next_rd     = (rebalance_dates[i + 1]
                       if i + 1 < len(rebalance_dates)
                       else close.index[-1] + pd.Timedelta(days=1))

        disc_tr = disc[(disc.index >= train_start) & (disc.index < rd)]
        fwd_tr  = fwd[(fwd.index  >= train_start) & (fwd.index  < rd)]

        act_tr   = {s: (disc_tr[s] != 0).mean() for s in sigs}
        asigs_tr = [s for s, a in act_tr.items() if a > 0.05]

        if prescreen_n and prescreen_n < len(asigs_tr):
            loop_sigs  = _prescreen_signals(disc_tr, fwd_tr, asigs_tr, prescreen_n)
            loop_pairs = list(combinations(loop_sigs, 2))
        else:
            loop_pairs = list(combinations(asigs_tr, 2))

        meta      = {(s1, s2): pair_power(disc_tr, fwd_tr, s1, s2, rd,
                                           primary_horizon=primary_horizon,
                                           use_magnitude=use_magnitude)
                     for s1, s2 in loop_pairs}
        ranked    = sorted(meta.items(), key=lambda x: -x[1])
        top_pairs = [p for p, _ in ranked[:top_n]]

        pair_history[rd.date()] = top_pairs

        oos_dates = close.index[(close.index >= rd) & (close.index < next_rd)]
        for t in oos_dates:
            combo.loc[t] = score_at_date(disc, fwd, top_pairs, t,
                                          conviction_gamma=conviction_gamma)

    return combo, pair_history


# ============================================================
# 12. MVRV REGIME WALK-FORWARD
# ============================================================

def _get_regime(mvrv_value: float) -> str:
    if np.isnan(mvrv_value):
        return "NEUTRAL"
    for label, lo, hi in MVRV_REGIME_BOUNDS:
        if lo <= mvrv_value < hi:
            return label
    return "EXTREME"


def build_combo_score_wf_mvrv(score_df: pd.DataFrame,
                               close: pd.Series,
                               mvrv_series: pd.Series,
                               train_years: int = 3,
                               retrain_months: int = 6,
                               top_n: int = 15,
                               label: str = "S4_COMBO",
                               prescreen_n: int = None,
                               primary_horizon: int = 30):
    disc  = discretize_signals(score_df)
    fwd   = compute_forward_returns(close)
    sigs  = list(score_df.columns)

    mvrv_aligned = (mvrv_series.reindex(close.index, method="ffill")
                    if mvrv_series is not None
                    else pd.Series(1.0, index=close.index))

    eval_start      = pd.Timestamp(EVAL_START)
    rebalance_dates = pd.date_range(eval_start, close.index[-1],
                                    freq=f"{retrain_months}MS")

    print(f"\n  MVRV-regime combo [{label}]: {len(sigs)} signals, {len(rebalance_dates)} rebalances")

    combo        = pd.Series(0.0, index=close.index, name=label)
    pair_history = {}

    for i, rd in enumerate(rebalance_dates):
        train_start  = rd - pd.DateOffset(years=train_years)
        next_rd      = (rebalance_dates[i + 1]
                        if i + 1 < len(rebalance_dates)
                        else close.index[-1] + pd.Timedelta(days=1))

        try:
            mvrv_at_rd = float(mvrv_aligned.asof(rd))
        except Exception:
            mvrv_at_rd = np.nan
        regime = _get_regime(mvrv_at_rd)

        in_train = (disc.index >= train_start) & (disc.index < rd)
        disc_tr  = disc[in_train]
        fwd_tr   = fwd[in_train]
        mvrv_tr  = mvrv_aligned[in_train]

        act_tr   = {s: (disc_tr[s] != 0).mean() for s in sigs}
        asigs_tr = [s for s, a in act_tr.items() if a > 0.05]

        n_same_regime = int((mvrv_tr.apply(lambda v: _get_regime(v) == regime)).sum())

        if n_same_regime >= MIN_REGIME_TRAIN_DAYS:
            weights = _regime_weights(mvrv_tr, regime)
        else:
            weights = None

        if prescreen_n and prescreen_n < len(asigs_tr):
            loop_sigs  = _prescreen_signals(disc_tr, fwd_tr, asigs_tr, prescreen_n)
            loop_pairs = list(combinations(loop_sigs, 2))
        else:
            loop_pairs = list(combinations(asigs_tr, 2))

        meta      = {(s1, s2): pair_power(disc_tr, fwd_tr, s1, s2, rd, weights=weights,
                                           primary_horizon=primary_horizon)
                     for s1, s2 in loop_pairs}
        ranked    = sorted(meta.items(), key=lambda x: -x[1])
        top_pairs = [p for p, _ in ranked[:top_n]]

        pair_history[rd.date()] = top_pairs

        oos_dates = close.index[(close.index >= rd) & (close.index < next_rd)]
        for t in oos_dates:
            combo.loc[t] = score_at_date(disc, fwd, top_pairs, t)

    return combo, pair_history


# ============================================================
# 13. STRATEGY CONFIGS
# ============================================================

@dataclass
class StrategyConfig:
    name:                 str
    min_exposure:         float = 0.50
    mid_exposure:         float = 0.75
    max_exposure:         float = 1.00
    steepness:            float = 3.0
    confidence_threshold: float = 0.20


S3_CFG = StrategyConfig("S3 (All+Combos)", min_exposure=0.50, mid_exposure=0.75, max_exposure=1.00)
S4_CFG = StrategyConfig("S4 (MVRV-Regime)", min_exposure=0.50, mid_exposure=0.75, max_exposure=1.00)


# ============================================================
# 14. EXPOSURE MAPPING
# ============================================================

def signal_to_exposure_scalar(s: float, cfg: StrategyConfig) -> float:
    thr = cfg.confidence_threshold
    k   = cfg.steepness
    tk  = np.tanh(k)
    if np.isnan(s) or abs(s) < thr:
        return cfg.mid_exposure
    s_adj = (abs(s) - thr) / (1.0 - thr)
    if s < 0:
        return cfg.mid_exposure + np.tanh(s_adj * k) / tk * (cfg.max_exposure - cfg.mid_exposure)
    else:
        return cfg.mid_exposure - np.tanh(s_adj * k) / tk * (cfg.mid_exposure - cfg.min_exposure)


def signal_to_exposure(signal: pd.Series, cfg: StrategyConfig) -> pd.Series:
    return signal.apply(lambda s: signal_to_exposure_scalar(s, cfg))


def gated_exposure(combo: pd.Series, cfg: StrategyConfig,
                   min_confidence: float = MIN_CONFIDENCE) -> pd.Series:
    result = []
    prev   = cfg.mid_exposure
    for c in combo:
        if np.isnan(c) or abs(c) < min_confidence:
            result.append(prev)
        else:
            new_exp = signal_to_exposure_scalar(c, cfg)
            prev    = new_exp
            result.append(new_exp)
    return pd.Series(result, index=combo.index)


def tiered_exposure(combo: pd.Series, cfg: StrategyConfig,
                    thresholds: list = None) -> pd.Series:
    if thresholds is None:
        thresholds = TIER_THRESHOLDS

    def _tier(c):
        if np.isnan(c) or abs(c) < thresholds[0]:
            return cfg.mid_exposure
        elif abs(c) < thresholds[1]:
            if c < 0:
                return (cfg.mid_exposure + cfg.max_exposure) / 2
            else:
                return (cfg.min_exposure + cfg.mid_exposure) / 2
        else:
            return cfg.max_exposure if c < 0 else cfg.min_exposure

    return combo.apply(_tier)


def tiered_gated_exposure(combo: pd.Series, cfg: StrategyConfig,
                          min_confidence: float = MIN_CONFIDENCE,
                          thresholds=None) -> pd.Series:
    if thresholds is None:
        thresholds = TIER_THRESHOLDS

    def _tier_scalar(c):
        if abs(c) < thresholds[0]:
            return cfg.mid_exposure
        elif abs(c) < thresholds[1]:
            return (cfg.mid_exposure + cfg.max_exposure) / 2 if c < 0 \
                   else (cfg.min_exposure + cfg.mid_exposure) / 2
        else:
            return cfg.max_exposure if c < 0 else cfg.min_exposure

    result = []
    prev   = cfg.mid_exposure
    for c in combo:
        if np.isnan(c) or abs(c) < min_confidence:
            result.append(prev)
        else:
            new_exp = _tier_scalar(c)
            prev    = new_exp
            result.append(new_exp)
    return pd.Series(result, index=combo.index)


def gate_level_sweep(combo: pd.Series, cfg: StrategyConfig, close: pd.Series,
                     gate_levels: list = None) -> pd.DataFrame:
    if gate_levels is None:
        gate_levels = GATE_SWEEP_LEVELS
    rows = []
    for g in gate_levels:
        exp = gated_exposure(combo, cfg, min_confidence=g)
        bt  = backtest_from_exposure(close, exp, f"Gate_{g:.2f}")
        oos = slice_rebase(bt, EVAL_START)
        cum  = oos["port_cum"]
        ar   = _ann_ret_from_cum(cum)
        vol  = oos["port_ret"].std() * np.sqrt(365)
        sh   = ar / vol if vol > 0 else 0.0
        pk   = cum.cummax()
        md   = ((cum - pk) / pk).min()
        fees = oos["fee_drag"].sum()
        exp_oos   = exp[exp.index >= EVAL_START]
        n_changes = int((exp_oos.diff().abs() > 1e-4).sum())
        rows.append({
            "Gate |combo|":  f"{g:.2f}",
            "Ann.Ret":       f"{ar:.1%}",
            "Sharpe":        f"{sh:.2f}",
            "Max DD":        f"{md:.1%}",
            "Fees(%NAV)":    f"{fees:.2%}",
            "Pos.Changes":   n_changes,
        })
    return pd.DataFrame(rows)


# ============================================================
# 15. BACKTEST ENGINE
# ============================================================

def backtest_from_exposure(close: pd.Series,
                           exposure: pd.Series,
                           name: str = "strategy") -> pd.DataFrame:
    exp      = exposure.reindex(close.index).ffill().fillna(0.65)
    btc_ret  = close.pct_change().fillna(0)
    prev_exp = exp.shift(1).fillna(exp.iloc[0])
    port_ret = prev_exp * btc_ret
    exp_chg  = exp.diff().abs().fillna(0)
    fee_drag = exp_chg * FEE_PER_UNIT
    port_ret = port_ret - fee_drag
    port_cum = (1 + port_ret).cumprod()
    btc_cum  = (1 + btc_ret).cumprod()
    return pd.DataFrame({
        "btc_cum":  btc_cum,
        "port_cum": port_cum,
        "exposure": exp,
        "port_ret": port_ret,
        "btc_ret":  btc_ret,
        "fee_drag": fee_drag,
    }, index=close.index)


# ============================================================
# 16. METRICS HELPERS
# ============================================================

def slice_rebase(df: pd.DataFrame, start: str) -> pd.DataFrame:
    d = df[df.index >= start].copy()
    for c in ["btc_cum", "port_cum"]:
        if c in d.columns:
            d[c] = d[c] / d[c].iloc[0]
    return d


def _ann_ret_from_cum(cum: pd.Series) -> float:
    ny = (cum.index[-1] - cum.index[0]).days / 365.25
    return (cum.iloc[-1] / cum.iloc[0]) ** (1 / ny) - 1 if ny > 0 else 0.0


def _sharpe_from_ret(ret: pd.Series) -> float:
    s = ret.std()
    return ret.mean() / s * np.sqrt(365) if s > 0 else 0.0


def full_metrics(cum: pd.Series, daily: pd.Series,
                 label: str, fee_drag: pd.Series = None,
                 naive_ar: float = None, naive_label: str = None) -> dict:
    tr  = cum.iloc[-1] / cum.iloc[0] - 1
    ny  = (cum.index[-1] - cum.index[0]).days / 365.25
    ar  = (1 + tr) ** (1 / ny) - 1 if ny > 0 else 0
    av  = daily.std() * np.sqrt(365)
    sh  = ar / av if av > 0 else 0
    pk  = cum.cummax()
    md  = ((cum - pk) / pk).min()
    ca  = ar / abs(md) if md != 0 else 0
    tf  = fee_drag.sum() if fee_drag is not None else 0
    result = {
        "Strategy":     label,
        "Ann.Ret":      f"{ar:.1%}",
        "Total Ret":    f"{tr:.1%}",
        "Volatility":   f"{av:.1%}",
        "Sharpe":       f"{sh:.2f}",
        "Calmar":       f"{ca:.2f}",
        "Max DD":       f"{md:.1%}",
        "Fees(%NAV)":   f"{tf:.2%}",
        "Final($100k)": f"${100_000 * (1 + tr):,.0f}",
    }
    return result


def yearly_breakdown(backtest_results: dict) -> pd.DataFrame:
    rows = []
    for name, bt in backtest_results.items():
        col = "btc_cum" if name == "BTC Buy & Hold" else "port_cum"
        if col not in bt.columns:
            continue
        for yr, grp in bt.groupby(bt.index.year):
            if grp.empty:
                continue
            rows.append({"Year": yr, "Strategy": name,
                         "Return": grp[col].iloc[-1] / grp[col].iloc[0] - 1})
    df    = pd.DataFrame(rows)
    pivot = df.pivot(index="Year", columns="Strategy", values="Return")
    order = ["BTC Buy & Hold"] + [s for s in pivot.columns if s != "BTC Buy & Hold"]
    return pivot[[c for c in order if c in pivot.columns]]


# ============================================================
# 17. MARKET DATA FETCH
# ============================================================

def fetch_market_data():
    cache_key = f"market_data_{TRAIN_START}"
    cached = _load_cache(cache_key)
    if cached is not None:
        close, sp500, vix, dxy, gold, hy = cached
        print(f"  Market data: loaded from cache "
              f"(BTC {len(close)} days through {close.index[-1].date()})")
        return close, sp500, vix, dxy, gold, hy

    def _dl(ticker, start=TRAIN_START):
        df = yf.download(ticker, start=start, progress=False, auto_adjust=True)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        s = df["Close"].dropna().squeeze()
        s.index = pd.to_datetime(s.index).tz_localize(None)
        return s

    print("Fetching BTC-USD...", end=" "); close = _dl("BTC-USD"); print(f"{len(close)} days")
    print("Fetching SPY...",     end=" "); sp500  = _dl("SPY");     print(f"{len(sp500)} days")
    try:
        vix = _dl("^VIX"); print(f"VIX: {len(vix)} days")
    except Exception:
        vix = None
    try:
        dxy = _dl("DX-Y.NYB"); print(f"DXY: {len(dxy)} days")
    except Exception:
        dxy = None
    try:
        gold = _dl("GC=F"); print(f"Gold: {len(gold)} days")
    except Exception:
        gold = None

    hy = None
    fred_key = os.environ.get("FRED_API_KEY")
    if FRED_AVAILABLE and fred_key:
        try:
            fred = Fred(api_key=fred_key)
            raw_hy = fred.get_series("BAMLH0A0HYM2", observation_start=TRAIN_START)
            raw_hy.index = pd.to_datetime(raw_hy.index).tz_localize(None)
            hy = raw_hy.dropna()
            print(f"HY Spread (FRED): {len(hy)} days")
        except Exception as e:
            print(f"HY Spread FRED failed: {e}")

    _save_cache(cache_key, (close, sp500, vix, dxy, gold, hy))
    return close, sp500, vix, dxy, gold, hy
