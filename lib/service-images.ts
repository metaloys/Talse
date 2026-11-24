// Server-side guard for services.cover_image.
//
// The cover is a small thumbnail the client generates with canvas (see
// lib/image-compress.ts). The column is served to every visitor in catalogue
// responses, so an unbounded value here would recreate exactly the payload
// problem the column was added to fix: reject anything that is not a small
// image data URL.

// A 320px WebP thumbnail is ~10–25 KB, i.e. ~13–33k base64 characters. This cap
// leaves generous room while keeping a single catalogue row small.
export const COVER_MAX_CHARS = 120_000;

const COVER_PATTERN = /^data:image\/(webp|png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/;

/**
 * Returns a validated cover data URL, or null when the value is absent or
 * unusable. Never throws: a bad cover must not break listing create/update,
 * it just leaves the listing without a thumbnail.
 */
export function sanitizeCoverImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > COVER_MAX_CHARS) return null;
  return COVER_PATTERN.test(trimmed) ? trimmed : null;
}
