const crypto = require("crypto");

const BUCKET = "post-media";

/**
 * Uploads post creatives to Supabase Storage.
 *
 * The bucket is public-read so a client can open the image from a WhatsApp link without a
 * login — the same trade-off already made for invoice PDFs. Writes go through the service
 * role, so only this server can put anything in it.
 *
 * Deliberately written against the Storage REST API rather than the supabase-js SDK: this
 * is two HTTP calls, and it avoids adding a dependency and a second Postgres connection
 * pool to a serverless function that already has one.
 */
function storageConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, key, configured: Boolean(url && key) };
}

function isConfigured() {
  return storageConfig().configured;
}

function extensionFor(mimeType) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[mimeType] || "bin";
}

async function uploadPostImage({ buffer, mimeType, contentId }) {
  const { url, key, configured } = storageConfig();
  if (!configured) {
    const error = new Error("Image uploads are not configured yet. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    error.status = 503;
    throw error;
  }

  // Random suffix so re-uploading a post's creative never collides with, or is confused
  // for, the previous one — and so a guessed content id does not reveal the image.
  const path = `${contentId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extensionFor(mimeType)}`;

  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": mimeType,
      "x-upsert": "true"
    },
    body: buffer
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`Could not store the image. ${detail.slice(0, 160)}`.trim());
    error.status = 502;
    throw error;
  }

  return { path, publicUrl: `${url}/storage/v1/object/public/${BUCKET}/${path}` };
}

async function removePostImage(publicUrl) {
  const { url, key, configured } = storageConfig();
  if (!configured || !publicUrl) return false;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return false;
  const path = publicUrl.slice(index + marker.length);
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` }
  });
  return response.ok;
}

module.exports = { uploadPostImage, removePostImage, isConfigured, BUCKET };
