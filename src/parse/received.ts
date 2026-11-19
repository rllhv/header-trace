import type { Hop, ParsedHeaders } from '../types.ts';
import { getAll } from './headers.ts';
import { looksLikeIp, registrable } from '../util/domain.ts';

const MAX_HOPS = 100;
const KEYWORDS = new Set(['from', 'by', 'with', 'id', 'for', 'via']);

/** Splits on whitespace that is not inside parentheses. Linear time, bounded nesting. */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      depth = Math.min(depth + 1, 8);
      cur += ch;
    } else if (ch === ')') {
      if (depth > 0) depth--;
      cur += ch;
    } else if (depth === 0 && (ch === ' ' || ch === '\t')) {
      if (cur) tokens.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

export function parseDateValue(value: string): number | null {
  const cleaned = value.replace(/\([^)]{0,200}\)/g, ' ').trim();
  if (!cleaned) return null;
  const t = Date.parse(cleaned);
  return Number.isNaN(t) ? null : t;
}

export function hostRegistrable(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!h.includes('.') || looksLikeIp(h)) return '';
  return registrable(h);
}

function parseReceivedValue(value: string): Hop {
  const semi = value.lastIndexOf(';');
  const main = semi === -1 ? value : value.slice(0, semi);
  const time = semi === -1 ? null : parseDateValue(value.slice(semi + 1));

  const clauses = new Map<string, string[]>();
  let key = '';
  for (const token of tokenize(main.slice(0, 4000))) {
    const lower = token.toLowerCase();
    if (KEYWORDS.has(lower) && !clauses.has(lower)) {
      key = lower;
      clauses.set(key, []);
    } else if (key) {
      (clauses.get(key) as string[]).push(token);
    }
  }

  const fromTokens = clauses.get('from') ?? [];
  const fromText = fromTokens.join(' ');
  const helo = fromTokens.find((t) => !t.startsWith('(')) ?? '';
  const ipMatch = /\[(?:IPv6:)?([0-9A-Fa-f:.]{2,45})\]/.exec(fromText);
  let rdns = '';
  const open = fromText.indexOf('(');
  const close = open === -1 ? -1 : fromText.indexOf(')', open);
  if (open !== -1 && close !== -1) {
    const first = fromText.slice(open + 1, close).trim().split(/\s+/)[0] ?? '';
    if (first && !first.startsWith('[') && !first.includes('=')) rdns = first.replace(/[,;]$/, '');
  }

  return {
    raw: value,
    from: helo.replace(/^\[|\]$/g, ''),
    rdns,
    ip: ipMatch ? ipMatch[1] : '',
    by: (clauses.get('by') ?? [])[0] ?? '',
    protocol: (clauses.get('with') ?? [])[0] ?? '',
    time,
    delayMs: null,
    trusted: false,
  };
}

/**
 * Returns the hops in chronological order (sender side first, your inbox last).
 * `providerDomain` is the registrable domain of the system that wrote
 * Authentication-Results; steps recorded by that provider are marked trusted.
 */
export function parseReceivedChain(headers: ParsedHeaders, providerDomain = ''): Hop[] {
  const hops = getAll(headers, 'received')
    .slice(0, MAX_HOPS)
    .map((f) => parseReceivedValue(f.value))
    .reverse();

  let previous: number | null = null;
  for (const hop of hops) {
    if (hop.time !== null) {
      if (previous !== null) hop.delayMs = hop.time - previous;
      previous = hop.time;
    }
  }

  if (hops.length > 0) {
    hops[hops.length - 1].trusted = true; // the newest step is always written by your provider
    for (let i = hops.length - 2; i >= 0; i--) {
      if (providerDomain && hostRegistrable(hops[i].by) === providerDomain) hops[i].trusted = true;
      else break;
    }
  }
  return hops;
}
