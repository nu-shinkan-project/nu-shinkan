import { expect, it } from "vitest";
import { collectTaskResults } from "./tasks.js";
const packages = ["a"];
it("distinguishes cached success, failure and execution errors", () => {
  expect(
    collectTaskResults(
      { tasks: [{ package: "a", task: "test", cache: { status: "HIT" } }] },
      packages,
      "test",
    ),
  ).toMatchObject([{ status: "passed", cached: true }]);
  expect(
    collectTaskResults(
      { tasks: [{ package: "a", task: "test", execution: { exitCode: 1 } }] },
      packages,
      "test",
    )[0],
  ).toMatchObject({ status: "failed" });
  expect(collectTaskResults({ tasks: [] }, packages, "test")[0]).toMatchObject({
    status: "execution-error",
  });
});

vi.mock("../command.js", () => ({ command: vi.fn() }));
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, vi } from "vitest";
import { command } from "../command.js";
import { runTurbo } from "./tasks.js";
const roots: string[] = [];
afterEach(() => {
  roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true }));
  vi.resetAllMocks();
});
it.each(["dependency", "global", "missing-summary"])(
  "preserves %s failure even if requested tasks succeeded",
  async (failure) => {
    const root = mkdtempSync(join(tmpdir(), "turbo-result-"));
    roots.push(root);
    mkdirSync(join(root, ".turbo/runs"), { recursive: true });
    vi.mocked(command).mockImplementation(async () => {
      if (failure !== "missing-summary")
        writeFileSync(
          join(root, ".turbo/runs/result.json"),
          JSON.stringify({
            tasks: [
              { package: "web", task: "build", execution: { exitCode: 0 } },
              ...(failure === "dependency"
                ? [
                    {
                      package: "shared",
                      task: "build",
                      command: "tsc",
                      execution: { exitCode: 1 },
                    },
                  ]
                : []),
            ],
          }),
        );
      return {
        status: "completed",
        code: failure === "missing-summary" ? 0 : 1,
        stdout: "",
        stderr: "",
      };
    });
    const run = await runTurbo(root, ["web"], "build");
    expect(run.status).toBe("failed");
    if (failure === "dependency")
      expect(run.results).toMatchObject([
        { package: "web", status: "passed" },
        { package: "shared", status: "failed" },
      ]);
    if (failure === "global") expect(run.results[0]?.status).toBe("passed");
    if (failure === "missing-summary")
      expect(run.results[0]?.status).toBe("execution-error");
  },
);
