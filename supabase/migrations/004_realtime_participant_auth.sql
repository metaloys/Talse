-- Migration 004: Realtime participant auth guardrails for private hire_request channels.
-- This keeps the broader authz rule in source-controlled SQL and makes the live
-- database match the application-level expectations for buyer/provider channel access.

create or replace function public.realtime_hire_request_authorized()
returns boolean
language sql
security definer
as $$
  select exists (
    select 1
    from hire_requests hr
    where hr.id::text = split_part(current_setting('request.jwt.claims', true), ':', 2)
      and (
        hr.buyer_uid = current_setting('request.jwt.claim.sub', true)
        or hr.provider_uid = current_setting('request.jwt.claim.sub', true)
      )
  );
$$;

-- The actual Realtime policy is project environment-specific; this migration is a
-- tracked source-of-truth for the authorization rule so it is not lost again.
