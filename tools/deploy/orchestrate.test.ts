import { expect, it, vi } from "vitest";
import { orchestrate, type Operations } from "./orchestrate.js";
import type { Plan, Request } from "./types.js";
const request: Request = {
  channel: "preview",
  purpose: "review",
  profile: "staging",
  source: "diff",
  commit: "a".repeat(40),
  base: "b".repeat(40),
  packages: [],
  prNumber: 1,
};
const plan: Plan = {
  initialSource: "diff",
  source: "diff",
  origins: ["api"],
  affected: ["api"],
  targets: ["web", "api"],
  builds: ["web"],
  deploys: ["api", "web"],
  warnings: [],
  connections: [],
};
function operations(p = plan): Operations {
  return {
    plan: vi.fn(async () => ({
      status: "planned" as const,
      plan: p,
      context: { packages: new Map() },
    })),
    sync: vi.fn(async () => ({ status: "synced" as const })),
    checks: vi.fn(async () => ({ status: "passed" as const, results: [] })),
    configure: vi.fn(async () => ({ status: "generated" as const })),
    build: vi.fn(async () => ({ status: "built" as const, results: [] })),
    deploy: vi.fn(async () => ({ status: "success" as const, results: [] })),
    report: vi.fn(async () => ({
      status: "written" as const,
      path: "report.md",
    })),
  };
}
it("stops after checks fail, retaining failure even when reporting succeeds", async () => {
  const op = operations();
  op.checks = vi.fn(async () => ({
    status: "checks-failed" as const,
    results: [
      {
        package: "api",
        task: "test",
        status: "failed" as const,
        cached: false,
      },
    ],
  }));
  const result = await orchestrate(request, op);
  expect(result.exitCode).toBe(1);
  expect(result.state.stopped?.phase).toBe("checks");
  expect(op.configure).not.toHaveBeenCalled();
  expect(op.report).toHaveBeenCalledWith(result.state);
});
it("runs sync and checks when hydration yields no targets", async () => {
  const op = operations({ ...plan, targets: [], builds: [], deploys: [] });
  expect((await orchestrate(request, op)).exitCode).toBe(0);
  expect(op.checks).toHaveBeenCalled();
  expect(op.configure).not.toHaveBeenCalled();
});
it("does no preparation for empty affected and target sets", async () => {
  const op = operations({ ...plan, affected: [], targets: [] });
  await orchestrate(request, op);
  expect(op.sync).not.toHaveBeenCalled();
});
it("separates partial deployment and report failure", async () => {
  const op = operations();
  op.deploy = async () => ({ status: "partial-failure" as const, results: [] });
  op.report = async () => ({
    status: "report-failed" as const,
    reason: "disk",
  });
  const result = await orchestrate(request, op);
  expect(result.state.status).toBe("partial-failure");
  expect(result.report.status).toBe("report-failed");
  expect(result.exitCode).toBe(1);
});
it.each(["sync", "configure", "build"] as const)(
  "stops after %s failure and reports retained results",
  async (phase) => {
    const op = operations();
    if (phase === "sync")
      op.sync = async () => ({
        status: "sync-failed",
        reason: "sync unavailable",
      });
    if (phase === "configure")
      op.configure = async () => ({
        status: "configuration-failed",
        reason: "missing D1",
      });
    if (phase === "build")
      op.build = async () => ({ status: "build-failed", results: [] });
    const result = await orchestrate(request, op);
    expect(result.state.status).toBe("failure");
    expect(op.deploy).not.toHaveBeenCalled();
    expect(op.report).toHaveBeenCalledWith(result.state);
  },
);

it("passes the captured context through execution without exposing it in the report", async () => {
  const op = operations();
  const context = {
    packages: new Map([
      ["api", { name: "api", path: "apps/api", scripts: {} }],
    ]),
  };
  op.plan = async () => ({ status: "planned", plan, context });
  const result = await orchestrate(request, op);
  expect(op.checks).toHaveBeenCalledWith(plan, context);
  expect(op.configure).toHaveBeenCalledWith(plan, request, context);
  expect(op.build).toHaveBeenCalledWith(plan, context);
  expect(op.deploy).toHaveBeenCalledWith(plan, context);
  expect(result.state.planning).not.toHaveProperty("context");
});

it("keeps Turbo invocation failure details even when requested builds succeeded", async () => {
  const op = operations();
  op.build = async () => ({
    status: "build-failed",
    reason: "Turbo process terminated",
    results: [
      { package: "web", task: "build", status: "passed", cached: false },
    ],
  });
  const outcome = await orchestrate(request, op);
  expect(outcome.state.stopped).toEqual({
    phase: "build",
    reason: "Turbo process terminated",
  });
  expect(outcome.state.builds?.results[0]?.status).toBe("passed");
  expect(op.deploy).not.toHaveBeenCalled();
});
