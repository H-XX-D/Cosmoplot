import { NextRequest, NextResponse } from "next/server";
import { getUniverseSnapshot } from "@/lib/science/catalog/build-universe";
import {
  buildLockoutProblem,
  finalizeLockoutPlan,
  solveMaxCutAnneal,
  solveMaxCutGreedy,
  type LockoutProblemPacket,
} from "@/lib/science/optimization/target-plan";

export const runtime = "nodejs";

function isProblemPacket(value: unknown): value is LockoutProblemPacket {
  if (!value || typeof value !== "object") return false;
  const packet = value as Partial<LockoutProblemPacket>;
  return packet.version === "cosmoplot-lockout-target-v1"
    && Array.isArray(packet.candidates)
    && Boolean(packet.problem)
    && Array.isArray(packet.problem?.edges)
    && typeof packet.problem?.n === "number"
    && Boolean(packet.graph)
    && Boolean(packet.config);
}

function validatePacket(packet: LockoutProblemPacket) {
  if (packet.problem.n < 2 || packet.problem.n > 180) {
    throw new Error(`Optimizer node count out of range: ${packet.problem.n}`);
  }
  if (packet.problem.edges.length > 12_000) {
    throw new Error(`Optimizer edge count out of range: ${packet.problem.edges.length}`);
  }
  for (const [a, b, weight] of packet.problem.edges) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= packet.problem.n || b >= packet.problem.n) {
      throw new Error("Optimizer edge contains an invalid node index.");
    }
    if (!Number.isFinite(weight)) {
      throw new Error("Optimizer edge contains an invalid weight.");
    }
  }
}

async function solvePacket(packet: LockoutProblemPacket) {
  validatePacket(packet);

  try {
    const solve = solveMaxCutAnneal(packet.problem, packet.config);
    return finalizeLockoutPlan(packet, solve);
  } catch (error) {
    const fallback = solveMaxCutGreedy(packet.problem, packet.config.seed, packet.config.shots);
    return finalizeLockoutPlan(packet, {
      ...fallback,
      warning: error instanceof Error ? error.message : "Anneal solver failed; greedy fallback used.",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const packet = isProblemPacket(body) ? body : isProblemPacket(body?.packet) ? body.packet : null;
    if (!packet) {
      return NextResponse.json({ error: "A Cosmoplot Lockout problem packet is required." }, { status: 400 });
    }

    const plan = await solvePacket(packet);
    return NextResponse.json(plan, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown optimization error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const radiusPc = Number(request.nextUrl.searchParams.get("radiusPc") || 35);
  const limit = Number(request.nextUrl.searchParams.get("limit") || 800);
  const search = request.nextUrl.searchParams.get("search");

  try {
    const snapshot = await getUniverseSnapshot({ radiusPc, limit, search });
    const packet = buildLockoutProblem(snapshot);
    const plan = await solvePacket(packet);
    return NextResponse.json(plan, {
      headers: {
        "cache-control": "s-maxage=900, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown optimization error" },
      { status: 500 },
    );
  }
}
