export function sanitizeReturnTo(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return undefined;
  }

  return value;
}
