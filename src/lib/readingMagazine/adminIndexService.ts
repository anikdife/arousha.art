import type { RMAdminMeta, RMIndex } from './adminTypes';
import { loadRmIndex, loadRmMeta, saveRmIndex, saveRmMeta } from './adminStorageService';

let cachedMeta: RMAdminMeta | null = null;
let cachedIndex: RMIndex | null = null;
let inFlight: Promise<{ meta: RMAdminMeta; index: RMIndex }> | null = null;

export function invalidateRmAdminCache(): void {
  cachedMeta = null;
  cachedIndex = null;
  inFlight = null;
}

export async function loadRmAdminBundle(): Promise<{ meta: RMAdminMeta; index: RMIndex }> {
  if (cachedMeta && cachedIndex) return { meta: cachedMeta, index: cachedIndex };
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const [meta, index] = await Promise.all([loadRmMeta(), loadRmIndex()]);
    cachedMeta = meta;
    cachedIndex = index;
    return { meta, index };
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export async function saveRmAdminBundle(params: { meta: RMAdminMeta; index: RMIndex }): Promise<void> {
  await Promise.all([saveRmMeta(params.meta), saveRmIndex(params.index)]);
  cachedMeta = params.meta;
  cachedIndex = params.index;
}
