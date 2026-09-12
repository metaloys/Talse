-- Migration: Add review moderation state and support public soft-hide filtering.

alter table reviews
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by text,
  add column if not exists hidden_reason text;

create index if not exists idx_reviews_hidden_at on reviews(hidden_at);
