import { expect, it } from "vitest";
import { parseRequest } from "./run.js";
const sha = "a".repeat(40);
it("derives purpose and profile, retaining the initial diff mode without history", () => {
  expect(
    parseRequest("update", [
      "--channel",
      "release",
      "--commit",
      sha,
      "--base",
      "0".repeat(40),
    ]).request,
  ).toMatchObject({
    purpose: "update",
    profile: "release",
    source: "diff",
    base: null,
  });
  expect(
    parseRequest("manual-pick", [
      "--channel",
      "preview",
      "--commit",
      sha,
      "--pr",
      "12",
      "--package",
      "@repo/api",
    ]).request,
  ).toMatchObject({
    purpose: "review",
    profile: "staging",
    source: "manual-pick",
    packages: ["@repo/api"],
    prNumber: 12,
  });
});
it.each([
  { args: ["--channel", "preview", "--commit", sha] },
  { args: ["--channel", "staging", "--commit", "staging"] },
])("rejects mismatched channels or moving commit references", ({ args }) =>
  expect(() => parseRequest("update", args)).toThrow(),
);
it("rejects nonexact package selectors and invalid PR numbers", () => {
  expect(() =>
    parseRequest("manual-pick", [
      "--channel",
      "preview",
      "--commit",
      sha,
      "--pr",
      "1",
      "--package",
      "...api",
    ]),
  ).toThrow();
  expect(() =>
    parseRequest("review", [
      "--channel",
      "preview",
      "--commit",
      sha,
      "--base",
      sha,
      "--pr",
      "0",
    ]),
  ).toThrow();
});
