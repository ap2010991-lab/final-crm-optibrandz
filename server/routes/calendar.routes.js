const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const asyncRoute = require("../utils/asyncRoute");
const { onlyProvided } = require("../utils/onlyProvided");
const { uploadPostImage, removePostImage, isConfigured, backendName } = require("../utils/mediaStorage");
const { Platform, PostType, ContentStatus } = require("../utils/enums");
const { isAllowedImage, allowedList } = require("../utils/imageTypes");

const multer = require("multer");

const router = express.Router();
// Vercel rejects bodies over 4.5 MB before they reach the function.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  // `image/*` also matched image/svg+xml, which is a script-capable XML document served
  // back on this origin. Only the raster formats a creative actually needs are accepted.
  fileFilter: (_req, file, cb) => cb(null, isAllowedImage(file.mimetype))
});

const calendarSchema = z.object({
  clientId: z.string(),
  month: z.number(),
  year: z.number(),
  platform: Platform.default("INSTAGRAM"),
  postType: PostType.default("STATIC"),
  caption: z.string().optional(),
  designBrief: z.string().optional(),
  scheduledDate: z.string().optional(),
  status: ContentStatus.default("DRAFT"),
  mediaUrl: z.string().optional()
});

router.get("/", asyncRoute(async (req, res) => {
  // Filtering on scheduledDate rather than the month/year columns when a range is asked
  // for, because those columns record which plan a post belongs to, which is not always
  // the month it actually goes out in.
  const { month, year, clientId, status } = req.query;
  const range = month && year
    ? { gte: new Date(Number(year), Number(month) - 1, 1), lt: new Date(Number(year), Number(month), 1) }
    : null;

  const data = await prisma.contentCalendar.findMany({
    where: {
      ...(clientId ? { clientId: String(clientId) } : {}),
      ...(status ? { status: String(status) } : {}),
      ...(range
        ? { OR: [{ scheduledDate: range }, { scheduledDate: null, month: Number(month), year: Number(year) }] }
        : {})
    },
    // The schedule view spans every client, so it needs the name to show against each post.
    include: { client: { select: { id: true, businessName: true, phone: true, contactPerson: true } } },
    orderBy: [{ scheduledDate: "asc" }, { createdAt: "asc" }]
  });
  res.json({ data });
}));

router.post("/", asyncRoute(async (req, res) => {
  const body = calendarSchema.parse(req.body);
  const item = await prisma.contentCalendar.create({
    data: { ...body, scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : null }
  });
  res.status(201).json({ data: item });
}));

// "Generate Month" used to blindly add another full batch every time it was pressed,
// so a double tap left 52 posts in one month. It now tops up to the requested count.
router.post("/bulk", asyncRoute(async (req, res) => {
  const body = z.object({
    clientId: z.string().min(1),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
    count: z.number().int().min(1).max(60).default(26),
    platform: Platform.default("INSTAGRAM")
  }).parse(req.body);

  const client = await prisma.client.findUnique({ where: { id: body.clientId } });
  if (!client) return res.status(422).json({ message: "Choose a client first." });

  const existing = await prisma.contentCalendar.count({
    where: { clientId: body.clientId, month: body.month, year: body.year }
  });
  const missing = Math.max(body.count - existing, 0);
  if (!missing) {
    return res.status(200).json({ data: [], created: 0, existing, message: `This month already has ${existing} posts planned.` });
  }

  const daysInMonth = new Date(body.year, body.month, 0).getDate();
  const created = Array.from({ length: missing }, (_, index) => {
    const slot = existing + index;
    return {
      clientId: body.clientId,
      month: body.month,
      year: body.year,
      platform: body.platform,
      postType: slot % 4 === 0 ? "REEL" : "STATIC",
      caption: "",
      designBrief: "",
      scheduledDate: new Date(body.year, body.month - 1, Math.min(daysInMonth, 1 + Math.floor(slot * daysInMonth / body.count))),
      status: "DRAFT"
    };
  });
  await prisma.contentCalendar.createMany({ data: created });
  res.status(201).json({ data: created, created: created.length, existing });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  const body = onlyProvided(req.body, calendarSchema.partial().parse(req.body));
  const current = await prisma.contentCalendar.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Content item not found" });

  // approvedAt and publishedAt existed but nothing ever wrote them: the UI advances a
  // post with a plain status PUT, and the one route that stamped approvedAt was never
  // called from anywhere. Reports therefore had to use the *scheduled* date as a stand-in
  // for when a post actually went out, which is wrong whenever it slipped a day.
  const stamps = {};
  if (body.status === "APPROVED" && !current.approvedAt) stamps.approvedAt = new Date();
  if (body.status === "PUBLISHED" && !current.publishedAt) stamps.publishedAt = new Date();
  // Moving a post back out of published means it did not go out after all.
  if (body.status && body.status !== "PUBLISHED" && current.publishedAt) stamps.publishedAt = null;

  const item = await prisma.contentCalendar.update({
    where: { id: current.id },
    data: {
      ...body,
      ...stamps,
      ...(body.scheduledDate ? { scheduledDate: new Date(body.scheduledDate) } : {})
    }
  });
  res.json({ data: item });
}));

// Anyone with the content permission can attach the creative — that is the designer's
// whole job here. Approving it stays with the owner and account managers.
router.post("/:id/media", upload.single("image"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(422).json({ message: `Choose a ${allowedList()} image under 4 MB.` });
  // Belt and braces: multer's filter already rejected it, but the stored mime type is
  // what gets echoed back as a Content-Type, so it is checked again before it is kept.
  if (!isAllowedImage(req.file.mimetype)) {
    return res.status(422).json({ message: `That file type is not supported. Use ${allowedList()}.` });
  }
  const current = await prisma.contentCalendar.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Content item not found" });

  const { publicUrl } = await uploadPostImage({
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    contentId: current.id
  });

  const item = await prisma.contentCalendar.update({
    where: { id: current.id },
    data: {
      mediaUrl: publicUrl,
      // Attaching a creative to an untouched draft moves it along by itself: the designer
      // has done the work, so it should be waiting for approval, not sitting in Draft.
      ...(current.status === "DRAFT" ? { status: "IN_DESIGN" } : {})
    }
  });

  // Best effort: an orphaned old file is not worth failing the request over.
  if (current.mediaUrl && current.mediaUrl !== publicUrl) {
    removePostImage(current.mediaUrl).catch(() => {});
  }
  res.status(201).json({ data: item });
}));

router.get("/media/status", (_req, res) => res.json({ data: { configured: isConfigured(), backend: backendName() } }));

router.delete("/:id", asyncRoute(async (req, res) => {
  const current = await prisma.contentCalendar.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ message: "Content item not found" });
  await prisma.contentCalendar.delete({ where: { id: req.params.id } });
  if (current.mediaUrl) removePostImage(current.mediaUrl).catch(() => {});
  res.json({ data: current });
}));

// Turn multer size/type rejections into something the CRM can show.
router.use((err, _req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "That image is larger than 4 MB. Please pick a smaller one." });
  }
  return next(err);
});

module.exports = router;
