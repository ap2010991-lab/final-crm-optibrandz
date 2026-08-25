/**
 * The image types a post creative may be.
 *
 * SVG is deliberately absent. It is an XML document that can carry <script>, and the
 * creative is served back from /api/public/media/:id on the CRM's own origin, so a
 * booby-trapped SVG ran in that origin and could read the JWT out of localStorage.
 * Any login able to attach a creative could have taken over the account.
 *
 * An allowlist rather than a blocklist: `image/*` also covers formats nobody has audited.
 */
const ALLOWED = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
});

const isAllowedImage = (mimeType) => Object.prototype.hasOwnProperty.call(ALLOWED, String(mimeType || "").toLowerCase());

const extensionFor = (mimeType) => ALLOWED[String(mimeType || "").toLowerCase()] || "bin";

const allowedList = () => Object.keys(ALLOWED).map((type) => type.replace("image/", "").toUpperCase()).join(", ");

module.exports = { ALLOWED, isAllowedImage, extensionFor, allowedList };
