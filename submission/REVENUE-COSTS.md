# Talse — Revenue & costs

> Companion to [`SUBMISSION.md`](./SUBMISSION.md). Every figure is shown in **π and USD**.
> The USD column uses an **assumed Pi price** (see below) — it is an input, not a quote,
> and every projection recomputes when it changes.

---

## 0. Where the numbers come from

| Layer | Source |
|---|---|
| Actuals (lifetime) | `v_platform_earnings` — [migration 009](../supabase/migrations/009_platform_earnings.sql) |
| Actuals (daily) | `v_platform_earnings_daily` |
| Order-level ledger | `v_platform_accounting` — [migration 013](../supabase/migrations/013_console_view_deps.sql) |
| Projections | [`lib/revenue-model.ts`](../lib/revenue-model.ts) (pure functions) |
| Live planner | Admin → **Revenue & P&L → Scenario planner** (every input editable, CSV export) |
| Applied revenue | `transaction_fees` (job fees) + `boost_purchases.amount` (boosts) |

**Changing the assumptions:** Admin → **Configuration → “Pi price (USD)”** persists the
official Pi→USD assumption (versioned and audited like every setting). The Scenario
planner can also override any value locally to test a scenario without touching config.

> ⚠️ **The Pi price below (`$0.30 / π`) is a placeholder assumption, not a market quote.**
> Update it to the current rate before quoting the USD figures anywhere external.

---

## 1. Assumptions (base case)

| # | Assumption | Base value | Editable in |
|---|---|---|---|
| 1 | Pi price | **$0.30 / π** | Configuration, planner |
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

| Metric | π | USD @ $0.30 |
|---|---:|---:|
| Released jobs | 1 | — |
| Gross volume (GMV) | 15.00 | $4.50 |
| Provider payouts | 13.50 | $4.05 |
| **Job completion fees** | **1.50** | **$0.45** |
| **Boost revenue** | **5.00** | **$1.50** |
| Network costs recorded | 0.00 | $0.00 |
| **Net earnings** | **6.50** | **$1.95** |
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
Net (USD)            = net (π) × assumed Pi price − infrastructure
```

**Per-unit economics**

| Unit | @ 10% fee | @ 5% fee |
|---|---:|---:|
| Fee on a 20 π job | 2.00 π · $0.60 | 1.00 π · $0.30 |
| minus network fee | 0.01 π · $0.003 | 0.01 π · $0.003 |
| **Net per released job** | **1.99 π · ≈$0.60** | **0.99 π · ≈$0.30** |
| Fee on a boost (5 π) | — | — |
| **Net per boost** | **5.00 π · $1.50** | **5.00 π · $1.50** |

Boosts carry no payout cost, which is why they contribute ~29% of revenue from ~4% of
the gross value flowing through the platform.

---

## 4. Base-case 12-month projection

Assumptions above, 10% fee, $0.30/π, 10% monthly volume growth, $50/mo infrastructure.

| Month | Released jobs | Job fees (π) | Boosts (π) | Revenue (π) | Revenue (USD) | Net (USD) | Cumulative (USD) |
|---:|---:|---:|---:|---:|---:|---:|---:|
| M1 | 48.5 | 97.00 | 40.00 | 137.00 | $41.10 | −$9.05 | −$9.05 |
| M2 | 53.4 | 106.70 | 44.00 | 150.70 | $45.21 | −$4.95 | −$14.00 |
| M3 | 58.7 | 117.37 | 48.40 | 165.77 | $49.73 | −$0.45 | −$14.44 |
| M4 | 64.6 | 129.11 | 53.24 | 182.35 | $54.70 | +$4.51 | −$9.93 |
| M5 | 71.0 | 142.02 | 58.56 | 200.58 | $60.17 | +$9.96 | **+$0.03** |
| M6 | 78.1 | 156.22 | 64.42 | 220.64 | $66.19 | +$15.96 | +$15.99 |
| M7 | 85.9 | 171.84 | 70.86 | 242.70 | $72.81 | +$22.55 | +$38.54 |
| M8 | 94.5 | 189.03 | 77.95 | 266.97 | $80.09 | +$29.81 | +$68.35 |
| M9 | 104.0 | 207.93 | 85.74 | 293.67 | $88.10 | +$37.79 | +$106.14 |
| M10 | 114.4 | 228.72 | 94.32 | 323.04 | $96.91 | +$46.57 | +$152.71 |
| M11 | 125.8 | 251.59 | 103.75 | 355.34 | $106.60 | +$56.23 | +$208.93 |
| M12 | 138.4 | 276.75 | 114.12 | 390.88 | $117.26 | +$66.85 | **+$275.78** |
| **Total** | **1,037.1** | **2,074.28** | **855.37** | **2,929.65** | **$878.89** | **+$275.78** | |

**Reading it:** month 1 is slightly negative, the platform covers its monthly costs from
**M4**, and the year closes **+$275.78** cumulative on **$878.89** of revenue. Growth is
the only reason this crosses zero inside the year.

---

## 5. Revenue by source (12 months)

| Source | π | USD @ $0.30 | Share |
|---|---:|---:|---:|
| Job completion fees (10%) | 2,074.28 | $622.28 | **70.8%** |
| Listing boosts | 855.37 | $256.61 | **29.2%** |
| **Combined** | **2,929.65** | **$878.89** | **100%** |

At a 5% job fee the split flips toward boosts:

| Source | π | USD @ $0.30 | Share |
|---|---:|---:|---:|
| Job completion fees (5%) | 1,037.14 | $311.14 | 54.8% |
| Listing boosts | 855.37 | $256.61 | 45.2% |
| **Combined** | **1,892.51** | **$567.75** | **100%** |

---

## 6. Costs

| Cost | 12-month value | Notes |
|---|---:|---|
| Network fees absorbed | 10.37 π · $3.11 | Recorded on-chain fee per released payout; currently 0.01 π |
| Infrastructure | $600.00 | Hosting + database + domain at $50/mo |
| **Total modelled costs** | **≈$603.11** | |
| Refund handling | fee forgone only | Escrow returns the buyer's principal; the platform loses the fee, not the capital |
| **Not modelled** | — | Mainnet payout fees, dispute losses, marketing, builder time |

`net (π)` in the ledger subtracts network cost only; infrastructure sits outside the
database, which is why the report states it explicitly rather than folding it into the
view.

---

## 7. Break-even

At month-one volume, with 8 boosts/month:

```
Break-even released jobs/month =
  (infra USD ÷ Pi price − boost revenue) ÷ ((1 − refund rate) × (avg value × fee% − network fee))
