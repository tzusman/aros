import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const exec = promisify(execFile);

const CACHE_DIR = path.join(os.homedir(), ".cache", "aros", "repos");

/**
 * Ensure we have a local clone of the repo, return the local path.
 * For local paths, returns as-is. For remote URLs, clones/fetches to cache.
 */
async function ensureLocalRepo(
  repoUrl: string,
  branch: string
): Promise<string> {
  // If it's a local directory, use directly
  if (
    fs.existsSync(path.join(repoUrl, ".git")) ||
    fs.existsSync(path.join(repoUrl, "HEAD"))
  ) {
    return repoUrl;
  }

  // Hash the URL to get a stable cache dir name
  const hash = Buffer.from(repoUrl).toString("base64url").slice(0, 32);
  const cacheDir = path.join(CACHE_DIR, hash);

  if (fs.existsSync(path.join(cacheDir, "HEAD"))) {
    // Already cloned — fetch latest
    await exec("git", ["fetch", "origin", branch], { cwd: cacheDir });
  } else {
    // Fresh clone — bare clone to save space
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    await exec("git", [
      "clone",
      "--bare",
      "--single-branch",
      "--branch",
      branch,
      repoUrl,
      cacheDir,
    ]);
  }

  return cacheDir;
}

/**
 * Check whether a local repo has an "origin" remote.
 */
async function hasOriginRemote(repoPath: string): Promise<boolean> {
  try {
    await exec("git", ["remote", "get-url", "origin"], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the latest commit SHA that touched a given path on a branch.
 */
export async function getLatestSha(
  repoUrl: string,
  branch: string,
  modulePath: string
): Promise<string> {
  const localRepo = await ensureLocalRepo(repoUrl, branch);

  // For local repos without an "origin" remote, use the branch name directly.
  // For bare clones (which have origin), use origin/<branch>.
  const hasOrigin = await hasOriginRemote(localRepo);
  const ref = hasOrigin ? `origin/${branch}` : branch;

  const { stdout } = await exec(
    "git",
    ["log", "-1", "--format=%H", ref, "--", modulePath],
    { cwd: localRepo }
  );
  const sha = stdout.trim();
  if (!sha)
    throw new Error(
      `No commits found for path "${modulePath}" on branch "${branch}" in ${repoUrl}`
    );
  return sha;
}

/**
 * Fetch a module directory from a git repo at a specific SHA.
 * Clones remote repos to a local cache, then uses git archive to extract.
 */
export async function fetchModuleFromGit(
  repoUrl: string,
  modulePath: string,
  sha: string,
  destDir: string
): Promise<void> {
  const localRepo = await ensureLocalRepo(repoUrl, "main");
  const tmpArchive = path.join(
    os.tmpdir(),
    `aros-fetch-${Date.now()}.tar`
  );
  fs.mkdirSync(destDir, { recursive: true });

  try {
    await exec(
      "git",
      ["archive", "--format=tar", "-o", tmpArchive, sha, "--", modulePath],
      { cwd: localRepo }
    );

    const depth = modulePath.split("/").length;
    await exec("tar", [
      "-xf",
      tmpArchive,
      "-C",
      destDir,
      `--strip-components=${depth}`,
    ]);
  } finally {
    if (fs.existsSync(tmpArchive)) fs.unlinkSync(tmpArchive);
  }
}
