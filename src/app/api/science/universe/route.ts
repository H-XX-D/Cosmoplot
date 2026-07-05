import { NextRequest, NextResponse } from "next/server";
import { getUniverseSnapshot } from "@/lib/science/catalog/build-universe";

export async function GET(request: NextRequest) {
  const radiusPc = Number(request.nextUrl.searchParams.get("radiusPc") || 50);
  const limit = Number(request.nextUrl.searchParams.get("limit") || 800);
  const search = request.nextUrl.searchParams.get("search");

  try {
    const snapshot = await getUniverseSnapshot({ radiusPc, limit, search });
    return NextResponse.json(snapshot, {
      headers: {
        "cache-control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown universe snapshot error",
      },
      { status: 500 },
    );
  }
}
