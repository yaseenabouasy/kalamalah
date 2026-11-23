import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const USE_HF_CDN = (process.env.USE_HF_CDN ?? 'true').toLowerCase() === 'true';
const HF_DATASET = process.env.HF_DATASET ?? 'Kalamalah/cdn';
const HF_TOKEN = process.env.HF_TOKEN;
const LOCAL_CDN_DIR = join(process.cwd(), 'cdn');

const jsonCache = new Map<string, unknown>();

export function buildHfUrl(relPath: string): string {
  const clean = relPath.replace(/^\/+/, '');
  return `https://huggingface.co/datasets/${HF_DATASET}/resolve/main/${clean}`;
}

export async function fetchCdnJson<T = unknown>(relPath: string): Promise<T | null> {
  if (jsonCache.has(relPath)) {
    return jsonCache.get(relPath) as T;
  }

  const localPath = join(LOCAL_CDN_DIR, relPath);
  if (!USE_HF_CDN && existsSync(localPath)) {
    const raw = await readFile(localPath, 'utf8');
    const parsed = JSON.parse(raw) as T;
    jsonCache.set(relPath, parsed);
    return parsed;
  }

  const headers: Record<string, string> = {};
  if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;

  const res = await fetch(buildHfUrl(relPath), { headers });
  if (!res.ok) return null;

  const parsed = (await res.json()) as T;
  jsonCache.set(relPath, parsed);
  return parsed;
}

export async function proxyCdnAsset(relPath: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (HF_TOKEN) headers['Authorization'] = `Bearer ${HF_TOKEN}`;
  return fetch(buildHfUrl(relPath), { headers });
}
