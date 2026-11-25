# Talse — Revenue & costs

> Companion to [`SUBMISSION.md`](./SUBMISSION.md). Every figure is shown in **π and USD**.
> The USD column uses the **live market Pi price**, read from public exchanges by
> [`lib/pi-price.ts`](../lib/pi-price.ts) — the console pulls it automatically, so the
> report shows the real price rather than a hardcoded one. π is the stable unit; USD is
> derived and moves with the market.

**Price snapshot for this document:** **≈$0.0548 / π**, median of OKX / Bitget / MEXC /
CoinGecko, taken **2026-11-26**. The π columns are exact; the USD columns are `π × $0.0548`
and will differ from the live console whenever the price moves.

---

## 0. Where the numbers come from

| Layer | Source |
|---|---|
| Actuals (lifetime) | `v_platform_earnings` — [migration 009](../supabase/migrations/009_platform_earnings.sql) |
| Actuals (daily) | `v_platform_earnings_daily` |
| Order-level ledger | `v_platform_accounting` — [migration 013](../supabase/migrations/013_console_view_deps.sql) |
| **Live Pi price** | `/api/admin/pi-price` → [`lib/pi-price.ts`](../lib/pi-price.ts) (median of 4 markets, 60s cache) |
| Projections | [`lib/revenue-model.ts`](../lib/revenue-model.ts) (pure functions) |
| Live planner | Admin → **Revenue & P&L → Scenario planner** (live price by default, every input editable, CSV export) |
| Applied revenue | `transaction_fees` (job fees) + `boost_purchases.amount` (boosts) |

**How the price is chosen:** the planner defaults to the live market median (labelled
*"Live market"* in the console). It can be overridden per-scenario, and the stored
`pi_usd_rate` setting is used only if every market is unreachable — it is a fallback, not
the source of truth. If no market can be reached the console says so explicitly rather than
presenting a stale number as live.

---

## 1. Assumptions (base case)

| # | Assumption | Base value | Editable in |
|---|---|---|---|
| 1 | Pi price | **live market ≈$0.0548 / π** | automatic; planner override |
| 2 | Job completion fee | **10%** (5% variant modelled) | Configuration, planner toggle |
| 3 | Average job value | **20 π** | Planner |
| 4 | Released jobs / month (month 1) | **50** | Planner |
| 5 | Refund rate | **3%** of jobs | Planner |
| 6 | Boost price | **5 π** per boost | Configuration, planner |
| 7 | Boosts sold / month (month 1) | **8** | Planner |
| 8 | Network fee absorbed | **0.01 π** per released payout | Configuration, planner |
| 9 | Monthly volume growth | **10%** | Planner |
| 10 | Infrastructure | **$50 / month** | Planner |
| 11 | Horizon | **12 months** | Planner |

---

## 2. What is real today (from the ledger)

These come from the live views, not the model:

| Metric | π | USD @ ≈$0.0548 |
|---|---:|---:|
| Released jobs | 1 | — |
| Gross volume (GMV) | 15.00 | $0.82 |
| Provider payouts | 13.50 | $0.74 |
| **Job completion fees** | **1.50** | **$0.08** |
| **Boost revenue** | **5.00** | **$0.27** |
| Network costs recorded | 0.00 | $0.00 |
| **Net earnings** | **6.50** | **$0.36** |
| Effective take rate (fees / GMV) | 10% | — |

This proves the accounting closes (fees + boosts − network = net). It is **one settled
job and one boost** — evidence the mechanics work, not evidence of traction.

---

## 3. Revenue model

Two sources, always reported separately:

```
Job completion fees  = released jobs × average job value × fee %
Boost revenue        = boosts sold × boost price
Gross revenue        = job fees + boosts
Network cost         = released jobs × network fee      (Pi the platform absorbs)
Net (π)              = gross revenue − network cost
Net (USD)            = net (π) × live Pi price − infrastructure
```

**Per-unit economics** (at ≈$0.0548 / π)

| Unit | @ 10% fee | @ 5% fee |
|---|---:|---:|
| Fee on a 20 π job | 2.00 π · ≈$0.11 | 1.00 π · ≈$0.05 |
| minus network fee | 0.01 π · ≈$0.001 | 0.01 π · ≈$0.001 |
| **Net per released job** | **1.99 π · ≈$0.11** | **0.99 π · ≈$0.05** |
| Fee on a boost (5 π) | — | — |
| **Net per boost** | **5.00 π · ≈$0.27** | **5.00 π · ≈$0.27** |

