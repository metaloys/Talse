import { supabaseAdmin } from "./supabase-server";

export async function makeSignedUrl(path: string, expiresSeconds = 300) {
  try {
    const { data, error } = await supabaseAdmin.storage.from("hire-attachments").createSignedUrl(path, expiresSeconds);
    if (error) throw error;
    return data.signedUrl;
  } catch (err) {
    console.error("Failed to create signed url for", path, err);
    return null;
  }
}
