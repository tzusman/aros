import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { execSync, execFileSync } from "node:child_process";
import { Command } from "commander";
import { addModule } from "@aros/server/modules/add.js";
import {
  readLockfile,
  readRegistry,
  unlockModule,
} from "@aros/server/modules/registry.js";
import { fetchModuleFromGit, getLatestSha } from "@aros/server/modules/git-fetch.js";
import { compileCheckModule } from "@aros/server/modules/compile.js";

export function moduleCommands(program: Command) {
  const mod = program.command("module").description("Manage review modules");

  mod
    .command("add <name>")
    .description("Add a module (e.g., checks/word-count, policies/blog-post)")
    .option("--source <source>", "Fetch from specific source")
    .action(async (name: string, opts: { source?: string }) => {
      const projectDir = process.cwd();
      console.log(`Adding ${name}...`);
      await addModule(projectDir, name, { source: opts.source });
      console.log(`✓ ${name} installed and locked`);
    });

  mod
    .command("remove <name>")
    .description("Remove an installed module")
    .action((name: string) => {
      const arosDir = path.join(process.cwd(), ".aros");
      const lock = readLockfile(arosDir);

      // Warn if any policies depend on this module
      for (const [key, _entry] of Object.entries(lock.locked)) {
        if (!key.startsWith("policies/")) continue;
        const policyManifestPath = path.join(arosDir, "modules", key, "manifest.json");
        if (!fs.existsSync(policyManifestPath)) continue;
        const policyManifest = JSON.parse(fs.readFileSync(policyManifestPath, "utf-8"));
        const allDeps = [
          ...(policyManifest.requires?.checks ?? []).map((c: string) => `checks/${c}`),
          ...(policyManifest.requires?.criteria ?? []).map((c: string) => `criteria/${c}`),
        ];
        if (allDeps.includes(name)) {
          console.warn(`⚠ Warning: policy "${key}" depends on "${name}"`);
        }
      }

      const modDir = path.join(arosDir, "modules", name);
      if (fs.existsSync(modDir)) {
        fs.rmSync(modDir, { recursive: true, force: true });
      }
      unlockModule(arosDir, name);
      console.log(`✓ ${name} removed`);
    });

  mod
    .command("list")
    .description("List installed modules")
    .action(() => {
      const arosDir = path.join(process.cwd(), ".aros");
      const lock = readLockfile(arosDir);
      const entries = Object.entries(lock.locked);
      if (entries.length === 0) {
        console.log("No modules installed. Run `aros module add <name>` to install.");
        return;
      }
      for (const [key, entry] of entries) {
        console.log(`  ${key}  v${entry.version}  (${entry.source} @ ${entry.sha.slice(0, 7)})`);
      }
    });

  mod
    .command("sync")
    .description("Fetch all modules from lockfile")
    .action(async () => {
      const projectDir = process.cwd();
      const arosDir = path.join(projectDir, ".aros");
      const lock = readLockfile(arosDir);
      const registry = readRegistry(arosDir);

      const entries = Object.entries(lock.locked);
      console.log(`Syncing ${entries.length} modules...`);

      for (const [key, entry] of entries) {
        const source = registry.sources.find((s) => s.name === entry.source);
        if (!source) {
          console.log(`  ✗ ${key} — source "${entry.source}" not configured`);
          continue;
        }
        const destDir = path.join(arosDir, "modules", key);
        if (fs.existsSync(destDir)) {
          fs.rmSync(destDir, { recursive: true, force: true });
        }
        await fetchModuleFromGit(source.url, entry.path, entry.sha, destDir);

        // Compile if it's a check module
        if (key.startsWith("checks/")) {
          compileCheckModule(destDir);
        }
        console.log(`  ✓ ${key} @ ${entry.sha.slice(0, 7)}`);
      }
      console.log("Done.");
    });

  mod
    .command("check")
    .description("Validate module dependencies")
    .action(() => {
      const arosDir = path.join(process.cwd(), ".aros");
      const modulesDir = path.join(arosDir, "modules");
      const checksDir = path.join(modulesDir, "checks");

      if (!fs.existsSync(checksDir)) {
        console.log("No check modules installed.");
        return;
      }

      for (const name of fs.readdirSync(checksDir)) {
        const manifestPath = path.join(checksDir, name, "manifest.json");
        if (!fs.existsSync(manifestPath)) continue;
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const deps = manifest.dependencies ?? {};

        let allGood = true;
        for (const bin of deps.binaries ?? []) {
          try {
            execFileSync("which", [bin.name], { stdio: "pipe" });
            console.log(`  ✓ ${name}: ${bin.name} found`);
          } catch {
            console.log(`  ✗ ${name}: ${bin.name} not found — install with: ${bin.install?.macos ?? bin.install?.script ?? "unknown"}`);
            allGood = false;
          }
        }
        for (const npmDep of deps.npm ?? []) {
          try {
            execFileSync("npm", ["ls", npmDep.name], { stdio: "pipe" });
            console.log(`  ✓ ${name}: npm ${npmDep.name} found`);
          } catch {
            console.log(`  ✗ ${name}: npm ${npmDep.name} not found${npmDep.minVersion ? ` (requires >=${npmDep.minVersion})` : ""}`);
            allGood = false;
          }
        }
        for (const env of deps.env ?? []) {
          if (process.env[env.name]) {
            console.log(`  ✓ ${name}: ${env.name} set`);
          } else if (env.required) {
            console.log(`  ✗ ${name}: ${env.name} not set (required)`);
            allGood = false;
          } else {
            console.log(`  ⚠ ${name}: ${env.name} not set (optional)`);
          }
        }
        if (allGood && (deps.binaries?.length || deps.env?.length || deps.npm?.length)) {
          console.log(`  ✓ ${name}: all dependencies satisfied`);
        }
      }
    });

  mod
    .command("update [name]")
    .description("Check for and apply module updates")
    .option("--all", "Update all modules without prompting")
    .option("--yes", "Auto-confirm (for CI)")
    .action(async (name?: string, opts?: { all?: boolean; yes?: boolean }) => {
      const projectDir = process.cwd();
      const arosDir = path.join(projectDir, ".aros");
      const lock = readLockfile(arosDir);
      const registry = readRegistry(arosDir);

      const entries = name
        ? [[name, lock.locked[name]] as const].filter(([, e]) => e)
        : Object.entries(lock.locked);

      if (entries.length === 0) {
        console.log(name ? `Module "${name}" not installed.` : "No modules installed.");
        return;
      }

      const updates: Array<{ key: string; oldSha: string; newSha: string; oldVersion: string; newVersion: string }> = [];

      for (const [key, entry] of entries) {
        const source = registry.sources.find((s) => s.name === entry.source);
        if (!source) continue;
        try {
          const latestSha = await getLatestSha(source.url, source.branch, entry.path);
          if (latestSha !== entry.sha) {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aros-update-"));
            await fetchModuleFromGit(source.url, entry.path, latestSha, tmpDir);
            const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, "manifest.json"), "utf-8"));
            fs.rmSync(tmpDir, { recursive: true, force: true });
            updates.push({ key, oldSha: entry.sha, newSha: latestSha, oldVersion: entry.version, newVersion: manifest.version ?? entry.version });
          }
        } catch {
          console.log(`  ⚠ Could not check ${key} for updates`);
        }
      }

      if (updates.length === 0) {
        console.log("All modules are up to date.");
        return;
      }

      console.log(`\nUpdates available:`);
      for (const u of updates) {
        console.log(`  ${u.key}: v${u.oldVersion} → v${u.newVersion} (${u.oldSha.slice(0, 7)} → ${u.newSha.slice(0, 7)})`);
      }

      if (!opts?.all && !opts?.yes) {
        console.log("\nRun with --all --yes to apply, or update individual modules with: aros module update <name> --yes");
        return;
      }

      for (const u of updates) {
        const destDir = path.join(arosDir, "modules", u.key);
        const source = registry.sources.find((s) => s.name === lock.locked[u.key].source)!;
        if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
        await fetchModuleFromGit(source.url, lock.locked[u.key].path, u.newSha, destDir);
        if (u.key.startsWith("checks/")) compileCheckModule(destDir);
        lock.locked[u.key] = { ...lock.locked[u.key], sha: u.newSha, version: u.newVersion, lockedAt: new Date().toISOString() };
        console.log(`  ✓ ${u.key} updated to v${u.newVersion}`);
      }
      const { writeLockfile } = await import("@aros/server/modules/registry.js");
      writeLockfile(arosDir, lock);
      console.log("Lockfile updated.");
    });

  mod
    .command("rollback <name>")
    .description("Restore a module to its previous version from lockfile git history")
    .action(async (name: string) => {
      const projectDir = process.cwd();
      const arosDir = path.join(projectDir, ".aros");
      const lock = readLockfile(arosDir);

      if (!lock.locked[name]) {
        console.error(`Module "${name}" is not installed.`);
        process.exit(1);
      }

      try {
        const lockPath = path.join(arosDir, "lock.json");
        const logOutput = execSync(
          `git log --oneline -10 -- "${lockPath}"`,
          { cwd: projectDir, encoding: "utf-8" }
        );
        const commits = logOutput.trim().split("\n").filter(Boolean);
        if (commits.length < 2) {
          console.error("No previous version found in git history.");
          process.exit(1);
        }

        const prevCommit = commits[1].split(" ")[0];
        const prevLockContent = execSync(
          `git show ${prevCommit}:.aros/lock.json`,
          { cwd: projectDir, encoding: "utf-8" }
        );
        const prevLock = JSON.parse(prevLockContent);
        const prevEntry = prevLock.locked?.[name];

        if (!prevEntry || prevEntry.sha === lock.locked[name].sha) {
          console.error(`No different previous version found for "${name}".`);
          process.exit(1);
        }

        console.log(`Rolling back ${name}: ${lock.locked[name].sha.slice(0, 7)} → ${prevEntry.sha.slice(0, 7)} (v${prevEntry.version})`);

        const registry = readRegistry(arosDir);
        const source = registry.sources.find((s) => s.name === prevEntry.source);
        if (!source) {
          console.error(`Source "${prevEntry.source}" not configured.`);
          process.exit(1);
        }

        const destDir = path.join(arosDir, "modules", name);
        if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
        await fetchModuleFromGit(source.url, prevEntry.path, prevEntry.sha, destDir);
        if (name.startsWith("checks/")) compileCheckModule(destDir);

        const { lockModule: lockMod } = await import("@aros/server/modules/registry.js");
        lockMod(arosDir, name, { ...prevEntry, lockedAt: new Date().toISOString() });
        console.log(`✓ ${name} rolled back to v${prevEntry.version}`);
      } catch (e: any) {
        console.error(`Rollback failed: ${e.message}`);
        process.exit(1);
      }
    });
}
