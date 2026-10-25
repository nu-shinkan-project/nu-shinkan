import { expect, it } from "vitest";
import { markdown } from "./report.js";
import type { State } from "./types.js";
it("reports failed checks even without deployment targets, distinguishing membership and unexecuted tasks", () => {
  const state: State = {
    request: {
      channel: "preview",
      purpose: "review",
      profile: "staging",
      source: "diff",
      commit: "sha",
      base: null,
      prNumber: 1,
      packages: [],
    },
    planning: {
      status: "planned",
      plan: {
        initialSource: "diff",
        source: "full",
        fallback: "history",
        origins: ["a"],
        affected: ["a"],
        targets: [],
        builds: [],
        deploys: [],
        warnings: ["cycle"],
        connections: [],
      },
    },
    status: "failure",
    stopped: { phase: "checks", reason: "failed" },
    checks: {
      status: "checks-failed",
      results: [
        {
          package: "a",
          task: "test",
          status: "failed",
          cached: false,
          reason: "assertion",
        },
      ],
    },
  };
  const text = markdown(state);
  expect(text).toContain("Deploy: failure");
  expect(text).toContain("No deployment targets");
  expect(text).toContain("影響下 | failed | not run");
  expect(text).toContain("assertion");
  expect(text).toContain("Final mode: review/full");
});
