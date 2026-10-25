vi.mock("../workspace/packages.js", () => ({
  listPackages: vi.fn(async () => []),
  selectFilteredPackages: vi.fn(async () => []),
}));
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../command.js", () => ({ command: vi.fn() }));
vi.mock("@repo/app-config/global", () => ({ GlobalRuntimeEnvsYaml: vi.fn() }));
import { command } from "../command.js";
import { GlobalRuntimeEnvsYaml } from "@repo/app-config/global";
import { syncRepository } from "./repository.js";
afterEach(() => vi.resetAllMocks());
it.each([
  { filters: [], dryRun: false, failed: false, consumed: true },
  { filters: ["web"], dryRun: false, failed: false, consumed: false },
  { filters: [], dryRun: true, failed: false, consumed: false },
  { filters: [], dryRun: false, failed: true, consumed: false },
])(
  "consumes shared deletion directives only after complete success: %j",
  async ({ filters, dryRun, failed, consumed }) => {
    const removeNull = vi.fn(),
      save = vi.fn();
    vi.mocked(GlobalRuntimeEnvsYaml).mockImplementation(function () {
      return { removeNull, save } as unknown as GlobalRuntimeEnvsYaml;
    });
    vi.mocked(command).mockResolvedValue({
      status: "completed",
      code: failed ? 1 : 0,
      stdout: "",
      stderr: "",
    });
    const result = syncRepository("/repo", { filters, dryRun });
    if (failed) await expect(result).rejects.toThrow();
    else await result;
    expect(save).toHaveBeenCalledTimes(consumed ? 1 : 0);
  },
);
