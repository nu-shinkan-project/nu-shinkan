import { Dotenv } from "./dotenv.js";
import { WranglerJsonc } from "./wrangler.jsonc.js";

export function syncPackageLocal(
  local: Record<string, string | null>,
  dryRun = false,
  packagePath?: string,
): void {
  const dotenv = new Dotenv(packagePath);
  const wranglerJsonc = new WranglerJsonc(packagePath);
  // 共有設定のnullは消費せず、存在するネイティブ設定にだけ反映する。
  if (dotenv.exists()) {
    dotenv.updateVariables(local);
    dotenv.save(dryRun);
  }
  if (wranglerJsonc.exists()) {
    wranglerJsonc.update({ vars: local });
    wranglerJsonc.save(dryRun);
  }
}
