import { afterEach, expect, it, vi } from "vitest";

vi.mock("../workspace/packages.js", () => ({ listPackages: vi.fn() }));
import { testExports } from "./auto-sync.inner.js";

const { IssueSerializer, ConfigChangeDetector, Throttler } = testExports;

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("coalesces requests during a running sync into one subsequent sync", async () => {
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  let startSecond!: () => void;
  const firstTask = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  const secondTask = new Promise<void>((resolve) => {
    finishSecond = resolve;
  });
  const secondStarted = new Promise<void>((resolve) => {
    startSecond = resolve;
  });
  const task = vi
    .fn(() => Promise.resolve())
    .mockImplementationOnce(() => firstTask)
    .mockImplementationOnce(() => {
      startSecond();
      return secondTask;
    });
  const serializer = new IssueSerializer(task);
  const completed = serializer.issue();
  serializer.issue();
  serializer.issue();
  expect(task).toHaveBeenCalledTimes(1);

  finishFirst();
  await secondStarted;
  expect(task).toHaveBeenCalledTimes(2);
  expect(serializer.processing).toBe(true);
  finishSecond();
  await completed;
  expect(task).toHaveBeenCalledTimes(2);
  expect(serializer.processing).toBe(false);
});

it("runs a burst immediately and once more after the events settle", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
  const task = vi.fn();
  const throttler = new Throttler(task);
  throttler.issue();
  vi.advanceTimersByTime(100);
  throttler.issue();
  vi.advanceTimersByTime(100);
  throttler.issue();
  expect(task).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(499);
  expect(task).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(task).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(1000);
  expect(task).toHaveBeenCalledTimes(2);
});

it("issues sync only for a new configuration hash", async () => {
  const task = vi.fn();
  const detector = new ConfigChangeDetector("/repo", task);
  vi.spyOn(detector, "calcHash")
    .mockResolvedValueOnce("A")
    .mockResolvedValueOnce("A")
    .mockResolvedValueOnce("B");
  await detector.issueIfChanged();
  await detector.issueIfChanged();
  expect(task).toHaveBeenCalledTimes(1);
  await detector.issueIfChanged();
  expect(task).toHaveBeenCalledTimes(2);
});

it("handles a hash failure and can detect a change on a later event", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const task = vi.fn();
  const detector = new ConfigChangeDetector("/repo", task);
  vi.spyOn(detector, "calcHash")
    .mockRejectedValueOnce(new Error("configuration unavailable"))
    .mockResolvedValueOnce("A");
  await expect(detector.issueIfChanged()).resolves.toBeUndefined();
  expect(task).not.toHaveBeenCalled();
  await detector.issueIfChanged();
  expect(task).toHaveBeenCalledTimes(1);
});

it("does not reissue an unchanged configuration after the task fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const task = vi.fn(() => {
    throw new Error("sync failed");
  });
  const detector = new ConfigChangeDetector("/repo", task);
  vi.spyOn(detector, "calcHash").mockResolvedValue("A");
  await detector.issueIfChanged();
  await detector.issueIfChanged();
  expect(task).toHaveBeenCalledTimes(1);
});
