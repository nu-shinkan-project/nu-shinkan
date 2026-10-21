export function parsePreviewCommand(body) {
  if (typeof body !== "string" || !/^\/preview(?:\s|$)/.test(body))
    throw new Error("Usage: /preview <package-name> ...");
  const packages = [...new Set(body.trim().split(/\s+/).slice(1))];
  if (
    !packages.length ||
    packages.some(
      (name) => !/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(name),
    )
  )
    throw new Error(
      "Usage: /preview <exact-package-name> ... (filters are not accepted)",
    );
  return packages;
}
