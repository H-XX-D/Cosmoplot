import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_ROOT = path.join(process.cwd(), ".cache", "science");

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
  await ensureCacheDir();
  const target = cachePath(key);

  try {
    const fileStat = await stat(target);
    if (Date.now() - fileStat.mtimeMs <= maxAgeMs) {
      const raw = await readFile(target, "utf8");
      const envelope = JSON.parse(raw) as CacheEnvelope<T>;
      return { payload: envelope.payload, cache: "hit" as const, createdAt: envelope.createdAt };
    }
  } catch {
    // cache miss
  }

  const payload = await loader();
  const envelope: CacheEnvelope<T> = {
    createdAt: new Date().toISOString(),
    payload,
  };
  await writeFile(target, JSON.stringify(envelope, null, 2), "utf8");
  return { payload, cache: "miss" as const, createdAt: envelope.createdAt };
}
