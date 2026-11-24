-- Migration 010: lightweight listing card image.
--
-- Why: services.images holds full-size base64 data URLs. Every catalogue
-- request selected them, so one page of 5 live listings weighed ~19 MB and the
-- app waited on that request before showing anything. Cards only ever render
-- images[0], so listings now carry a small cover_image thumbnail instead, and
-- the detail view fetches the full gallery for the one listing being opened.
--
-- cover_image is filled by the app (client-side canvas downscale) on create and
-- update; existing rows are backfilled once by scripts/backfill-covers.mjs.

alter table services
  add column if not exists cover_image text;

comment on column services.cover_image is
  'Small (<=320px, WebP) data-URL thumbnail of images[0], for catalogue cards. Never full size.';
