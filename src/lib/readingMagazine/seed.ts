export function hashSeedToIndex(seed: string, modulo: number): number {
  if (modulo <= 0) return 0;

  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  // Ensure unsigned and map into range.
  return (hash >>> 0) % modulo;
}
