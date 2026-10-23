import "dotenv/config";
import { db } from "../src/lib/server/db";
import type { Prisma } from "@prisma/client";
import type { Draft, PatientFacts } from "../src/lib/contracts";

/** Idempotent projections only. Never changes original case/attempt snapshots. */
async function main() {
  let after: string | undefined;
  for (;;) {
    const batch = await db.simulation.findMany({
      where: after ? { id: { gt: after } } : {},
      orderBy: { id: "asc" },
      take: 200,
      select: {
        id: true,
        draft: true,
        caseVersion: { select: { patient: true } },
      },
    });
    for (const s of batch) {
      const p = s.caseVersion.patient as unknown as PatientFacts;
      const risk = (s.draft as unknown as Draft).risk;
      await db.simulation.update({
        where: { id: s.id },
        data: {
          patientName: p.name,
          patientNameSearch: p.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase(),
          riskRank:
            (
              { HIGH: 0, MEDIUM: 1, LOW: 2, NON_ACUTE: 3 } as Record<
                string,
                number
              >
            )[risk] ?? 4,
        },
      });
    }
    if (batch.length < 200) break;
    after = batch[batch.length - 1].id;
  }
  after = undefined;
  for (;;) {
    const batch: { id: string; versions: { status: string }[] }[] =
      await db.clinicalCase.findMany({
        where: after ? { id: { gt: after } } : {},
        orderBy: { id: "asc" },
        take: 200,
        select: {
          id: true,
          versions: {
            take: 1,
            orderBy: { version: "desc" },
            select: { status: true },
          },
        },
      });
    for (const c of batch)
      await db.clinicalCase.update({
        where: { id: c.id },
        data: { currentStatus: c.versions[0]?.status ?? "DRAFT" },
      });
    if (batch.length < 200) break;
    after = batch[batch.length - 1].id;
  }
  // A legacy pending job has no quota reservation. Fail it explicitly so the user
  // can request a newly budgeted generation, preserving the submitted snapshot.
  after = undefined;
  for (;;) {
    const batch: Prisma.JobGetPayload<{
      include: {
        attempt: { include: { simulation: { include: { class: true } } } };
        _count: { select: { reservations: true } };
      };
    }>[] = await db.job.findMany({
      where: {
        ...(after ? { id: { gt: after } } : {}),
        attemptId: { not: null },
      },
      orderBy: { id: "asc" },
      take: 200,
      include: {
        attempt: { include: { simulation: { include: { class: true } } } },
        _count: { select: { reservations: true } },
      },
    });
    for (const job of batch) {
      const a = job.attempt!;
      await db.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: job.id },
          data: {
            ownerId: a.simulation.studentId,
            instructorId: a.simulation.class.instructorId,
          },
        });
        if (
          !job._count.reservations &&
          ["QUEUED", "RUNNING"].includes(job.state)
        ) {
          await tx.job.update({
            where: { id: job.id },
            data: { state: "FAILED", leaseToken: null, leaseUntil: null },
          });
          await tx.attempt.update({
            where: { id: a.id },
            data: {
              status: "FAILED",
              error:
                "Avaliação anterior à atualização de quotas. Solicite nova análise; seu registro foi preservado.",
            },
          });
          await tx.simulation.updateMany({
            where: { id: a.simulationId, revision: a.revision },
            data: { status: "FAILED" },
          });
        }
      });
    }
    if (batch.length < 200) break;
    after = batch[batch.length - 1].id;
  }
  console.log(
    "Projeções e trabalhos legados atualizados. Snapshots preservados.",
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
