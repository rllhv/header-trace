import type { Context, Finding, Hop } from '../types.ts';
import { getFirst } from '../parse/headers.ts';
import { parseDateValue, hostRegistrable } from '../parse/received.ts';
import { formatDuration, formatTime } from '../util/format.ts';
import { looksLikeIp } from '../util/domain.ts';

export const BACKWARD_TOLERANCE_MS = 2 * 60 * 1000;
export const LONG_DELAY_MS = 6 * 60 * 60 * 1000;
export const DATE_MISMATCH_MS = 24 * 60 * 60 * 1000;
export const MANY_HOPS = 12;

function describeHop(hop: Hop): string {
  const who = hop.from || 'unknown server';
  const where = hop.ip ? ` [${hop.ip}]` : '';
  return `${who}${where} -> ${hop.by || 'unknown server'} at ${formatTime(hop.time)}`;
}

function previousTimed(hops: Hop[], index: number): Hop | undefined {
  for (let i = index - 1; i >= 0; i--) if (hops[i].time !== null) return hops[i];
  return undefined;
}

function isPrivateIp(ip: string): boolean {
  return /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip === '::1' || /^f[cd]/i.test(ip);
}

export function checkReceived(ctx: Context): Finding[] {
  const hops = ctx.hops;
  if (hops.length === 0) {
    return [{
      id: 'received-none', severity: 'info', title: 'No route information found',
      why: 'Messages normally contain "Received" lines that record each server they passed through. Make sure you copied the complete headers.',
      evidence: ['No Received header was found.'],
    }];
  }

  const out: Finding[] = [];

  const backward: string[] = [];
  const slow: string[] = [];
  hops.forEach((hop, i) => {
    if (hop.delayMs === null) return;
    const prev = previousTimed(hops, i);
    if (hop.delayMs < -BACKWARD_TOLERANCE_MS && prev) {
      backward.push(`${formatDuration(hop.delayMs)} before the previous step: ${describeHop(hop)}`);
    } else if (hop.delayMs > LONG_DELAY_MS) {
      slow.push(`${formatDuration(hop.delayMs)} after the previous step: ${describeHop(hop)}`);
    }
  });
  if (backward.length > 0) {
    out.push({
      id: 'time-backward', severity: 'warning',
      title: 'The route timestamps go backwards',
      why: 'A message cannot arrive anywhere before it was sent. This happens when a server clock is wrong, but also when a "Received" line was written by the sender to fake a longer, more legitimate-looking route.',
      evidence: backward,
    });
  }
  if (slow.length > 0) {
    out.push({
      id: 'long-delay', severity: 'info',
      title: 'The message was held up for hours at one step',
      why: 'Delays this long usually mean a queued or retried delivery. They are rarely a problem by themselves.',
      evidence: slow,
    });
  }

  const dateField = getFirst(ctx.headers, 'date');
  const sentAt = dateField ? parseDateValue(dateField.value) : null;
  const firstTimed = hops.find((h) => h.time !== null);
  if (sentAt !== null && firstTimed && firstTimed.time !== null && Math.abs(sentAt - firstTimed.time) > DATE_MISMATCH_MS) {
    out.push({
      id: 'date-mismatch', severity: 'warning',
      title: 'The Date header disagrees with the first server that handled the message',
      why: 'The Date line is written by the sender and can say anything. The first server\'s own timestamp is a better guide. Spam tools often set old or future dates.',
      evidence: [`Date header: ${formatTime(sentAt)}`, `First server saw it: ${formatTime(firstTimed.time)}`],
    });
  }

  if (hops.length > MANY_HOPS) {
    out.push({
      id: 'many-hops', severity: 'info', title: `The message passed through ${hops.length} servers`,
      why: 'Long chains happen with forwarding and mailing lists, but they also hide where a message started.',
      evidence: [`${hops.length} Received lines`],
    });
  }

  const entry = hops.find((h) => h.trusted);
  if (entry && (entry.ip || entry.from)) {
    const evidence = [
      `Recorded by: ${entry.by || 'your mail provider'}`,
      `Connecting IP address: ${entry.ip || 'not recorded'}`,
      `Reverse DNS: ${entry.rdns && entry.rdns.toLowerCase() !== 'unknown' ? entry.rdns : 'none'}`,
      `Name it gave itself (HELO): ${entry.from || 'not recorded'}`,
    ];
    let note = 'These details were written by your own mail provider, so the IP address is reliable. The HELO name is only a claim by the sending server.';
    if (entry.ip && isPrivateIp(entry.ip)) {
      note += ' This address is private, so it is an internal hand-off rather than the original sender.';
    } else if (entry.ip && (!entry.rdns || entry.rdns.toLowerCase() === 'unknown')) {
      note += ' The sending machine has no reverse-DNS name. Many legitimate mail servers have one, while throwaway or compromised machines often do not.';
    } else if (entry.rdns && entry.from && looksLikeIp(entry.from) === false
      && hostRegistrable(entry.rdns) !== '' && hostRegistrable(entry.from) !== ''
      && hostRegistrable(entry.rdns) !== hostRegistrable(entry.from)) {
      note += ' The HELO name and the reverse-DNS name belong to different domains.';
    }
    out.push({ id: 'entry-point', severity: 'info', title: 'Where the message entered your mail provider', why: note, evidence });
  }
  return out;
}
