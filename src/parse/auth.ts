import type { AuthMethodResult, AuthResults, ParsedHeaders } from '../types.ts';
import { getFirst } from './headers.ts';

const AUTH_MAX_VALUE = 8000;
const MAX_SEGMENTS = 40;

function emptyProps(): Record<string, string> {
  return Object.create(null) as Record<string, string>;
}

/**
 * Reads the TOPMOST Authentication-Results header only: that one was added by the
 * receiving system. Lower ones may have been inserted by the sender.
 */
export function parseAuth(headers: ParsedHeaders): AuthResults {
  const ar = getFirst(headers, 'authentication-results');
  if (ar) {
    const parts = ar.value.slice(0, AUTH_MAX_VALUE).split(';');
    const serverId = (parts[0] ?? '').trim().split(/\s+/)[0] ?? '';
    const results: AuthMethodResult[] = [];
    for (const rawSegment of parts.slice(1, MAX_SEGMENTS)) {
      const segment = rawSegment.replace(/\([^)]{0,500}\)/g, ' ');
      const head = /^\s*([a-z][a-z0-9-]*)\s*=\s*([a-z]+)/i.exec(segment);
      if (!head) continue;
      const props = emptyProps();
      const rest = segment.slice(head[0].length);
      for (const p of rest.matchAll(/(?<![A-Za-z0-9.-])([a-z][a-z0-9]*(?:\.[a-z0-9-]+)?)=([^\s;()]+)/gi)) {
        props[p[1].toLowerCase()] = p[2];
      }
      results.push({ method: head[1].toLowerCase(), result: head[2].toLowerCase(), props });
    }
    return { source: 'authentication-results', serverId, results };
  }

  const rs = getFirst(headers, 'received-spf');
  if (rs) {
    const head = /^\s*([a-z]+)/i.exec(rs.value);
    if (head) {
      const props = emptyProps();
      const envelope = /envelope-from=([^\s;]+)/i.exec(rs.value);
      if (envelope) props['smtp.mailfrom'] = envelope[1].replace(/^["<]+|[>"]+$/g, '');
      return {
        source: 'received-spf',
        serverId: '',
        results: [{ method: 'spf', result: head[1].toLowerCase(), props }],
      };
    }
  }
  return { source: 'none', serverId: '', results: [] };
}

export function authResult(auth: AuthResults, method: string): AuthMethodResult[] {
  return auth.results.filter((r) => r.method === method);
}

export function hasPass(auth: AuthResults, method: string): boolean {
  return authResult(auth, method).some((r) => r.result === 'pass');
}
