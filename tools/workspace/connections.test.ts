import { expect, it } from "vitest";
import {
  synchronizeBindings,
  predictSynchronizedConnections,
} from "./connections.js";
const workers = {
  byPackage: new Map([
    ["api-new", "new-worker"],
    ["api-old", "old-worker"],
  ]),
  byWorker: new Map([
    ["new-worker", "api-new"],
    ["old-worker", "api-old"],
  ]),
};
it("uses declarations over stale native destinations and retains external Workers", () => {
  expect(
    synchronizeBindings(
      [
        { name: "API", worker: "old-worker" },
        { name: "NATIVE", worker: "old-worker" },
        { name: "EXT", worker: "external" },
      ],
      { API: "api-new" },
      workers,
    ),
  ).toEqual([
    { name: "API", worker: "new-worker", package: "api-new" },
    { name: "NATIVE", worker: "old-worker", package: "api-old" },
    { name: "EXT", worker: "external" },
  ]);
});
it("rejects missing native bindings and declared destinations without Workers", () => {
  expect(() => synchronizeBindings([], { API: "api-new" }, workers)).toThrow(
    "Missing native binding",
  );
  expect(() =>
    synchronizeBindings(
      [{ name: "API", worker: "old" }],
      { API: "missing" },
      workers,
    ),
  ).toThrow("No Worker");
});
it("predicts matching profile overrides without creating undeclared entries", () => {
  const settings = {
    bindings: [{ name: "API", worker: "old-worker" }],
    profiles: {
      staging: [
        { name: "API", worker: "old-worker" },
        { name: "EXT", worker: "external" },
      ],
      release: [],
    },
    declarations: { bindings: { API: "api-new" }, urls: {} },
  };
  const result = predictSynchronizedConnections(settings, workers);
  expect(result.profiles.staging).toEqual([
    { name: "API", worker: "new-worker", package: "api-new" },
    { name: "EXT", worker: "external" },
  ]);
  expect(result.profiles.release).toEqual([]);
  expect(settings.bindings[0]!.worker).toBe("old-worker");
});
