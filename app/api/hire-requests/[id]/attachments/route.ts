import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyPiToken, PiAuthError } from "@/lib/pi-verify";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_FILES = 6;
const MAX_BYTES = 10 * 1024 * 1024;

function isPng(bytes: Uint8Array) {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebp(bytes: Uint8Array) {
  return bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

function isPdf(bytes: Uint8Array) {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

async function detectAttachmentMime(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (isPng(bytes)) return "image/png";
  if (isJpeg(bytes)) return "image/jpeg";
  if (isWebp(bytes)) return "image/webp";
  if (isPdf(bytes)) return "application/pdf";
  return null;
}

// Uploads to supabase storage bucket 'hire-attachments' under path {hireRequestId}/{uuid}-{filename}
// Validates caller is buyer or provider; enforces max files per request and per-file size/type limits.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await verifyPiToken(req.headers.get("authorization"));
    // per-user rate limit for uploading attachments: 60 per hour
    if (!(await checkRateLimit(`${me.uid}:hire-requests:attachments`, 60, 3600))) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again later." }, { status: 429 });
    }
    const { id } = await params;

    // fetch hire request and verify participant
    const { data: hr, error: hrErr } = await supabaseAdmin
      .from("hire_requests")
      .select("id, buyer_uid, provider_uid, attachments")
      .eq("id", id)
      .single();
    if (hrErr || !hr) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (hr.buyer_uid !== me.uid && hr.provider_uid !== me.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // parse multipart/form-data
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const formData = await req.formData();
    const files = Array.from(formData.entries())
      .filter(([, v]) => v instanceof File)
      .map(([, v]) => v as File);

    if (files.length === 0) return NextResponse.json({ error: "No files provided" }, { status: 400 });

    const uploadedPaths: string[] = [];

    for (const file of files) {
      const detectedMime = await detectAttachmentMime(file);
      if (!detectedMime) {
        return NextResponse.json({ error: `Unsupported file type for ${file.name}` }, { status: 415 });
      }

      const buf = await file.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) {
        return NextResponse.json({ error: "File too large" }, { status: 413 });
      }

      const nameSafe = encodeURIComponent(file.name).replace(/%2F/g, "-");
      const path = `${id}/${crypto.randomUUID()}-${nameSafe}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("hire-attachments")
        .upload(path, new Blob([buf], { type: detectedMime }), { contentType: detectedMime });
      if (upErr) {
        console.error("Supabase storage upload failed:", upErr);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
      }
      uploadedPaths.push(path);
    }

    const { data: updated, error: updErr } = await supabaseAdmin.rpc("append_hire_attachment_paths", {
      hire_id: id,
      incoming: uploadedPaths,
    });

    if (updErr) {
      await Promise.all(
        uploadedPaths.map((path) => supabaseAdmin.storage.from("hire-attachments").remove([path]))
      );

      if (String(updErr.message).toLowerCase().includes("too many files")) {
        return NextResponse.json({ error: "Too many files for this request" }, { status: 413 });
      }

      console.error("Failed to update hire_requests attachments:", updErr);
      return NextResponse.json({ error: "Failed to record attachments" }, { status: 500 });
    }

    return NextResponse.json({ paths: uploadedPaths, request: updated });
  } catch (err) {
    if (err instanceof PiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
