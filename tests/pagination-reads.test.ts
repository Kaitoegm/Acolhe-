import { beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({
  simulation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  clinicalCase: { findMany: vi.fn(), findFirst: vi.fn() },
  attempt: { findFirst: vi.fn(), findMany: vi.fn() },
  message: { findMany: vi.fn() },
  review: { findMany: vi.fn() },
}));
vi.mock("../src/lib/server/db", () => ({ db: store }));
import { readApi } from "../src/lib/server/reads";
const user = { id: "student-a", role: "STUDENT" };
const request = (path: string) => new Request("http://localhost/api/" + path);
describe("bounded authorized reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "read-tests-at-least-32-secret-characters";
  });
  it("queue uses take26, scoped keyset and minimal selects without histories or rubric", async () => {
    store.simulation.findMany.mockResolvedValue([]);
    expect(
      await readApi(request("simulations"), ["simulations"], user),
    ).toEqual({ items: [], nextCursor: null, hasMore: false });
    const query = store.simulation.findMany.mock.calls[0][0];
    expect(query.take).toBe(26);
    expect(query.where.AND).toContainEqual({
      studentId: "student-a",
      class: { memberships: { some: { userId: "student-a" } } },
    });
    expect(query.select.messages).toBeUndefined();
    expect(query.select.attempts).toBeUndefined();
    expect(query.select.caseVersion.select.rubric).toBeUndefined();
  });
  it("does not let cursors replace authorization and scopes instructor through class owner", async () => {
    store.simulation.findMany.mockResolvedValue([]);
    await readApi(
      request("instructor/simulations?classId=other"),
      ["instructor", "simulations"],
      { id: "teacher-a", role: "INSTRUCTOR" },
    );
    const query = store.simulation.findMany.mock.calls[0][0];
    expect(query.where.AND).toContainEqual({
      class: { instructorId: "teacher-a" },
    });
    expect(query.where.AND).toContainEqual({ classId: "other" });
  });
  it("rejects unrecognized filters, unknown routes and exact segment mismatches", async () => {
    await expect(
      readApi(request("simulations?status=INVALID"), ["simulations"], user),
    ).rejects.toThrow();
    await expect(
      readApi(request("cases?q=ana"), ["cases"], user),
    ).rejects.toThrow();
    expect(
      await readApi(
        request("simulations/x/messages/extra"),
        ["simulations", "x", "messages", "extra"],
        user,
      ),
    ).toBeUndefined();
    expect(store.simulation.findFirst).not.toHaveBeenCalled();
  });
  it("authorizes every history query before loading bounded rows", async () => {
    store.simulation.findFirst.mockResolvedValue(null);
    await expect(
      readApi(
        request("simulations/foreign/messages"),
        ["simulations", "foreign", "messages"],
        user,
      ),
    ).rejects.toThrow("Atendimento não encontrado.");
    expect(store.message.findMany).not.toHaveBeenCalled();
    store.simulation.findFirst.mockResolvedValue({ id: "mine" });
    store.message.findMany.mockResolvedValue([]);
    await readApi(
      request("simulations/mine/messages?limit=100"),
      ["simulations", "mine", "messages"],
      user,
    );
    expect(store.message.findMany.mock.calls[0][0]).toMatchObject({
      take: 101,
      where: { AND: [{ simulationId: "mine" }, {}] },
    });
  });
  it("attempt metadata pages never load snapshots feedback conversations or case rubrics", async () => {
    store.simulation.findFirst.mockResolvedValue({ id: "mine" });
    store.attempt.findMany.mockResolvedValue([]);
    await readApi(
      request("simulations/mine/attempts"),
      ["simulations", "mine", "attempts"],
      user,
    );
    const query = store.attempt.findMany.mock.calls[0][0];
    expect(query.take).toBe(26);
    expect(Object.keys(query.select).sort()).toEqual([
      "createdAt",
      "error",
      "id",
      "job",
      "number",
      "status",
    ]);
  });
});
