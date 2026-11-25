-- Migration 016: Pi → USD reporting assumption
--
-- The revenue/costs report quotes every figure in both Pi and USD. Pi's USD
-- value is an input, not a fact, so it lives here as an editable platform
-- setting (Configuration → "Pi price (USD)") and is versioned like every other
-- setting. Projections recompute from whatever is stored; changing it never
-- touches historical ledger rows.

insert into platform_settings (key, value) values
  ('pi_usd_rate', '0.30'::jsonb)
on conflict (key) do nothing;

comment on table platform_settings is
  'Console-editable platform configuration (fees, boost pricing, limits, reporting assumptions).';
