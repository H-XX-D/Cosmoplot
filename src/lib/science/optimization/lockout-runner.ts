import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { LockoutProblemPacket, LockoutSolvePacket } from "@/lib/science/optimization/target-plan";

const DEFAULT_LOCKOUT_ROOT = "/Users/hendrixx./Desktop/lockout";
const RUN_TIMEOUT_MS = 15_000;

function lockoutRoot() {
  return process.env.LOCKOUT_ROOT || DEFAULT_LOCKOUT_ROOT;
}

function pythonCommand() {
  return process.env.LOCKOUT_PYTHON || "python3";
}

const PYTHON_SOLVER = `
import json
import os
import sys

from lockout import CpuBackend, Problem, SolveConfig, solve

payload = json.load(sys.stdin)
problem = payload["problem"]
config = payload.get("config", {})

p = Problem(
    n=int(problem["n"]),
    edges=[(int(a), int(b), float(w)) for a, b, w in problem["edges"]],
)

cfg = SolveConfig(
    search=str(config.get("search", "anneal")),
    shots=int(config.get("shots", 48)),
    sweeps=int(config.get("sweeps", 900)),
    seed=int(config.get("seed", 73)),
)

result = solve(p, cfg, backend=CpuBackend())

print(json.dumps({
    "assignment": result.assignment.astype(int).tolist(),
    "bestCut": float(result.best_cut),
    "wallMs": float(result.wall_ms),
    "backend": result.backend,
    "search": cfg.search,
    "shots": cfg.shots,
    "sweeps": cfg.sweeps,
    "seed": cfg.seed,
}))
`;

export async function runLockout(packet: LockoutProblemPacket): Promise<LockoutSolvePacket> {
  const root = lockoutRoot();
  const sourceRoot = path.join(root, "src");
  if (!existsSync(sourceRoot)) {
    throw new Error(`Lockout source path not found: ${sourceRoot}`);
  }

  const payload = JSON.stringify({
    problem: packet.problem,
    config: packet.config,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(pythonCommand(), ["-c", PYTHON_SOLVER], {
      cwd: root,
      env: {
        ...process.env,
        PYTHONPATH: [sourceRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Lockout solve exceeded ${RUN_TIMEOUT_MS} ms`));
    }, RUN_TIMEOUT_MS);
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Lockout process exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as Omit<LockoutSolvePacket, "engineName" | "enginePath" | "fallback">;
        if (!Array.isArray(parsed.assignment) || parsed.assignment.length !== packet.problem.n) {
          reject(new Error("Lockout returned an invalid assignment length."));
          return;
        }
        resolve({
          ...parsed,
          bestCut: Number(parsed.bestCut),
          wallMs: Number(parsed.wallMs),
          engineName: "lockout CPU anneal",
          enginePath: root,
          fallback: false,
          warning: stderr.trim() || undefined,
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Unable to parse Lockout output."));
      }
    });

    child.stdin.end(payload);
  });
}
