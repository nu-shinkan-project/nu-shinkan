export type ApiResponse =
  | {
      status: "received";
      result: unknown;
      info?: { page?: number; per_page?: number; total_count?: number };
    }
  | { status: "api-failed"; reason: string };
export type Cloudflare = { account: string; token: string };
export async function api(
  credentials: Cloudflare,
  path: string,
  method = "GET",
): Promise<ApiResponse> {
  if (!credentials.account || !credentials.token)
    return {
      status: "api-failed",
      reason: "Cloudflare account and API token are required",
    };
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(credentials.account)}/${path}`,
      {
        method,
        headers: { Authorization: `Bearer ${credentials.token}` },
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      return {
        status: "api-failed",
        reason: `Cloudflare HTTP ${response.status}`,
      };
    const body = (await response.json()) as {
      success?: boolean;
      result?: unknown;
      result_info?: { page?: number; per_page?: number; total_count?: number };
    };
    if (body.success !== true || !Object.hasOwn(body, "result"))
      return { status: "api-failed", reason: "Invalid Cloudflare response" };
    return { status: "received", result: body.result, info: body.result_info };
  } catch {
    return {
      status: "api-failed",
      reason: "Cloudflare request or response decoding failed",
    };
  }
}
export type Database = { name: string; uuid: string };
export type Databases =
  | { status: "listed"; databases: Database[] }
  | { status: "list-failed"; reason: string };
export async function listDatabases(
  credentials: Cloudflare,
): Promise<Databases> {
  const databases: Database[] = [];
  for (let page = 1; ; page++) {
    const response = await api(
      credentials,
      `d1/database?per_page=100&page=${page}`,
    );
    if (response.status === "api-failed")
      return { status: "list-failed", reason: response.reason };
    if (
      !Array.isArray(response.result) ||
      response.result.some(
        (d) =>
          !d ||
          typeof d.name !== "string" ||
          typeof d.uuid !== "string" ||
          !d.uuid,
      )
    )
      return { status: "list-failed", reason: "Invalid D1 database list" };
    databases.push(...response.result);
    const info = response.info;
    if (info !== undefined) {
      if (
        !Number.isSafeInteger(info.page) ||
        info.page !== page ||
        !Number.isSafeInteger(info.per_page) ||
        info.per_page! <= 0 ||
        !Number.isSafeInteger(info.total_count) ||
        info.total_count! < 0
      )
        return { status: "list-failed", reason: "Invalid D1 pagination" };
      if (page * info.per_page! >= info.total_count!) break;
      if (response.result.length === 0)
        return {
          status: "list-failed",
          reason: "D1 pagination ended before total_count",
        };
    } else if (response.result.length < 100) break;
    if (page >= 10000)
      return { status: "list-failed", reason: "D1 pagination limit exceeded" };
  }
  return { status: "listed", databases };
}
export function matchDatabase(
  name: string,
  databases: Database[],
):
  | { status: "matched"; id: string }
  | { status: "missing" | "ambiguous"; name: string } {
  const matches = databases.filter((d) => d.name === name);
  if (matches.length !== 1)
    return { status: matches.length ? "ambiguous" : "missing", name };
  return { status: "matched", id: matches[0]!.uuid };
}
