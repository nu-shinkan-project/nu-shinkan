import { afterEach, expect, it, vi } from "vitest";
vi.mock("../command.js", () => ({ command: vi.fn() }));
import { command } from "../command.js";
import { deploy } from "./tasks.js";
const run = vi.mocked(command);
afterEach(() => {
  vi.resetAllMocks();
});
it("deploys serially in planned order and continues after failure", async () => {
  let active = 0;
  run.mockImplementation(async (_program, _args, path) => {
    active++;
    expect(active).toBe(1);
    await Promise.resolve();
    active--;
    return {
      status: "completed",
      code: path.endsWith("/api") ? 1 : 0,
      stdout: "https://web-preview-1.example.workers.dev",
      stderr: path.endsWith("/api")
        ? "Service Binding target missing: backend-preview-1"
        : "",
    };
  });
  const result = await deploy("/repo", [
    { name: "api", path: "apps/api", scripts: {} },
    { name: "web", path: "apps/web", scripts: {} },
  ]);
  expect(result.status).toBe("partial-failure");
  expect(result.results).toMatchObject([
    {
      package: "api",
      status: "deploy-failed",
      reason: expect.stringContaining(
        "Service Binding target missing: backend-preview-1",
      ),
    },
    {
      package: "web",
      status: "deployed",
      url: "https://web-preview-1.example.workers.dev",
    },
  ]);
});
