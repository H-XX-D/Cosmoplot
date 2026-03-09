import { NextResponse } from "next/server";
import { getWhiteDwarfCatalog } from "@/lib/science/local/white-dwarfs";

export async function GET() {
  try {
    const catalog = await getWhiteDwarfCatalog();
    return NextResponse.json(catalog, {
      headers: {
        "cache-control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown white dwarf catalog error",
      },
      { status: 500 },
    );
  }
}
