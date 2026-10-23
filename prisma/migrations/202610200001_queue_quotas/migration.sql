-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_attemptId_fkey";

-- DropIndex
DROP INDEX "Message_simulationId_createdAt_idx";

-- AlterTable
ALTER TABLE "ClinicalCase" ADD COLUMN     "currentStatus" TEXT NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Simulation" ADD COLUMN     "conversationRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "patientName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "patientNameSearch" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "riskRank" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "chatTurnId" TEXT,
ADD COLUMN     "generation" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "instructorId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'EVALUATION',
ADD COLUMN     "ownerId" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "attemptId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ChatTurn" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "conversationRevision" INTEGER NOT NULL,
    "patient" JSONB NOT NULL,
    "conversation" JSONB NOT NULL,
    "content" TEXT NOT NULL,
    "result" TEXT,
    "error" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageBucket" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL,

    CONSTRAINT "UsageBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageReservation" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationBucket" (
    "reservationId" TEXT NOT NULL,
    "bucketId" TEXT NOT NULL,

    CONSTRAINT "ReservationBucket_pkey" PRIMARY KEY ("reservationId","bucketId")
);

-- CreateTable
CREATE TABLE "AiInvocation" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'STARTED',
    "model" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AiInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerSlot" (
    "id" INTEGER NOT NULL,
    "token" TEXT,
    "leaseUntil" TIMESTAMP(3),

    CONSTRAINT "WorkerSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatTurn_simulationId_status_idx" ON "ChatTurn"("simulationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChatTurn_simulationId_idempotencyKey_key" ON "ChatTurn"("simulationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "UsageBucket_scope_scopeId_operation_windowStart_key" ON "UsageBucket"("scope", "scopeId", "operation", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "UsageReservation_key_key" ON "UsageReservation"("key");

-- CreateIndex
CREATE UNIQUE INDEX "UsageReservation_jobId_generation_key" ON "UsageReservation"("jobId", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "AiInvocation_jobId_generation_number_key" ON "AiInvocation"("jobId", "generation", "number");

-- CreateIndex
CREATE INDEX "ClinicalCase_ownerId_currentStatus_createdAt_id_idx" ON "ClinicalCase"("ownerId", "currentStatus", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Simulation_studentId_createdAt_id_idx" ON "Simulation"("studentId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Simulation_classId_createdAt_id_idx" ON "Simulation"("classId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Simulation_studentId_riskRank_createdAt_id_idx" ON "Simulation"("studentId", "riskRank", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Simulation_classId_riskRank_createdAt_id_idx" ON "Simulation"("classId", "riskRank", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Message_simulationId_createdAt_id_idx" ON "Message"("simulationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Job_chatTurnId_key" ON "Job"("chatTurnId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_chatTurnId_fkey" FOREIGN KEY ("chatTurnId") REFERENCES "ChatTurn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatTurn" ADD CONSTRAINT "ChatTurn_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageReservation" ADD CONSTRAINT "UsageReservation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationBucket" ADD CONSTRAINT "ReservationBucket_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "UsageReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationBucket" ADD CONSTRAINT "ReservationBucket_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "UsageBucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Preserve original snapshots and populate new routing/search fields for legacy records.
UPDATE "Job" AS j SET "ownerId" = s."studentId", "instructorId" = c."instructorId"
FROM "Attempt" a JOIN "Simulation" s ON s.id = a."simulationId" JOIN "Class" c ON c.id = s."classId"
WHERE j."attemptId" = a.id;
UPDATE "Simulation" AS s SET "patientName" = COALESCE(v.patient->>'name',''), "patientNameSearch" = lower(COALESCE(v.patient->>'name','')),
"riskRank" = CASE s.draft->>'risk' WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 WHEN 'LOW' THEN 2 WHEN 'NON_ACUTE' THEN 3 ELSE 4 END
FROM "CaseVersion" v WHERE v.id = s."caseVersionId";
UPDATE "ClinicalCase" c SET "currentStatus" = v.status FROM "CaseVersion" v WHERE v."caseId"=c.id AND v.version=c."currentVersion";
-- Legacy pending jobs deliberately have no reservation. Drain them before cutover; the new
-- worker fails closed if an unreserved legacy job remains after the migration.
