import type { Analysis, Context, Counts, Finding, Severity } from './types.ts';
import { getFirst, parseHeaders } from './parse/headers.ts';
import { parseAddress } from './parse/address.ts';
import { decodeMimeWords } from './parse/mime.ts';
import { parseAuth } from './parse/auth.ts';
import { hostRegistrable, parseDateValue, parseReceivedChain } from './parse/received.ts';
import { checkAuth } from './checks/auth.ts';
import { checkAddresses } from './checks/addresses.ts';
import { checkLookalike } from './checks/lookalike.ts';
import { checkReceived } from './checks/received.ts';
import { checkStructure } from './checks/structure.ts';

const SEVERITY_RANK: Record<Severity, number> = { danger: 0, warning: 1, info: 2, ok: 3 };

export function analyze(input: string): Analysis {
  const headers = parseHeaders(input);
  const fromField = getFirst(headers, 'from');
  const from = fromField ? parseAddress(fromField.value) : null;
  const auth = parseAuth(headers);
  const hops = parseReceivedChain(headers, hostRegistrable(auth.serverId));
  const ctx: Context = { headers, from, hops, auth };

  let findings: Finding[];
  if (headers.fields.length === 0) {
    findings = [{
      id: 'no-headers', severity: 'warning', title: 'This does not look like e-mail headers',
      why: 'Headers are lines such as "From: ...", "Received: ..." and "Subject: ...". In Gmail, open the message, choose the three-dot menu, then "Show original".',
      evidence: ['No "Name: value" lines were found.'],
    }];
  } else {
    findings = [
      ...checkStructure(ctx),
      ...checkAuth(ctx),
      ...checkAddresses(ctx),
      ...checkLookalike(ctx),
      ...checkReceived(ctx),
    ];
  }
  findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const counts: Counts = { danger: 0, warning: 0, info: 0, ok: 0 };
  for (const f of findings) counts[f.severity]++;

  const dateField = getFirst(headers, 'date');
  return {
    headers,
    from,
    subject: decodeMimeWords(getFirst(headers, 'subject')?.value ?? ''),
    date: dateField ? parseDateValue(dateField.value) : null,
    dateRaw: dateField ? dateField.value : '',
    hops,
    auth,
    findings,
    counts,
  };
}
