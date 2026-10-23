import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Dotenv } from "./dotenv.js";
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

it("derives current VITE variables with compatible quoting, independent edits, and replacement", () => {
  const root = mkdtempSync(join(tmpdir(), "dotenv-derive-"));
  roots.push(root);
  const original =
    '# keep\nPRIVATE=ignored\nVITE_EMPTY=\nVITE_DOUBLE="hello world"\nVITE_SINGLE=\'hello world\'\nVITE_ESCAPED="line\\nvalue"\nVITE_RAW=hello world';
  writeFileSync(join(root, ".env.development"), original);
  writeFileSync(join(root, ".env.production"), "VITE_OLD=discard");
  const source = new Dotenv(root);
  source.updateVariables({ ADDED: "added", RAW: 'a "quote"' });
  const derived = source.derive(".env.production");
  expect(readFileSync(join(root, ".env.production"), "utf8")).toBe(
    "VITE_OLD=discard",
  );
  derived.save();
  const expected = [
    'VITE_EMPTY=""',
    'VITE_DOUBLE="hello world"',
    "VITE_SINGLE='hello world'",
    String.raw`VITE_ESCAPED="line\nvalue"`,
    String.raw`VITE_RAW="a \"quote\""`,
    'VITE_ADDED="added"',
  ].join("\n");
  expect(readFileSync(join(root, ".env.production"), "utf8")).toBe(expected);
  derived.updateVariables({ SINGLE: null, ADDED: '"updated value"' });
  derived.save();
  expect(readFileSync(join(root, ".env.production"), "utf8")).toBe(
    expected
      .replace("VITE_SINGLE='hello world'\n", "")
      .replace('VITE_ADDED="added"', 'VITE_ADDED="updated value"'),
  );
  expect(source.variables.ADDED).toBe("added");
  source.updateVariables({ ADDED: "source only" });
  expect(derived.variables.ADDED).toBe('"updated value"');
  expect(readFileSync(join(root, ".env.development"), "utf8")).toBe(original);
  const nested = derived.derive("nested/output.env");
  vi.spyOn(console, "log").mockImplementation(() => {});
  nested.save(true);
  source.save(true);
  expect(existsSync(join(root, "nested/output.env"))).toBe(false);
  expect(readFileSync(join(root, ".env.development"), "utf8")).toBe(original);
  source.save();
  expect(readFileSync(join(root, ".env.development"), "utf8")).toContain(
    "# keep\nPRIVATE=ignored",
  );
});
