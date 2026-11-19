import { punycodeDecode } from './punycode.ts';

// Without the full Public Suffix List we recognise only common two-part suffixes.
const TWO_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp',
  'co.in', 'co.za', 'co.kr', 'co.il', 'co.ae', 'com.br', 'com.mx', 'com.ar', 'com.tr',
  'com.sg', 'com.hk', 'com.cn', 'com.my', 'com.pk', 'com.ng', 'com.eg', 'com.sa',
  'net.sa', 'org.sa', 'gov.sa', 'edu.sa', 'med.sa',
]);

const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
  'aol.com', 'gmx.com', 'mail.com', 'yandex.com', 'zoho.com',
]);

export function registrable(domain: string): string {
  const labels = domain.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return TWO_PART_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/** Relaxed DMARC-style alignment: both names share the same registrable domain. */
export function domainsAligned(a: string, b: string): boolean {
  if (!a || !b) return false;
  return registrable(a) === registrable(b);
}

export function isFreemail(domain: string): boolean {
  return FREEMAIL.has(registrable(domain));
}

export function looksLikeIp(host: string): boolean {
  return /^[0-9.]+$/.test(host) || host.includes(':');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Shows what an internationalised domain really spells. `failed` means a label was malformed. */
export function toUnicodeDomain(domain: string): { unicode: string; failed: boolean } {
  let failed = false;
  const labels = domain.split('.').map((label) => {
    if (!label.toLowerCase().startsWith('xn--')) return label;
    try {
      return punycodeDecode(label.slice(4).toLowerCase());
    } catch {
      failed = true;
      return label;
    }
  });
  return { unicode: labels.join('.'), failed };
}
