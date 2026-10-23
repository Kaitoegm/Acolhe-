import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "../../src/lib/server/db";
import { demoCases } from "../../src/lib/domain";
import { json } from "../../src/lib/server/views";
import {
  planTestCleanup,
  executeTestCleanup,
} from "../../src/lib/maintenance/test-data";
const generatedOwners = new Set<string>();
export async function cleanupClassroomFixtures() {
  const owners = [...generatedOwners];
  if (!owners.length) return;
  await db.$transaction(
    async (tx) => executeTestCleanup(tx, await planTestCleanup(tx, owners)),
    { timeout: 30000 },
  );
  generatedOwners.clear();
}
// Isolated educational fixtures. Never mark these scenarios clinically approved.
export async function classroomFixture() {
  const id = randomUUID(),
    email = `instructor-e2e-${id}@test.local`,
    password = "Integracao-isolada-2026!";
  const instructor = await db.user.create({
    data: {
      email,
      name: "Instrutor teste automatizado",
      role: "INSTRUCTOR",
      passwordHash: await hash(password, 12),
    },
  });
  generatedOwners.add(instructor.id);
  const classroom = await db.class.create({
    data: { name: "Teste automatizado " + id, instructorId: instructor.id },
  });
  for (const c of demoCases)
    await db.clinicalCase.create({
      data: {
        ownerId: instructor.id,
        demo: true,
        currentStatus: "PENDING_REVIEW",
        assignments: { create: { classId: classroom.id } },
        versions: {
          create: {
            version: 1,
            title: c.title,
            description: c.description,
            patient: json(c.patient),
            rubric: json(c.rubric),
            status: "PENDING_REVIEW",
          },
        },
      },
    });
  return { email, password, classId: classroom.id };
}
