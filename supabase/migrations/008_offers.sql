-- Migration 008: price negotiation (offers / counter-offers) before escrow.
--
-- A hire request starts at the listing price. Either party may then propose a
-- different amount. Only one offer may be live at a time; a new proposal
-- supersedes the previous one. Accepting an offer is the hire agreement: the
-- request's `amount` becomes the offer amount and the request moves to
-- 'accepted' (the only state from which escrow can be funded).
--
-- RLS is enabled with NO policies. All access goes through /api/hire-requests.

create table if not exists hire_offers (
  id uuid primary key default gen_random_uuid(),
  hire_request_id uuid not null references hire_requests(id) on delete cascade,
  proposer_uid text not null references profiles(pi_uid),
  amount numeric(12,2) not null,
  message text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'superseded')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint hire_offers_amount_positive check (amount > 0 and amount <= 100000)
);

-- At most one live offer per request.
create unique index if not exists hire_offers_one_pending
  on hire_offers (hire_request_id)
  where status = 'pending';

create index if not exists hire_offers_request_idx
  on hire_offers (hire_request_id, created_at desc);

alter table hire_offers enable row level security;

comment on table hire_offers is 'Counter-offers on hire requests; service-role access only.';
