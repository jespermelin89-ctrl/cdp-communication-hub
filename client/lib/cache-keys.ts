export function isThreadCacheKey(key: unknown): boolean {
  if (typeof key === 'string') {
    return key.startsWith('/threads');
  }

  if (Array.isArray(key)) {
    return key[0] === 'threads-infinite';
  }

  return false;
}

export function isDraftCacheKey(key: unknown): boolean {
  if (typeof key === 'string') {
    return key.startsWith('/drafts');
  }

  if (Array.isArray(key)) {
    return key[0] === 'drafts-infinite';
  }

  return false;
}
