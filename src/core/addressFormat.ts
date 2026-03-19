export function formatHexAddress(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalized = trimmed.startsWith('0x') || trimmed.startsWith('0X')
    ? trimmed.slice(2)
    : trimmed;

  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    return trimmed;
  }

  return `0x${normalized.toUpperCase()}`;
}