import { readSettings } from "./settings.js";
import { generateDotenv } from "./dotenv.js";
import { generateWranglerJsonc } from "./wrangler.js";
import type { Context } from "./context.js";
export function generate(
  packagePath: string,
  context: Context,
  databases: ReadonlyMap<string, string>,
): void {
  const settings = readSettings(context, packagePath);
  generateDotenv(settings, context, packagePath);
  generateWranglerJsonc(settings, context, packagePath, databases);
}

export type { Database } from "./resources.js";
