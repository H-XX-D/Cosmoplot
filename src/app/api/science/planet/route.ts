import { NextRequest, NextResponse } from "next/server";
import { fetchPlanetScienceBundle } from "@/lib/science/official/planet-science";

export async function GET(request: NextRequest) {
  const name = String(request.nextUrl.searchParams.get("name") || "").trim();

  if (!name) {
    return NextResponse.json({ error: "Planet name is required." }, { status: 400 });
  }

  try {
    const bundle = await fetchPlanetScienceBundle(name);
    if (!bundle) {
      return NextResponse.json({ error: `No official science bundle found for ${name}.` }, { status: 404 });
    }

    return NextResponse.json(bundle, {
      headers: {
        "cache-control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown planet science enrichment error",
      },
      { status: 500 },
    );
  }
}
