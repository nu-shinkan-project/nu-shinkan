import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { WranglerJsonc } from "./wrangler.jsonc.js";
it("updates only destination fields and retains comments in base and profile bindings", () => {
  const root = mkdtempSync(join(tmpdir(), "sync-binding-"));
  try {
    const path = join(root, "wrangler.jsonc");
    writeFileSync(
      path,
      `{
      "name": "web",
      "vars": {"KEEP": "native"},
      "services": [
        // base comment
        {"binding":"API", "service":"old", "entrypoint":"Api"},
        {"binding":"EXT", "service":"external"}
      ],
      "env": {"staging": {"services": [
        // profile comment
        {"binding":"API", "service":"old", "environment":"keep"}
      ]}}
    }`,
    );
    const document = new WranglerJsonc(root);
    document.synchronizeServices([{ name: "API", worker: "new" }]);
    document.save();
    const saved = readFileSync(path, "utf8");
    expect(saved).toContain("// base comment");
    expect(saved).toContain("// profile comment");
    expect(document.data.services).toEqual([
      { binding: "API", service: "new", entrypoint: "Api" },
      { binding: "EXT", service: "external" },
    ]);
    expect(document.data.env?.staging?.services).toEqual([
      { binding: "API", service: "new", environment: "keep" },
    ]);
    expect(document.data.env?.release).toBeUndefined();
    expect(document.data.vars).toEqual({ KEEP: "native" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
