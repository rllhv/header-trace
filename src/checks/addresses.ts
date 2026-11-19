import type { Address, Context, Finding } from '../types.ts';
import { getFirst } from '../parse/headers.ts';
import { parseAddress, splitAddressList } from '../parse/address.ts';
import { hasPass } from '../parse/auth.ts';
import { domainsAligned, isFreemail } from '../util/domain.ts';

export function checkAddresses(ctx: Context): Finding[] {
  const out: Finding[] = [];
  const from = ctx.from;
  if (!from) return out;

  // A display name that contains a different e-mail address, e.g. "support@bank.test" <x@evil.test>
  const shown = from.display.slice(0, 300).match(/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,120}\.[A-Za-z]{2,24}/g) ?? [];
  const lying = shown.filter((a) => !domainsAligned(a.slice(a.lastIndexOf('@') + 1), from.domain));
  if (lying.length > 0) {
    out.push({
      id: 'display-name-address', severity: 'danger',
      title: 'The display name shows a different e-mail address than the real sender',
      why: 'Many mail apps show only the display name. Here the name itself looks like an address from another domain, which is a deliberate trick.',
      evidence: [`Display name: ${from.display}`, `Actual address: ${from.email}`],
    });
  }

  const replyTo = getFirst(ctx.headers, 'reply-to');
  if (replyTo) {
    const addresses = splitAddressList(replyTo.value)
      .map((v) => parseAddress(v))
      .filter((a): a is Address => a !== null);
    const different = addresses.filter((a) => !domainsAligned(a.domain, from.domain));
    if (different.length > 0) {
      const personal = different.some((a) => isFreemail(a.domain)) && !isFreemail(from.domain);
      out.push({
        id: 'reply-to-mismatch', severity: 'warning',
        title: 'Replies would go to a different domain than the sender',
        why: 'If you answer this message, your reply goes to the Reply-To address, not the From address. Phishers use this so the From line looks official while replies reach them.'
          + (personal ? ' The reply address is a free personal mailbox, which an organisation would not normally use.' : ''),
        evidence: [`From: ${from.email}`, ...different.map((a) => `Reply-To: ${a.email}`)],
      });
    }
  }

  const returnPath = getFirst(ctx.headers, 'return-path');
  if (returnPath) {
    const address = parseAddress(returnPath.value); // "<>" (an empty bounce path) gives null
    if (address && !domainsAligned(address.domain, from.domain)) {
      const verified = hasPass(ctx.auth, 'dmarc');
      out.push({
        id: 'return-path-mismatch', severity: verified ? 'info' : 'warning',
        title: 'Bounce address is on a different domain than the sender',
        why: verified
          ? 'Common with newsletters and mail services. The sender\'s DMARC check passed, so this is probably routine.'
          : 'Common with mail services, but forged mail looks like this too, and no DMARC pass confirms the sender.',
        evidence: [`From: ${from.email}`, `Return-Path: ${address.email}`],
      });
    }
  }
  return out;
}
