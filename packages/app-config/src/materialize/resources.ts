import type { WranglerConfig } from "../config-file/wrangler.jsonc.js";
export type Database = {
  binding: string;
  database_name: string;
  database_id?: string;
  [key: string]: unknown;
};
export type Bucket = {
  binding: string;
  bucket_name: string;
  [key: string]: unknown;
};
export function resourcePatch(
  config: WranglerConfig,
  profile: "staging" | "release",
  databases: ReadonlyMap<string, string>,
): Partial<WranglerConfig> {
  const patch: Partial<WranglerConfig> = {};
  if (config.d1_databases !== undefined)
    patch.d1_databases = (config.d1_databases as Database[]).map((database) => {
      if (typeof database.database_name !== "string" || !database.database_name)
        throw new Error("D1 database_name is required");
      const name = `${database.database_name}-${profile}`;
      const id = databases.get(name);
      if (!id) throw new Error(`Unresolved D1 database: ${name}`);
      return { ...database, database_name: name, database_id: id };
    });
  if (config.r2_buckets !== undefined)
    patch.r2_buckets = (config.r2_buckets as Bucket[]).map((bucket) => {
      if (typeof bucket.bucket_name !== "string" || !bucket.bucket_name)
        throw new Error("R2 bucket_name is required");
      return { ...bucket, bucket_name: `${bucket.bucket_name}-${profile}` };
    });
  return patch;
}