Boosts carry no payout cost, which is why they contribute ~29% of revenue from ~4% of
the gross value flowing through the platform. Every π of revenue is **margin-positive**;
the question is volume, not unit economics.

---

## 4. Base-case 12-month projection

Assumptions above, 10% fee, live ≈$0.0548/π, 10% monthly volume growth, $50/mo infrastructure.

| Month | Released jobs | Job fees (π) | Boosts (π) | Revenue (π) | Revenue (USD) | Net (USD) | Cumulative (USD) |
|---:|---:|---:|---:|---:|---:|---:|---:|
| M1 | 48.5 | 97.00 | 40.00 | 137.00 | $7.51 | −$42.52 | −$42.52 |
| M2 | 53.4 | 106.70 | 44.00 | 150.70 | $8.26 | −$41.77 | −$84.29 |
| M3 | 58.7 | 117.37 | 48.40 | 165.77 | $9.08 | −$40.95 | −$125.24 |
| M4 | 64.6 | 129.11 | 53.24 | 182.35 | $9.99 | −$40.04 | −$165.28 |
| M5 | 71.0 | 142.02 | 58.56 | 200.58 | $10.99 | −$39.05 | −$204.33 |
| M6 | 78.1 | 156.22 | 64.42 | 220.64 | $12.09 | −$37.95 | −$242.28 |
| M7 | 85.9 | 171.84 | 70.86 | 242.70 | $13.30 | −$36.75 | −$279.03 |
| M8 | 94.5 | 189.03 | 77.95 | 266.97 | $14.63 | −$35.42 | −$314.45 |
| M9 | 104.0 | 207.93 | 85.74 | 293.67 | $16.09 | −$33.96 | −$348.41 |
| M10 | 114.4 | 228.72 | 94.32 | 323.04 | $17.70 | −$32.36 | −$380.77 |
| M11 | 125.8 | 251.59 | 103.75 | 355.34 | $19.47 | −$30.60 | −$411.37 |
| M12 | 138.4 | 276.75 | 114.12 | 390.88 | $21.42 | −$28.66 | −$440.03 |
| **Total** | **1,037.1** | **2,074.28** | **855.37** | **2,929.65** | **$160.54** | **−$440.03** | |

**Reading it honestly:** at the **current market price** the year closes **−$440** on
**$160.54** of revenue, because $600 of infrastructure cannot be covered by ~$160 of fees.
The π story is healthy and growing; the USD story depends on price and volume. This is
exactly why the USD column is derived from a live feed and labelled as such, and why π is
the unit the platform actually books.

---

## 5. Revenue by source (12 months)

| Source | π | USD @ ≈$0.0548 | Share |
|---|---:|---:|---:|
| Job completion fees (10%) | 2,074.28 | $113.67 | **70.8%** |
| Listing boosts | 855.37 | $46.87 | **29.2%** |
| **Combined** | **2,929.65** | **$160.54** | **100%** |

At a 5% job fee the split flips toward boosts:

| Source | π | USD @ ≈$0.0548 | Share |
|---|---:|---:|---:|
| Job completion fees (5%) | 1,037.14 | $56.84 | 54.8% |
| Listing boosts | 855.37 | $46.87 | 45.2% |
| **Combined** | **1,892.51** | **$103.71** | **100%** |

---

## 6. Costs

| Cost | 12-month value | Notes |
|---|---:|---|
| Network fees absorbed | 10.37 π · ≈$0.57 | Recorded on-chain fee per released payout; currently 0.01 π |
| Infrastructure | $600.00 | Hosting + database + domain at $50/mo (Vercel + Supabase free tiers can bring this to ~$0) |
| **Total modelled costs** | **≈$600.57** | |
| Refund handling | fee forgone only | Escrow returns the buyer's principal; the platform loses the fee, not the capital |
| **Not modelled** | — | Mainnet payout fees, dispute losses, marketing, builder time |

