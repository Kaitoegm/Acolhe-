CREATE INDEX "Membership_classId_userId_idx" ON "Membership"("classId", "userId");
CREATE INDEX "Job_ownerId_state_idx" ON "Job"("ownerId", "state");
CREATE INDEX "Review_attemptId_createdAt_id_idx" ON "Review"("attemptId", "createdAt", "id");
CREATE INDEX "ChatTurn_simulationId_createdAt_id_idx" ON "ChatTurn"("simulationId", "createdAt", "id");
