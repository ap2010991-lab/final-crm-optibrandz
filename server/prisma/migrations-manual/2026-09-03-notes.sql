-- Personal notes, private by default, shared read-only by name.
-- Spec: docs/superpowers/specs/2026-09-03-personal-notes-design.md
--
-- Additive only: two new tables and their keys. Nothing existing is touched, so the code
-- running before this lands is unaffected by two tables it does not know about — which is
-- why this is applied BEFORE the deploy rather than after.
--
-- Guarded so re-running is harmless. This project has no prisma/migrations history; the
-- statements below were generated with
--   prisma migrate diff --from-schema-datamodel <previous schema> --to-schema-datamodel prisma/schema.prisma --script
-- and then guarded and given the RLS lines every other table in this schema carries.

CREATE TABLE IF NOT EXISTS "Note" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NoteShare" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteShare_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Note_ownerId_updatedAt_idx" ON "Note"("ownerId", "updatedAt");
CREATE INDEX IF NOT EXISTS "NoteShare_userId_sharedAt_idx" ON "NoteShare"("userId", "sharedAt");
-- The database, not a code check, is what makes double-sharing impossible.
CREATE UNIQUE INDEX IF NOT EXISTS "NoteShare_noteId_userId_key" ON "NoteShare"("noteId", "userId");

-- ADD CONSTRAINT has no IF NOT EXISTS, so each is added only when absent.
DO $$ BEGIN
  ALTER TABLE "Note" ADD CONSTRAINT "Note_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Every table in this schema carries RLS with no policies: the app connects as `postgres`,
-- which owns the tables and bypasses RLS, while the public anon key is left with nothing.
-- Skipping this would make these two the one readable hole in the database — and of every
-- table in it, private notes are the worst one to leave open.
ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NoteShare" ENABLE ROW LEVEL SECURITY;
