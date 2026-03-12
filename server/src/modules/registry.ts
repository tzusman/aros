import * as fs from "node:fs";
import * as path from "node:path";

// ---- Types ----

export interface RegistrySource {
  name: string;
  url: string;
  branch: string;
}

export interface Registry {
  sources: RegistrySource[];
}

export interface LockEntry {
  source: string;
  path: string;
  sha: string;
  version: string;
  lockedAt: string;
}

export interface Lockfile {
  version: number;
  locked: Record<string, LockEntry>;
}

// ---- Registry ----

export function readRegistry(arosDir: string): Registry {
  return JSON.parse(fs.readFileSync(path.join(arosDir, "registry.json"), "utf-8"));
}

export function writeRegistry(arosDir: string, registry: Registry): void {
  fs.writeFileSync(path.join(arosDir, "registry.json"), JSON.stringify(registry, null, 2));
}

export function addSource(arosDir: string, source: RegistrySource): void {
  const registry = readRegistry(arosDir);
  if (registry.sources.some((s) => s.name === source.name)) {
    throw new Error(`Source "${source.name}" already exists`);
  }
  registry.sources.push(source);
  writeRegistry(arosDir, registry);
}

export function removeSource(arosDir: string, name: string): void {
  const registry = readRegistry(arosDir);
  registry.sources = registry.sources.filter((s) => s.name !== name);
  writeRegistry(arosDir, registry);
}

// ---- Lockfile ----

export function readLockfile(arosDir: string): Lockfile {
  return JSON.parse(fs.readFileSync(path.join(arosDir, "lock.json"), "utf-8"));
}

export function writeLockfile(arosDir: string, lockfile: Lockfile): void {
  fs.writeFileSync(path.join(arosDir, "lock.json"), JSON.stringify(lockfile, null, 2));
}

export function lockModule(arosDir: string, key: string, entry: LockEntry): void {
  const lockfile = readLockfile(arosDir);
  lockfile.locked[key] = entry;
  writeLockfile(arosDir, lockfile);
}

export function unlockModule(arosDir: string, key: string): void {
  const lockfile = readLockfile(arosDir);
  delete lockfile.locked[key];
  writeLockfile(arosDir, lockfile);
}
