-- ============================================================================
-- Console view dependencies (hackathon/community)
--
-- Three views the admin console reads were only ever created by hand in the
-- Supabase SQL editor, so a fresh project built from migrations would 500 on
-- the Escrow/Payments screens (v_platform_accounting), the order drawer
-- (v_messages_with_sender) and any dispute tooling (v_disputes_admin). This
-- migration captures their live definitions verbatim so the schema is
-- reproducible. All statements are idempotent (create or replace).
-- ============================================================================

-- One settled order per row: the accounting ledger the console's Escrow screen
-- and the "ledger" CSV export read. platform_net is what the platform kept
-- after network costs.
create or replace view v_platform_accounting as
select
  id,
  created_at,
  amount,
  platform_fee,
  worker_payout,
  blockchain_fee,
  platform_fee - blockchain_fee as platform_net,
  case
    when status = 'released' then 'completed'
    when status = 'refunded' then 'refunded'
    else status::text
  end as accounting_status,
  release_txid,
  refund_txid
from hire_requests
where status = any (array['released', 'refunded']::request_status[]);

-- Messages joined to their sender, so the order drawer and moderation screens
-- can show a name/avatar without a second round-trip.
create or replace view v_messages_with_sender as
select
  m.id,
  m.hire_request_id,
  m.sender_uid,
  m.text,
  m.attachments,
  m.created_at,
  p.display_name as sender_name,
  p.avatar_url   as sender_avatar
from messages m
join profiles p on m.sender_uid = p.pi_uid;

-- Currently-disputed hire requests with the service title and message count.
create or replace view v_disputes_admin as
select
  hr.id,
  hr.status,
  hr.amount,
  hr.dispute_reason,
  hr.dispute_details,
  hr.dispute_evidence,
  hr.dispute_filed_by,
  hr.created_at,
  hr.updated_at,
  s.title          as service_title,
  bp.display_name  as buyer_name,
  pp.display_name  as provider_name,
  (select count(*) from messages where messages.hire_request_id = hr.id) as message_count
from hire_requests hr
join services s on hr.service_id = s.id
join profiles bp on hr.buyer_uid = bp.pi_uid
join profiles pp on hr.provider_uid = pp.pi_uid
where hr.status = 'disputed';

-- Lock them down like the other views: service_role only.
revoke all on v_platform_accounting    from anon, authenticated;
revoke all on v_messages_with_sender   from anon, authenticated;
revoke all on v_disputes_admin         from anon, authenticated;
grant select on v_platform_accounting  to service_role;
grant select on v_messages_with_sender to service_role;
grant select on v_disputes_admin       to service_role;

comment on view v_platform_accounting is 'One ledger row per settled hire request (console Escrow + ledger export).';
comment on view v_messages_with_sender is 'Messages joined to sender profile, for admin moderation.';
comment on view v_disputes_admin is 'Currently-disputed hire requests for admin tooling.';
