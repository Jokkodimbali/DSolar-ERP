CREATE TABLE "AuthRateLimitBucket" (
  "key" VARCHAR(64) PRIMARY KEY,
  "count" INTEGER NOT NULL CHECK ("count" > 0 AND "count" <= 120),
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AuthRateLimitBucket_expiresAt_idx" ON "AuthRateLimitBucket" ("expiresAt");
