const MAX_DIMENSION = 1440;
const QUALITY = 0.82;

/**
 * Downscales an image in the browser before upload.
 *
 * Two reasons. A photo straight off an iPhone is routinely 5–8 MB and Vercel rejects
 * request bodies over 4.5 MB before they reach the function, so without this an upload
 * from a phone would fail with an error the CRM could not even explain. And the creatives
 * are stored in the database, so every kilobyte saved is a kilobyte the database does not
 * carry — a 1440px JPEG is around 200–400 KB, which is fine at agency volumes.
 *
 * 1440px is Instagram's own upper bound for feed images, so nothing visible is lost.
 *
 * Falls back to the original file if anything goes wrong: a slightly large upload that
 * might work beats refusing to try.
 */
export async function compressImage(file) {
  // GIFs are left alone — drawing one to a canvas would flatten it to a single frame.
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

    // Already small in both dimensions and on disk: leave it as it is.
    if (scale === 1 && file.size <= 600 * 1024) {
      bitmap.close?.();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
