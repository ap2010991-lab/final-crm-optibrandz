const MAX_DIMENSION = 1440;
const MAX_BYTES = 3.5 * 1024 * 1024;

/**
 * Shrinks an image in the browser before upload.
 *
 * A photo straight off an iPhone is routinely 5–8 MB, and Vercel rejects request bodies
 * over 4.5 MB before they ever reach the function — so without this, uploading from a
 * phone would fail with an error the CRM could not even explain. Instagram tops out around
 * 1440px wide anyway, so nothing visible is lost.
 *
 * Falls back to the original file if anything goes wrong; a slightly large upload that
 * might work beats refusing to try.
 */
export async function compressImage(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (file.size <= MAX_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
