-- Migration: Add admin foundation tables for Reports, Categories, and Audit Events
-- This is additive and safe for existing deployments.

-- Create report types and table
create type if not exists report_target_type as enum ('service','user','review');
create type if not exists report_status as enum ('open','reviewing','resolved','dismissed');

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_uid text not null references profiles(pi_uid),
  target_type report_target_type not null,
  target_id text not null,
  reason text not null,
  details text,
  status report_status not null default 'open',
  admin_note text,
  resolved_by text references profiles(pi_uid),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create categories table for future DB-backed categories
create table if not exists categories (
  id text primary key,
  label text not null,
  short text not null,
  blurb text not null,
  hue integer not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Admin audit events (append-only)
create table if not exists admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_uid text not null references profiles(pi_uid),
  action text not null,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Attach updated_at trigger where helper exists
drop trigger if exists trg_reports_updated on reports;
create trigger trg_reports_updated before update on reports for each row execute function set_updated_at();

drop trigger if exists trg_categories_updated on categories;
create trigger trg_categories_updated before update on categories for each row execute function set_updated_at();

drop trigger if exists trg_admin_audit_updated on admin_audit_events;
create trigger trg_admin_audit_updated before update on admin_audit_events for each row execute function set_updated_at();

-- Row Level Security: enable RLS (server/service role continues to have full access)
alter table reports enable row level security;
alter table categories enable row level security;
alter table admin_audit_events enable row level security;

-- Public read policy for categories (only active categories are publicly readable)
create policy "categories are publicly readable"
  on categories for select
  using (active = true);

-- Do not create public policies for reports or admin_audit_events. These
-- are admin-only and intentionally not visible to the anon/public key.
