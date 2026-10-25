/** Service identity, with no dependency on a configuration or API response format. */
export type BindingConnection = {
  name: string;
  worker: string;
  package?: string;
};
export type ConnectionDeclarations = {
  bindings: Record<string, string>;
  urls: Record<string, string>;
};
export type Workers = {
  byPackage: ReadonlyMap<string, string>;
  byWorker: ReadonlyMap<string, string>;
};
