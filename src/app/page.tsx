import { NebulaBackground } from "@/components/chrome/nebula-background";
import { CosmoplotHomeShell } from "@/components/chrome/cosmoplot-home-shell";
import { ShootingStars } from "@/components/ui/shooting-stars";
import { getUniverseSnapshot } from "@/lib/science/catalog/build-universe";

export const dynamic = "force-dynamic";

export default async function Home() {
  const snapshot = await getUniverseSnapshot({ radiusPc: 35, limit: 320 });

  return (
    <main className="relative min-h-screen overflow-x-hidden text-white">
      <NebulaBackground />
      <ShootingStars
        className="fixed inset-0 z-[1] opacity-80"
        starColor="#ffe8a8"
        trailColor="#72dcff"
        minSpeed={18}
        maxSpeed={34}
        minDelay={1200}
        maxDelay={2800}
      />
      <ShootingStars
        className="fixed inset-0 z-[1] opacity-40"
        starColor="#ff8fb9"
        trailColor="#ffb778"
        minSpeed={10}
        maxSpeed={22}
        minDelay={2400}
        maxDelay={5200}
      />
      <div className="pointer-events-none fixed inset-0 z-[2] bg-[radial-gradient(circle_at_50%_22%,rgba(138,223,255,0.10),transparent_0_17%,rgba(255,172,118,0.07)_28%,transparent_54%),linear-gradient(180deg,rgba(1,4,13,0.06),rgba(1,4,13,0.36)_32%,rgba(1,4,13,0.78)_100%)]" />
      <CosmoplotHomeShell snapshot={snapshot} />
    </main>
  );
}
