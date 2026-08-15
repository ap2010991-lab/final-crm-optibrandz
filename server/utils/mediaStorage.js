const crypto = require("crypto");
const prisma = require("../db/prisma");

const BUCKET = "post-media";

/**
 * Stores post creatives.
 *
 * Two backends, chosen automatically:
 *
 *  - Supabase Storage, when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are both set. This
 *    is the better long-term home: the bytes never touch the database and the public URL
 *    is served straight from Supabase's CDN.
 *  - The database, otherwise. The service-role key was never configured, so every upload
 *    failed with "not configured yet" and the feature was dead. The app already holds a
 *    Postgres connection, so falling back to it means uploads work with no extra
 *    credentials at all. Images are downscaled in the browser first, so a typical creative
 *    is a couple of hundred kilobytes.
 *
 * Existing images keep working either way, because what is stored on the post is a URL and
 * both backends produce one.
 */
function storageConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, key, configured: Boolean(url && key) };
}

const usingBucket = () => storageConfig().configured;

// Uploads always work now; this reports which backend is in use.
function isConfigured() {
  return true;
}

function backendName() {
  return usingBucket() ? "supabase-storage" : "database";
}

function extensionFor(mimeType) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[mimeType] || "bin";
}

async function uploadToBucket({ buffer, mimeType, contentId }) {
  const { url, key } = storageConfig();
  const path = `${contentId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extensionFor(mimeType)}`;
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": mimeType, "x-upsert": "true" },
    body: buffer
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`Could not store the image. ${detail.slice(0, 160)}`.trim());
    error.status = 502;
    throw error;
  }
  return { publicUrl: `${url}/storage/v1/object/public/${BUCKET}/${path}` };
}

async function uploadToDatabase({ buffer, mimeType, contentId }) {
  const asset = await prisma.mediaAsset.create({
    data: { contentId, mimeType, bytes: buffer, byteSize: buffer.length },
    select: { id: true }
  });
  // Relative on purpose: the CRM and API share an origin, so this keeps working whatever
  // hostname the deployment is reachable on.
  return { publicUrl: `/api/public/media/${asset.id}` };
}

async function uploadPostImage(input) {
  return usingBucket() ? uploadToBucket(input) : uploadToDatabase(input);
}

async function removePostImage(publicUrl) {
  if (!publicUrl) return false;

  const dbMatch = publicUrl.match(/\/api\/public\/media\/([0-9a-f-]{36})/i);
  if (dbMatch) {
    await prisma.mediaAsset.deleteMany({ where: { id: dbMatch[1] } });
    return true;
  }

  const { url, key, configured } = storageConfig();
  if (!configured) return false;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return false;
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${publicUrl.slice(index + marker.length)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` }
  });
  return response.ok;
}

module.exports = { uploadPostImage, removePostImage, isConfigured, backendName, BUCKET };
