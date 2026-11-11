BEGIN;

ALTER TABLE "Friendship" ADD COLUMN "acceptedAt" TIMESTAMP(3);
UPDATE "Friendship" SET "acceptedAt" = "createdAt" WHERE "status" = 'ACCEPTED';

-- Old versions could create two requests concurrently in opposite directions.
WITH duplicates AS (
    SELECT "id", row_number() OVER (
        PARTITION BY LEAST("requesterId", "addresseeId"), GREATEST("requesterId", "addresseeId")
        ORDER BY ("status" = 'ACCEPTED') DESC, "createdAt", "id"
    ) AS position
    FROM "Friendship"
)
DELETE FROM "Friendship" WHERE "id" IN (SELECT "id" FROM duplicates WHERE position > 1);

CREATE UNIQUE INDEX "Friendship_unordered_pair_key" ON "Friendship" (
    LEAST("requesterId", "addresseeId"), GREATEST("requesterId", "addresseeId")
);

-- Keep an existing request's direction. Acceptance in either old system takes precedence.
INSERT INTO "Friendship" ("id", "requesterId", "addresseeId", "status", "acceptedAt")
SELECT 'buddy_' || "id",
    CASE WHEN "requestedByFirst" THEN "firstId" ELSE "secondId" END,
    CASE WHEN "requestedByFirst" THEN "secondId" ELSE "firstId" END,
    CASE WHEN "acceptedAt" IS NULL THEN 'PENDING'::"FriendshipStatus" ELSE 'ACCEPTED'::"FriendshipStatus" END,
    "acceptedAt"
FROM "BuddyPair"
ON CONFLICT DO NOTHING;

UPDATE "Friendship" AS f SET
    "status" = 'ACCEPTED',
    "acceptedAt" = LEAST(f."acceptedAt", b."acceptedAt")
FROM "BuddyPair" AS b
WHERE b."acceptedAt" IS NOT NULL
  AND LEAST(f."requesterId", f."addresseeId") = LEAST(b."firstId", b."secondId")
  AND GREATEST(f."requesterId", f."addresseeId") = GREATEST(b."firstId", b."secondId");

ALTER TABLE "BuddyFocus" DROP CONSTRAINT "BuddyFocus_pairId_fkey";
UPDATE "BuddyFocus" AS p SET "pairId" = f."id"
FROM "BuddyPair" AS b JOIN "Friendship" AS f
  ON LEAST(f."requesterId", f."addresseeId") = LEAST(b."firstId", b."secondId")
 AND GREATEST(f."requesterId", f."addresseeId") = GREATEST(b."firstId", b."secondId")
WHERE p."pairId" = b."id";

ALTER TABLE "BuddyFocus" ADD CONSTRAINT "BuddyFocus_pairId_fkey"
    FOREIGN KEY ("pairId") REFERENCES "Friendship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DROP TABLE "BuddyPair";

COMMIT;
