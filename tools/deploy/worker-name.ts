import type { Request } from "./types.js";

export function buildWorkerName(
  name: string,
  channel: Request["channel"],
  prNumber: number,
): string {
  return `${name}-${channel === "preview" ? `preview-${prNumber}` : channel}`;
}
