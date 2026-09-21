// Deterministic tests for the source-fingerprint freeze/check contract (lesson 2/6).
// Exercises the real bash script against the real repo — no product source is
// mutated; drift is simulated by tampering with a frozen snapshot file.
import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const smithersRoot = resolve(import.meta.dir, "..");
const repoRoot = resolve(smithersRoot, "..");
const script = join(smithersRoot, "scripts", "source-fingerprint.sh");

function run(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("bash", [script, ...args], { cwd: smithersRoot, encoding: "utf8", timeout: 60_000 });
    return { stdout, status: 0 };
  } catch (e: any) {
    return { stdout: String(e.stdout ?? ""), status: typeof e.status === "number" ? e.status : 1 };
  }
}

describe("source-fingerprint.sh", () => {
  test("compute is deterministic across back-to-back runs", () => {
    const a = run(["compute"]);
    const b = run(["compute"]);
    expect(a.status).toBe(0);
    expect(a.stdout.trim()).toBe(b.stdout.trim());
    expect(a.stdout.trim()).toMatch(/^[0-9a-f]+-[0-9a-f]{64}$/); // <rev>-<sha256>
  }, 60_000);

  test("freeze records the current fingerprint and check passes against it", () => {
    const dir = mkdtempSync(join(tmpdir(), "t6-fp-"));
    const snap = join(dir, "source-fingerprint.json");
    const frozen = run(["freeze", snap]);
    expect(frozen.status).toBe(0);
    const snapshot = JSON.parse(readFileSync(snap, "utf8"));
    const current = run(["compute"]).stdout.trim();
    expect(snapshot.fingerprint).toBe(current);
    expect(snapshot.rev).toBeTruthy();

    const checked = run(["check", snap]);
    expect(checked.status).toBe(0);
  }, 60_000);

  test("check FAILS closed when the frozen fingerprint drifts", () => {
    const dir = mkdtempSync(join(tmpdir(), "t6-fp-"));
    const snap = join(dir, "source-fingerprint.json");
    run(["freeze", snap]);
    const snapshot = JSON.parse(readFileSync(snap, "utf8"));
    snapshot.fingerprint = "deadbeef-" + "0".repeat(64); // simulate source drift
    writeFileSync(snap, JSON.stringify(snapshot));

    const checked = run(["check", snap]);
    expect(checked.status).toBe(1);
  });

  test("check errors on a missing snapshot", () => {
    const checked = run(["check", join(tmpdir(), "does-not-exist-t6.json")]);
    expect(checked.status).toBe(2);
  });

  test("scope covers served-app source + config, not just poa-app/src (lesson 7)", () => {
    const listed = run(["files"]);
    expect(listed.status).toBe(0);
    const files = listed.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    // src is still covered...
    expect(files.some((f) => f.startsWith("poa-app/src/"))).toBe(true);
    // ...plus the config + assets that actually shape what the dev server serves.
    expect(files).toContain("poa-app/next.config.mjs");
    expect(files).toContain("poa-app/jsconfig.json");
    expect(files).toContain("poa-app/package.json");
    expect(files.some((f) => f.startsWith("poa-app/abi/"))).toBe(true);
    expect(files.some((f) => f.startsWith("poa-app/public/"))).toBe(true);
    // ...while ignored/generated/runtime artifacts stay OUT.
    expect(files.some((f) => f.includes("/.next/") || f.includes("/node_modules/"))).toBe(false);
  });

  test("$SOURCE_FP_SCOPE overrides the scope (space-separated)", () => {
    const scoped = spawnScoped(["files"], "poa-app/package.json");
    expect(scoped.status).toBe(0);
    const files = scoped.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(files).toEqual(["poa-app/package.json"]);
  });
});

describe("workspace toolchain scripts", () => {
  const scripts = [
    join(repoRoot, "scripts", "with-node22.sh"),
    join(repoRoot, ".conductor", "setup.sh"),
    join(smithersRoot, "scripts", "smithers-local.sh"),
    join(smithersRoot, "scripts", "run-poa.sh"),
    join(smithersRoot, "scripts", "preflight.sh"),
    join(smithersRoot, "scripts", "ensure-dev.sh"),
  ];

  test("all shell entry points pass bash syntax validation", () => {
    for (const shellScript of scripts) {
      expect(() => execFileSync("bash", ["-n", shellScript], { cwd: repoRoot })).not.toThrow();
    }
  });

  test("shared wrapper selects exact Node 22.23.2", () => {
    const out = execFileSync("bash", [join(repoRoot, "scripts", "with-node22.sh"), "node", "--version"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(out.trim()).toBe("v22.23.2");
  });

  test("preflight validates installed app and pinned Smithers dependencies", () => {
    const out = execFileSync("bash", [join(smithersRoot, "scripts", "preflight.sh")], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(out).toContain("Node 22.23.2");
    expect(out).toContain("Smithers 0.32.0");
    expect(out).toContain("preflight: workspace toolchain and dependencies are ready");
  });

  test("Conductor uses the shared setup and no legacy conductor.json remains", () => {
    const settings = readFileSync(join(repoRoot, ".conductor", "settings.toml"), "utf8");
    expect(settings).toContain('setup = "bash .conductor/setup.sh"');
    expect(settings).toContain('run_mode = "concurrent"');
    expect(existsSync(join(repoRoot, "conductor.json"))).toBe(false);
  });

  test("Smithers and its Effect compatibility dependency are exactly pinned", () => {
    const packageJson = JSON.parse(readFileSync(join(smithersRoot, "package.json"), "utf8"));
    expect(packageJson.dependencies["smithers-orchestrator"]).toBe("0.32.0");
    expect(packageJson.overrides["@effect/platform-node-shared"]).toBe("4.0.0-beta.102");
  });
});

function spawnScoped(args: string[], scope: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("bash", [script, ...args], {
      cwd: smithersRoot,
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, SOURCE_FP_SCOPE: scope },
    });
    return { stdout, status: 0 };
  } catch (e: any) {
    return { stdout: String(e.stdout ?? ""), status: typeof e.status === "number" ? e.status : 1 };
  }
}
