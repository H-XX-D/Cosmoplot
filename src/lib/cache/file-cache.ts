import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// On serverless hosts (Vercel) the deployment filesystem is read-only except
// the system temp dir, so writing under process.cwd() throws EROFS. Use a
// writable temp base there; keep the in-repo .cache for local development.
const CACHE_ROOT = process.env.VERCEL
  ? path.join(os.tmpdir(), "cosmoplot-cache", "science")
  : path.join(process.cwd(), ".cache", "science");

type CacheEnvelope<T> = {
  createdAt: string;
  payload: T;
};

async function ensureCacheDir() {
  await mkdir(CACHE_ROOT, { recursive: true });
}

function cachePath(key: string) {
  return path.join(CACHE_ROOT, `${key}.json`);
}

export async function readThroughJsonCache<T>(key: string, maxAgeMs: number, loader: () => Promise<T>) {
  const target = cachePath(key);

  try {
    const fileStat = await stat(target);
    if (Date.now() - fileStat.mtimeMs <= maxAgeMs) {
      const raw = await readFile(target, "utf8");
      const envelope = JSON.parse(raw) as CacheEnvelope<T>;
      return { payload: envelope.payload, cache: "hit" as const, createdAt: envelope.createdAt };
    }
  } catch {
    // cache miss or unreadable cache entry
  }

  const payload = await loader();
  const envelope: CacheEnvelope<T> = {
    createdAt: new Date().toISOString(),
    payload,
  };
  // Best-effort persistence: a read-only or full filesystem must never break
  // the request, so swallow any write failure and still return fresh data.
  try {
    await ensureCacheDir();
    await writeFile(target, JSON.stringify(envelope, null, 2), "utf8");
  } catch {
    // ignore cache write failures
  }
  return { payload, cache: "miss" as const, createdAt: envelope.createdAt };
}
