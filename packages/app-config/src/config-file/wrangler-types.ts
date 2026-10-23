export type D1Database = {
  binding: string;
  database_name: string;
  database_id?: string;
  [key: string]: unknown;
};

export type R2Bucket = {
  binding: string;
  bucket_name: string;
  [key: string]: unknown;
};

export type WranglerConfig = {
  name: string;
  vars?: Record<string, string>;
  env?: Record<string, Partial<WranglerConfig>>;
  services?: { binding: string; service: string; [key: string]: unknown }[];
  d1_databases?: D1Database[];
  r2_buckets?: R2Bucket[];
  [key: string]: unknown;
};

export type WranglerPatch = Partial<
  Pick<WranglerConfig, "name" | "env" | "services">
> & {
  vars?: Record<string, string | null>;
  [key: string]: unknown;
};
