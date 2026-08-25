const test = require("node:test");
const assert = require("node:assert/strict");
const { start, stop, reset, makeUser, login, req, prisma } = require("./helpers");

let token;
let postId;

test.before(async () => {
  await start();
  await reset();
  await makeUser({ email: "owner@test.in", role: "OWNER" });
  token = await login("owner@test.in");
  const client = await prisma.client.create({
    data: { businessName: "Media Co", contactPerson: "X", phone: "9000000000", status: "ACTIVE" }
  });
  const post = await prisma.contentCalendar.create({
    data: { clientId: client.id, month: 8, year: 2026, platform: "INSTAGRAM", postType: "STATIC", status: "DRAFT" }
  });
  postId = post.id;
});
test.after(stop);

/** multipart body without pulling in a dependency. */
function multipart(filename, contentType, content) {
  const boundary = "----crmtest";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

async function upload(filename, contentType, content) {
  const { body, contentType: ct } = multipart(filename, contentType, content);
  const base = await start();
  const response = await fetch(`${base}/calendar/${postId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": ct },
    body
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

test("an SVG cannot be stored as a post creative", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  const result = await upload("evil.svg", "image/svg+xml", svg);
  assert.equal(result.status, 422, "SVG can carry script and must be refused");
});

test("a real raster image is still accepted", async () => {
  // Smallest valid PNG.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const result = await upload("ok.png", "image/png", png);
  assert.equal(result.status, 201, `a PNG must still upload, got ${JSON.stringify(result.body)}`);
});

test("stored media is served with a content type that cannot execute", async () => {
  const asset = await prisma.mediaAsset.findFirst();
  assert.ok(asset, "the PNG upload above should have stored an asset");
  const base = await start();
  const response = await fetch(`${base}/public/media/${asset.id}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^image\/(png|jpeg|webp|gif)/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy") || "", /default-src 'none'/);
});

test("the cron secret is not accepted in the query string", async () => {
  process.env.CRON_SECRET = "top-secret-value";
  const viaQuery = await req("/cron/daily?key=top-secret-value");
  assert.equal(viaQuery.status, 401, "a secret in the URL ends up in access logs");
  const viaHeader = await req("/cron/daily", { token: "top-secret-value" });
  assert.equal(viaHeader.status, 200, "the Authorization header is the supported path");
});
