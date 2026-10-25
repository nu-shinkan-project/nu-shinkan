import { expect, it, vi } from "vitest";
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

it("uses Turbo's excluded inventory and expands dependents within the captured set", async () => {
  const { selectWithDependents } = await import("./packages.js");
  const { command } = await import("../command.js");
  const run = vi.mocked(command);
  run.mockResolvedValue({
    status: "completed",
    code: 0,
    stdout: JSON.stringify({
      packages: { items: [...packages, { name: "outside", path: "tools" }] },
    }),
    stderr: "",
  });
  const captured = packages.map((p) => ({ ...p, scripts: {} }));
  expect(
    await selectWithDependents("/repo", captured, ["@repo/api"], true),
  ).toEqual(captured);
  expect(run).toHaveBeenCalledTimes(1);
  expect(await selectWithDependents("/repo", captured, [], true)).toEqual([]);
  expect(run).toHaveBeenCalledTimes(1);
});

vi.mock("../command.js", () => ({ command: vi.fn() }));