```

- **Base case: ≈66 released jobs/month** (vs 50 in month 1) → monthly break-even at **M4**.
- Cumulative break-even at **M5**.
- If boosts alone cover infrastructure, break-even jobs = 0.

---

## 8. Sensitivity — what actually moves the result

All rows use the same 12-month horizon and growth unless stated.

| Scenario | 12-mo revenue (USD) | 12-mo net (USD) | Break-even jobs/mo | Cumulative payback |
|---|---:|---:|---:|---|
| **Base — 10% fee, $0.30/π** | **$878.89** | **+$275.78** | 66 | M5 |
| 5% fee, $0.30/π | $567.75 | −$35.36 | 132 | not in 12 mo |
| 10% fee, **$0.20/π** | $585.93 | −$16.14 | 109 | not in 12 mo |
| 10% fee, **$0.50/π** | $1,464.82 | +$859.64 | 31 | M1 |
| 10% fee, **0% growth** | $493.20 | −$108.55 | 66 | not in 12 mo |

**Takeaways**

1. **Pi's USD price is the largest swing factor.** $0.20 → $0.50 turns a −$16 year into a
   +$860 year without changing a single behaviour. Quote π as the stable unit and USD as
   a sensitivity, never the reverse.
2. **The fee toggle matters, but less than price.** 5% vs 10% changes job-fee revenue by
   ~2×, yet boosts keep the business viable at 5% — they are the margin ballast.
3. **Growth is what makes the base case work.** Flat volume at 50 jobs/mo never clears
   $50/mo of infrastructure.
4. **Infrastructure is small and fixed.** Break-even jobs scale linearly with it; every
   $10/mo of infra adds ~13 jobs/mo at $0.30/π.

---

## 9. Definitions & disclosures

- **GMV ≠ revenue.** Gross volume is the total value flowing through escrow. The platform
  earns the fee + boosts only.
- **In-flight escrow is a liability, not revenue.** Money held for unfinished jobs is
  reported separately (dashboard `escrow.inFlight`).
- **Sandbox only.** Payments run in the Pi sandbox for this build; mainnet payout access
  is not claimed. No USD figure here represents settled fiat.
- **USD is derived, not observed.** `USD = π × $0.30`. Change the rate and every figure
  above moves; the π columns do not.
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

- Admin console: **Revenue & P&L** (actuals + planner + daily CSV).
- Planner: change any assumption, then **Export CSV** for the monthly model.
- Code: `lib/revenue-model.ts` (`computeScenario`, `scenarioCsv`).
- Config: `platform_settings.pi_usd_rate` (migration
  [`016`](../supabase/migrations/016_pi_usd_rate.sql)).
