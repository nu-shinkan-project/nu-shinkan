import { afterEach, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
vi.mock("@repo/app-config/wrangler", () => ({
  WranglerJsonc: class {
    name = "test-api";
  },
}));
import { deletePreviewWorker } from "./delete-preview-worker.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(execFileSync).mockReset();
});
it.each(["", "-1", "0", "1.5", "abc", "9007199254740992"])(
  "rejects unsafe PR number %s without invoking Wrangler",
  async (value) => {
    vi.stubEnv("PR_NUMBER", value);
    await expect(deletePreviewWorker()).rejects.toThrow("positive integer");
    expect(execFileSync).not.toHaveBeenCalled();
  },
);
it("returns success after a transient failure and deletes only this PR's Worker", async () => {
  vi.stubEnv("PR_NUMBER", "12");
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(execFileSync)
    .mockImplementationOnce(() => {
      throw Error("network");
    })
    .mockReturnValue("");
  const operation = deletePreviewWorker();
  await vi.runAllTimersAsync();
  await expect(operation).resolves.toBeUndefined();
  expect(execFileSync).toHaveBeenCalledTimes(2);
  expect(execFileSync).toHaveBeenLastCalledWith(
    "pnpm",
    ["exec", "wrangler", "delete", "test-api-preview-pr-12", "--force"],
    expect.any(Object),
  );
});
it.each([10007, 10090])(
  "treats Wrangler missing-resource code %s as successful cleanup",
  async (code) => {
    vi.stubEnv("PR_NUMBER", "12");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(execFileSync).mockImplementation(() => {
      throw Error(`[code: ${code}]`);
    });
    await expect(deletePreviewWorker()).resolves.toBeUndefined();
    expect(execFileSync).toHaveBeenCalledTimes(1);
  },
);
it("surfaces a persistent failure after bounded retries", async () => {
  vi.stubEnv("PR_NUMBER", "12");
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(execFileSync).mockImplementation(() => {
    throw Error("unauthorized");
  });
  const assertion = expect(deletePreviewWorker()).rejects.toThrow(
    "unauthorized",
  );
  await vi.runAllTimersAsync();
  await assertion;
  expect(execFileSync).toHaveBeenCalledTimes(3);
});
