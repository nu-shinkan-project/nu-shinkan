import { expect, it, vi, afterEach } from "vitest";
import {
  cleanup,
  selectPreviewWorkers,
  cleanupMarkdown,
} from "./cleanup-operations.js";
afterEach(() => vi.unstubAllGlobals());
const credentials = { account: "account", token: "token" };
it("selects every matching deployed Worker, including names absent from the source", () => {
  expect(
    selectPreviewWorkers(
      [
        "deleted-app-preview-12",
        "renamed-app-preview-12",
        "legacy_name-preview-12",
        "api-preview-123",
        "api-preview-pr-12",
        "api-staging",
        "api-release",
      ],
      12,
    ),
  ).toEqual([
    "deleted-app-preview-12",
    "legacy_name-preview-12",
    "renamed-app-preview-12",
  ]);
});
it("deletes serially, continues after failure and aggregates partial results", async () => {
  let active = 0;
  const fetcher = vi.fn().mockImplementation(async (_url, options) => {
    active++;
    expect(active).toBe(1);
    await Promise.resolve();
    active--;
    if (options.method === "GET")
      return new Response(
        JSON.stringify({
          success: true,
          result: [
            { id: "a-preview-12" },
            { id: "b-preview-12" },
            { id: "staging-worker" },
          ],
        }),
      );
    return _url.includes("a-preview-12")
      ? new Response("", { status: 503 })
      : new Response(JSON.stringify({ success: true, result: null }));
  });
  vi.stubGlobal("fetch", fetcher);
  const result = await cleanup(12, credentials);
  expect(result).toMatchObject({
    status: "cleaned",
    outcome: "partial-failure",
    results: [
      { worker: "a-preview-12", status: "delete-failed" },
      { worker: "b-preview-12", status: "deleted" },
    ],
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(cleanupMarkdown(result, 12)).toContain("partial-failure");
});
it.each([{ workers: [] }, { workers: [{ id: "api-staging" }] }])(
  "succeeds without deleting when no suffix matches",
  async ({ workers }) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, result: workers })),
      );
    vi.stubGlobal("fetch", fetcher);
    expect(await cleanup(12, credentials)).toMatchObject({
      status: "cleaned",
      outcome: "success",
      targets: [],
      results: [],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each([
  new Response("", { status: 403 }),
  new Response(JSON.stringify({ success: true, result: [{}] })),
])("stops before deletion if listing fails", async (response) => {
  const fetcher = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetcher);
  expect(await cleanup(12, credentials)).toMatchObject({
    status: "list-failed",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects invalid input without any external request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await cleanup(0, credentials)).toMatchObject({
    status: "invalid-request",
  });
  expect(fetcher).not.toHaveBeenCalled();
});
