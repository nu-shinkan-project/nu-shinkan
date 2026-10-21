import { expect, it, vi, afterEach } from "vitest";
import { listDatabases, matchDatabase } from "./cloudflare.js";
afterEach(() => vi.unstubAllGlobals());
it("matches exact names and rejects missing or ambiguous resources", () => {
  const data = [
    { name: "data-staging", uuid: "staging" },
    { name: "data-release", uuid: "release" },
  ];
  expect(matchDatabase("data-staging", data)).toEqual({
    status: "matched",
    id: "staging",
  });
  expect(matchDatabase("data", data)).toMatchObject({ status: "missing" });
  expect(matchDatabase("data-staging", [...data, data[0]!])).toMatchObject({
    status: "ambiguous",
  });
});
it("collects all D1 pages before resolving names", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ name: "a", uuid: "a" }],
          result_info: { page: 1, per_page: 1, total_count: 2 },
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ name: "b-staging", uuid: "b" }],
          result_info: { page: 2, per_page: 1, total_count: 2 },
        }),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  const result = await listDatabases({ account: "account", token: "token" });
  expect(result).toMatchObject({
    status: "listed",
    databases: [{ name: "a" }, { name: "b-staging" }],
  });
  expect(fetcher.mock.calls[1]![0]).toContain("page=2");
});
it.each([
  new Response("", { status: 403 }),
  new Response("bad"),
  new Response(JSON.stringify({ success: true, result: [{}] })),
])("returns expected API errors as values", async (response) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  expect(await listDatabases({ account: "a", token: "t" })).toMatchObject({
    status: "list-failed",
  });
});

it("rejects incomplete pagination instead of silently accepting a partial list", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: [],
          result_info: { page: 1, per_page: 100, total_count: 101 },
        }),
      ),
    ),
  );
  expect(await listDatabases({ account: "a", token: "t" })).toMatchObject({
    status: "list-failed",
  });
});
