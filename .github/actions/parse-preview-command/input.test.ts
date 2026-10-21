import { expect, it } from "vitest";
import { parsePreviewCommand } from "./input.mjs";

it("parses only exact package picks", () => {
  expect(
    parsePreviewCommand("/preview @repo/api\n@repo/web @repo/api"),
  ).toEqual(["@repo/api", "@repo/web"]);
  for (const body of [
    "/preview",
    "/previewed api",
    "/preview *",
    "/preview ...api",
    "/preview --filter=api",
  ]) {
    expect(() => parsePreviewCommand(body)).toThrow();
  }
});
