CREATE TABLE "BuddyPair" (
    "id" TEXT NOT NULL,
    "firstId" TEXT NOT NULL,
    "secondId" TEXT NOT NULL,
    "requestedByFirst" BOOLEAN NOT NULL,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "BuddyPair_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BuddyPair_distinct_users" CHECK ("firstId" <> "secondId"),
    CONSTRAINT "BuddyPair_firstId_fkey" FOREIGN KEY ("firstId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BuddyPair_secondId_fkey" FOREIGN KEY ("secondId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BuddyPair_firstId_secondId_key" ON "BuddyPair"("firstId", "secondId");
CREATE INDEX "BuddyPair_secondId_idx" ON "BuddyPair"("secondId");

CREATE TABLE "BuddyFocus" (
    "id" TEXT NOT NULL,
    "pairId" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "BuddyFocus_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BuddyFocus_duration" CHECK ("durationMs" >= 0),
    CONSTRAINT "BuddyFocus_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "BuddyPair"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BuddyFocus_pairId_idx" ON "BuddyFocus"("pairId");
