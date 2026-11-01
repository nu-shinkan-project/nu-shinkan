import { findWorkspaceRoot } from "../workspace/root.js";
import { startAutoSync } from "./auto-sync.inner.js";

try {
  startAutoSync(findWorkspaceRoot());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
