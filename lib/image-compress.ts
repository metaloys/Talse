// Client-side image normalisation for user-uploaded portfolio images.
//
// Portfolio images are stored as data URLs inside services.images, so an
// untouched phone photo (3–8 MB, 4000 px wide) becomes a multi-megabyte row
// that is re-sent with every catalogue response. Downscaling to display size
// and re-encoding to WebP before the data leaves the browser keeps listings
// in the low hundreds of KB without needing a storage bucket.

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const ACCEPTED = new Set<string>(ACCEPTED_IMAGE_TYPES);

export class ImageRejectedError extends Error {}

export async function compressImageFile(file: File, maxDim = 1000, quality = 0.82): Promise<string> {
  if (!ACCEPTED.has(file.type)) {
    throw new ImageRejectedError("Use a JPG, PNG or WebP image.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageRejectedError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 12 MB.`);
  }

  const source = await loadImage(file);
  return renderToDataUrl(source, maxDim, quality, !file.type.startsWith("image/png"));
}

// Cover thumbnails: catalogue cards render one image per listing, so the list
// response carries this small version and never the full-size gallery.
export const COVER_MAX_DIM = 320;
export const COVER_QUALITY = 0.72;

/**
 * Downscales an existing data URL into a cover thumbnail. Used when editing a
 * listing whose first image is already stored, so the cover can be regenerated
 * without asking the owner to re-upload anything.
 */
export async function makeCoverFromDataUrl(
  dataUrl: string,
  maxDim = COVER_MAX_DIM,
  quality = COVER_QUALITY,
): Promise<string | null> {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
  try {
    const source = await loadImageSource(dataUrl);
    return await renderToDataUrl(source, maxDim, quality);
  } catch {
    return null;
  }
}

async function renderToDataUrl(
  source: ImageBitmap | HTMLImageElement,
  maxDim: number,
  quality: number,
  fillWhite = false,
): Promise<string> {
  const width = "width" in source ? source.width : 0;
  const height = "height" in source ? source.height : 0;
  if (!width || !height) throw new ImageRejectedError("That image could not be read.");

  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageRejectedError("This browser could not process the image.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (fillWhite) {
    // Sources without an alpha channel (JPEG/WebP) must not end up with black
    // where the canvas starts transparent.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
  }
  ctx.drawImage(source as CanvasImageSource, 0, 0, targetW, targetH);

  if (typeof (source as ImageBitmap).close === "function") {
    (source as ImageBitmap).close();
  }

  const webp = canvas.toDataURL("image/webp", quality);
  if (webp.startsWith("data:image/webp")) return webp;
  // Older browsers fall back to PNG, which ignores the quality argument.
  return canvas.toDataURL("image/png");
}

async function loadImageSource(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageRejectedError("That image could not be read."));
    img.src = src;
  });
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to the <img> path (e.g. some Safari versions)
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new ImageRejectedError("That image could not be read."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
