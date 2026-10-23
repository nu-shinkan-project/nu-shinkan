import { expect, it } from "vitest";
import { parseInventory, selectPackages } from "./packages.js";

const packages = [
  { name: "@repo/api", path: "apps/api" },
  { name: "@repo/web", path: "apps/web" },
];

it("distinguishes all workspaces from an explicit empty selection and deduplicates exact names", () => {
  expect(selectPackages(packages)).toEqual(packages);
  expect(selectPackages(packages, [])).toEqual([]);
  expect(
    selectPackages(packages, ["@repo/web", "@repo/api", "@repo/web"]),
  ).toEqual(packages);
  expect(() =>
    selectPackages(packages, ["@repo/api", "missing", "other"]),
  ).toThrow("Unknown packages: missing, other");
  expect(() => selectPackages(packages, ["@repo/*"])).toThrow(
    "Unknown packages",
  );
});

it.each([
  { packages: { items: [...packages, packages[0]] } },
  { packages: { items: [{ name: "api", path: "../outside" }] } },
  { packages: { items: [{ name: "api", path: "/outside" }] } },
  { packages: { items: [{ name: "", path: "apps/api" }] } },
  { packages: {} },
])("rejects ambiguous or invalid workspace inventory", (value) => {
  expect(() => parseInventory(value)).toThrow();
});
