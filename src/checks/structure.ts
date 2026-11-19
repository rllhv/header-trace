import type { Context, Finding } from '../types.ts';
import { getAll, getFirst } from '../parse/headers.ts';

const SINGLE_VALUED = ['to', 'cc', 'subject', 'date', 'message-id', 'reply-to', 'sender'];

export function checkStructure(ctx: Context): Finding[] {
  const out: Finding[] = [];
  const froms = getAll(ctx.headers, 'from');

  if (froms.length === 0) {
    out.push({
      id: 'missing-from', severity: 'warning', title: 'There is no From header',
      why: 'Every real message names its sender. If you copied only part of the headers, paste the full set.',
      evidence: ['No From header was found.'],
    });
  } else if (froms.length > 1) {
    out.push({
      id: 'duplicate-from', severity: 'danger', title: 'The message has more than one From header',
      why: 'Mail apps and security filters can pick different ones, so a forged name may be shown to you while the real one is checked. Legitimate mail has exactly one.',
      evidence: froms.map((f) => `From: ${f.value}`),
    });
  } else if (ctx.from === null) {
    out.push({
      id: 'unreadable-from', severity: 'warning', title: 'The From header does not contain a readable address',
      why: 'The sender could not be identified, so the sender-based checks were skipped.',
      evidence: [`From: ${froms[0].value}`],
    });
  }

  const duplicated = SINGLE_VALUED.filter((name) => getAll(ctx.headers, name).length > 1);
  if (duplicated.length > 0) {
    out.push({
      id: 'duplicate-headers', severity: 'warning', title: 'Some headers appear more than once',
      why: 'These headers should occur only once. Duplicates can be a way to show one value to people and another to filters.',
      evidence: duplicated.map((n) => `${n} appears ${getAll(ctx.headers, n).length} times`),
    });
  }

  const missing = ['date', 'message-id'].filter((name) => !getFirst(ctx.headers, name));
  if (missing.length > 0) {
    out.push({
      id: 'missing-headers', severity: 'warning', title: 'Standard headers are missing',
      why: 'Mail software almost always adds these. Bulk-mailing tools that skip them are common among spammers, though some headers are removed when you export a message.',
      evidence: missing.map((n) => `Missing: ${n}`),
    });
  }

  if (ctx.headers.malformedLines > 0) {
    out.push({
      id: 'malformed-lines', severity: 'info', title: 'Some lines were not valid headers',
      why: 'They were ignored. If you pasted extra text above the headers, that is normal.',
      evidence: [`${ctx.headers.malformedLines} line(s) skipped`],
    });
  }
  if (ctx.headers.truncated) {
    out.push({
      id: 'input-truncated', severity: 'info', title: 'The pasted text was very long and was cut',
      why: 'Only the first part was analysed. Headers are normally a few kilobytes, so you probably pasted the message body too.',
      evidence: ['Input limited to 200,000 characters'],
    });
  }
  return out;
}
