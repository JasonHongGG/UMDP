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

export function parseHexAddress(value: string | null | undefined): bigint | null {
  const formatted = formatHexAddress(value);
  if (!formatted) {
    return null;
  }

  try {
    return BigInt(formatted);
  }
  catch {
    return null;
  }
}

export function addHexOffset(baseAddress: string | null | undefined, offset: string | null | undefined): string | null {
  const base = parseHexAddress(baseAddress);
  const delta = parseHexAddress(offset);
  if (base === null || delta === null) {
    return null;
  }

  return `0x${(base + delta).toString(16).toUpperCase()}`;
}