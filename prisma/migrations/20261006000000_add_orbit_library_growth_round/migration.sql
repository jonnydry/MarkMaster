-- A library auto-tag run can take a second round: after the pass over the
-- closed tag list, Grok names new tags for the posts it left untagged and the
-- worker judges those posts against only the new names.
ALTER TABLE "OrbitLibraryRun"
  ADD COLUMN "round" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "growthVocabulary" JSONB,
  ADD COLUMN "roundStartedAt" TIMESTAMP(3),
  ADD COLUMN "priorRoundApplied" INTEGER NOT NULL DEFAULT 0;
