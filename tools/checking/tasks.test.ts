import { expect, it } from "vitest";
import { collectTaskResults } from "./tasks.js";
import type { Package } from "../workspace/types.js";
const packages: Package[] = [
  { name: "a", path: "apps/a", scripts: { test: "vitest" } },
  { name: "b", path: "apps/b", scripts: {} },
];
it("distinguishes cached success, failure, execution error and unregistered checks", () => {
  expect(
    collectTaskResults(
      { tasks: [{ package: "a", task: "test", cache: { status: "HIT" } }] },
      packages,
      "test",
    ),
  ).toMatchObject([
    { status: "passed", cached: true },
    { status: "no-script" },
  ]);
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
