import path from "node:path";

export function requireAbsoluteConfiguredPath(name) {
  const configured = process.env[name]?.trim();
  if (!configured) throw new Error(`${name} is not configured`);
  if (!path.isAbsolute(configured)) throw new Error(`${name} must be an absolute path`);
  return path.resolve(configured);
}
