import { expect, it } from "vitest";
import { aggregateDeployment } from "./tasks.js";
it("aggregates partial deployment without losing successful packages", () => {
  expect(
    aggregateDeployment([
      { package: "a", status: "deployed" },
      { package: "b", status: "deploy-failed" },
    ]).status,
  ).toBe("partial-failure");
  expect(
    aggregateDeployment([{ package: "a", status: "deploy-failed" }]).status,
  ).toBe("failure");
});