`net (π)` in the ledger subtracts network cost only; infrastructure sits outside the
database, which is why the report states it explicitly rather than folding it into the
view. Infrastructure is the single largest USD cost and is largely a fixed, discretionary
line — the model is **π-positive at every point** and only USD-negative because of it.

---

## 7. Break-even

At month-one volume, with 8 boosts/month:

```
Break-even released jobs/month =
  (infra USD ÷ Pi price − boost revenue) ÷ ((1 − refund rate) × (avg value × fee% − network fee))
```

- **Base case: ≈452 released jobs/month** (vs 50 in month 1) → **not reached within 12 months** at the live price.
- At **$0.30/π** the same model breaks even at ≈66 jobs/mo — the price does the heavy lifting.
- If boosts alone cover infrastructure, break-even jobs = 0.

---

## 8. Sensitivity — what actually moves the result

All rows use the same 12-month horizon, 10% growth and $50/mo infra unless stated.

| Scenario | 12-mo revenue (USD) | 12-mo net (USD) | Break-even jobs/mo | Cumulative payback |
|---|---:|---:|---:|---|
| **Live ≈$0.0548/π, 10% fee** | **$160.54** | **−$440.03** | 452 | not in 12 mo |
| $0.03/π | $87.89 | −$512.42 | 843 | not in 12 mo |
| $0.10/π | $292.97 | −$308.07 | 238 | not in 12 mo |
| $0.20/π | $585.93 | −$16.14 | 109 | not in 12 mo |
| $0.30/π | $878.89 | +$275.78 | 66 | M5 |
| $0.50/π | $1,464.82 | +$859.64 | 31 | M1 |
| Live price, 5% fee | $103.71 | −$496.86 | 909 | not in 12 mo |
| Live price, 0% growth | $90.09 | −$510.23 | 452 | not in 12 mo |

**Takeaways**

1. **Pi's USD price is the dominant variable.** At ≈$0.055 the year is −$440; at $0.30 it is
   +$276; at $0.50 it is +$860 — from identical π behaviour. Quote π as the stable unit and
   USD as a sensitivity, never the reverse.
2. **Unit economics are sound; volume is the constraint.** Every released job nets 1.99 π
   and every boost nets 5 π. Break-even is a volume/price threshold, not a margin problem.
3. **Infrastructure is fixed and small in π terms.** At the live price, $50/mo is ≈912 π/mo;
   at $0.30/π it is ≈167 π/mo. Lower infra (free tiers) directly lowers break-even.
4. **The fee toggle matters, but less than price.** 5% vs 10% roughly halves job-fee
   revenue; boosts are the margin ballast either way.

---

## 9. Definitions & disclosures

- **GMV ≠ revenue.** Gross volume is the total value flowing through escrow. The platform
  earns the fee + boosts only.
- **In-flight escrow is a liability, not revenue.** Money held for unfinished jobs is
  reported separately (dashboard `escrow.inFlight`).
- **Sandbox only.** Payments run in the Pi sandbox for this build; mainnet payout access
  is not claimed. No USD figure here represents settled fiat.
- **USD is derived from a live feed, not observed as fiat.** `USD = π × live price`
  (≈$0.0548 on 2026-11-26). The π columns are the stable, booked numbers; every USD figure
  moves with the market.
- **Projections are not forecasts.** They are a transparent model of stated assumptions,
  built so the assumptions can be argued with.
- **Excluded:** builder time, marketing, mainnet payout/withdrawal fees, dispute principal
  losses, and any token-price hedging.

---

## 10. Reproducing these numbers

```sql
-- lifetime actuals
select * from v_platform_earnings;
-- order-level ledger
select * from v_platform_accounting order by created_at desc;
-- daily series (last 30 days)
select * from v_platform_earnings_daily
where day >= current_date - interval '30 days'
order by day;
```

- Admin console: **Revenue & P&L** (actuals + live price + planner + daily CSV).
- Live price: `GET /api/admin/pi-price` → `lib/pi-price.ts` (OKX, Bitget, MEXC, CoinGecko; median; 60s cache).
- Planner: change any assumption, then **Export CSV** for the monthly model.
- Code: `lib/revenue-model.ts` (`computeScenario`, `scenarioCsv`).
- Fallback config: `platform_settings.pi_usd_rate` (migration
  [`016`](../supabase/migrations/016_pi_usd_rate.sql)) — used only when no market answers.
