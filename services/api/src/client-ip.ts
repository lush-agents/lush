import { isIP } from "node:net";

type ParsedIp = {
  family: 4 | 6;
  bytes: Uint8Array;
  canonical: string;
};

type TrustedProxy = {
  address: ParsedIp;
  prefixLength: number;
};

export type TrustedProxySet = readonly TrustedProxy[];

export function parseTrustedProxies(values: readonly string[]): TrustedProxySet {
  return values.map((value) => {
    const [addressValue, prefixValue, ...extra] = value.split("/");
    const address = parseIp(addressValue ?? "");
    if (!address || extra.length > 0) {
      throw new Error(`Invalid trusted proxy: ${value}`);
    }

    const maximumPrefix = address.family === 4 ? 32 : 128;
    const prefixLength = prefixValue === undefined
      ? maximumPrefix
      : Number(prefixValue);
    if (
      !Number.isInteger(prefixLength) ||
      prefixLength < 0 ||
      prefixLength > maximumPrefix
    ) {
      throw new Error(`Invalid trusted proxy prefix: ${value}`);
    }

    return { address, prefixLength };
  });
}

export function resolveClientIp(options: {
  remoteAddress?: string | null;
  forwardedFor?: string | null;
  realIp?: string | null;
  trustedProxies: TrustedProxySet;
  forwardedHeadersTrusted?: boolean;
}) {
  const remoteAddress = parseIp(options.remoteAddress ?? "");
  const forwardedHeadersTrusted = options.forwardedHeadersTrusted ??
    (remoteAddress ? isTrusted(remoteAddress, options.trustedProxies) : false);
  if (!remoteAddress && !forwardedHeadersTrusted) {
    return null;
  }

  if (!forwardedHeadersTrusted) {
    return remoteAddress!.canonical;
  }

  const forwardedFor = options.forwardedFor
    ?.split(",")
    .map((value) => parseIp(value));
  if (forwardedFor?.length) {
    if (forwardedFor.some((value) => !value)) {
      return remoteAddress?.canonical ?? null;
    }

    for (let index = forwardedFor.length - 1; index >= 0; index -= 1) {
      const address = forwardedFor[index]!;
      if (!isTrusted(address, options.trustedProxies)) {
        return address.canonical;
      }
    }

    return forwardedFor[0]!.canonical;
  }

  const realIp = parseIp(options.realIp ?? "");
  return realIp?.canonical ?? remoteAddress?.canonical ?? null;
}

export function isTrustedProxyAddress(
  address: string | null | undefined,
  trustedProxies: TrustedProxySet
) {
  const parsed = parseIp(address ?? "");
  return parsed ? isTrusted(parsed, trustedProxies) : false;
}

export function isLoopbackAddress(address: string | null | undefined) {
  const parsed = parseIp(address ?? "");
  if (!parsed) {
    return false;
  }
  if (parsed.family === 4) {
    return parsed.bytes[0] === 127;
  }

  return parsed.bytes.slice(0, 15).every((byte) => byte === 0)
    && parsed.bytes[15] === 1;
}

export function rateLimitNetworkKey(address: string | null | undefined) {
  const parsed = parseIp(address ?? "");
  if (!parsed) {
    return "unknown";
  }
  if (parsed.family === 4) {
    return `ipv4:${parsed.canonical}`;
  }

  const networkBytes = parsed.bytes.slice();
  networkBytes.fill(0, 8);
  return `ipv6:${canonicalIpv6(networkBytes)}/64`;
}

function isTrusted(address: ParsedIp, trustedProxies: TrustedProxySet) {
  return trustedProxies.some((proxy) => {
    if (proxy.address.family !== address.family) {
      return false;
    }

    const wholeBytes = Math.floor(proxy.prefixLength / 8);
    const remainingBits = proxy.prefixLength % 8;
    for (let index = 0; index < wholeBytes; index += 1) {
      if (proxy.address.bytes[index] !== address.bytes[index]) {
        return false;
      }
    }

    if (remainingBits === 0) {
      return true;
    }

    const mask = (0xff << (8 - remainingBits)) & 0xff;
    return (
      (proxy.address.bytes[wholeBytes]! & mask) ===
      (address.bytes[wholeBytes]! & mask)
    );
  });
}

function parseIp(rawValue: string): ParsedIp | undefined {
  const value = stripAddressPort(rawValue.trim());
  const family = isIP(value);
  if (family === 4) {
    const bytes = Uint8Array.from(value.split(".").map(Number));
    return { family, bytes, canonical: Array.from(bytes).join(".") };
  }
  if (family !== 6) {
    return undefined;
  }

  const bytes = ipv6Bytes(value);
  if (!bytes) {
    return undefined;
  }

  if (
    bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff
  ) {
    const ipv4Bytes = bytes.slice(12);
    return {
      family: 4,
      bytes: ipv4Bytes,
      canonical: Array.from(ipv4Bytes).join(".")
    };
  }

  return { family, bytes, canonical: canonicalIpv6(bytes) };
}

function canonicalIpv6(bytes: Uint8Array) {
  const groups = [];
  for (let index = 0; index < bytes.length; index += 2) {
    groups.push(((bytes[index]! << 8) | bytes[index + 1]!).toString(16));
  }
  return groups.join(":");
}

function stripAddressPort(value: string) {
  if (value.startsWith("[")) {
    const closingBracket = value.indexOf("]");
    if (closingBracket > 0) {
      return value.slice(1, closingBracket);
    }
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) {
    return value.slice(0, value.lastIndexOf(":"));
  }

  return value.split("%")[0] ?? value;
}

function ipv6Bytes(value: string) {
  let normalized = value.toLowerCase();
  const ipv4Tail = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  if (ipv4Tail) {
    const octets = ipv4Tail.split(".").map(Number);
    normalized = normalized.slice(0, -ipv4Tail.length) +
      `${((octets[0]! << 8) | octets[1]!).toString(16)}:` +
      `${((octets[2]! << 8) | octets[3]!).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) {
    return undefined;
  }
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) {
    return undefined;
  }

  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8) {
    return undefined;
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < groups.length; index += 1) {
    const group = Number.parseInt(groups[index]!, 16);
    bytes[index * 2] = group >> 8;
    bytes[index * 2 + 1] = group & 0xff;
  }
  return bytes;
}
