CREATE TABLE "LedgerAutomation" (
  "periodId" UUID PRIMARY KEY REFERENCES "LedgerPeriod"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false, "actorId" UUID NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "LedgerAutomationFailure" (
  "periodId" UUID NOT NULL REFERENCES "LedgerAutomation"("periodId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sourceType" VARCHAR(40) NOT NULL, "sourceId" UUID NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  "lastError" VARCHAR(500) NOT NULL, "nextAttemptAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("periodId","sourceType","sourceId")
);
CREATE INDEX "LedgerAutomationFailure_periodId_nextAttemptAt_idx" ON "LedgerAutomationFailure" ("periodId","nextAttemptAt");
