import type { AuthMethodResult, Context, Finding } from '../types.ts';
import { authResult, hasPass } from '../parse/auth.ts';
import { domainsAligned } from '../util/domain.ts';

function domainOfValue(value: string | undefined): string {
  if (!value) return '';
  const v = value.replace(/^["<]+|[>"]+$/g, '');
  const at = v.lastIndexOf('@');
  return (at === -1 ? v : v.slice(at + 1)).toLowerCase();
}

function describeResult(r: AuthMethodResult): string {
  const keys = ['smtp.mailfrom', 'smtp.helo', 'header.d', 'header.i', 'header.from', 'smtp.remote-ip'];
  const extra = keys.filter((k) => r.props[k]).map((k) => `${k}=${r.props[k]}`);
  return [`${r.method}=${r.result}`, ...extra].join('  ');
}

function spfFinding(r: AuthMethodResult, fromDomain: string, dmarcPass: boolean, source: string): Finding {
  const evidence = [source, describeResult(r)];
  switch (r.result) {
    case 'pass': {
      const used = domainOfValue(r.props['smtp.mailfrom'] ?? r.props['smtp.helo']);
      if (used && fromDomain && !dmarcPass && !domainsAligned(used, fromDomain)) {
        return {
          id: 'spf-misaligned', severity: 'warning',
          title: 'SPF passed, but for a different domain than the sender shown',
          why: `The sending server is approved by ${used}, not by ${fromDomain}. Anyone can pass SPF for a domain they own, so this does not show that the visible sender is genuine.`,
          evidence,
        };
      }
      return {
        id: 'spf-pass', severity: 'ok', title: 'SPF passed',
        why: 'The server that delivered this message is on the approved list of the domain it was sent from.',
        evidence,
      };
    }
    case 'fail':
    case 'hardfail':
      return {
        id: 'spf-fail', severity: 'danger', title: 'SPF failed: the sending server is not approved',
        why: 'The server that delivered this message is not on the sender domain\'s list of approved servers. Forged mail often fails this check.',
        evidence,
      };
    case 'softfail':
      return {
        id: 'spf-softfail', severity: 'warning', title: 'SPF soft-failed: the sending server is probably not approved',
        why: 'The sender domain says this server is probably not allowed to send for it, but did not demand rejection.',
        evidence,
      };
    case 'neutral':
    case 'none':
      return {
        id: 'spf-none', severity: 'info', title: 'SPF gave no verdict',
        why: 'The sender domain does not publish an approved-server list, or does not say whether this server is on it.',
        evidence,
      };
    default:
      return {
        id: 'spf-error', severity: 'info', title: 'SPF could not be checked',
        why: 'The check hit a temporary or permanent error, so it says nothing either way.',
        evidence,
      };
  }
}

function dkimFinding(r: AuthMethodResult, fromDomain: string, dmarcPass: boolean, source: string): Finding {
  const evidence = [source, describeResult(r)];
  switch (r.result) {
    case 'pass': {
      const used = domainOfValue(r.props['header.d'] ?? r.props['header.i']);
      if (used && fromDomain && !dmarcPass && !domainsAligned(used, fromDomain)) {
        return {
          id: 'dkim-misaligned', severity: 'warning',
          title: 'DKIM passed, but the signature belongs to a different domain than the sender shown',
          why: `The message is signed by ${used}, not by ${fromDomain}. A valid signature from an unrelated domain does not vouch for the visible sender.`,
          evidence,
        };
      }
      return {
        id: 'dkim-pass', severity: 'ok', title: 'DKIM signature is valid',
        why: 'The message carries a digital signature that matches its content and the signing domain\'s published key.',
        evidence,
      };
    }
    case 'fail':
    case 'policy':
      return {
        id: 'dkim-fail', severity: 'danger', title: 'DKIM signature is invalid',
        why: 'The signature does not match the message or the signing domain\'s key. The message may have been altered in transit, or the signature may be fake.',
        evidence,
      };
    case 'none':
    case 'neutral':
      return {
        id: 'dkim-none', severity: 'info', title: 'The message is not signed with DKIM',
        why: 'Many legitimate senders sign their mail, but plenty of small ones do not, so this alone proves little.',
        evidence,
      };
    default:
      return {
        id: 'dkim-error', severity: 'info', title: 'DKIM could not be checked',
        why: 'The check hit an error, so it says nothing either way.',
        evidence,
      };
  }
}

function dmarcFinding(r: AuthMethodResult, source: string): Finding {
  const evidence = [source, describeResult(r)];
  switch (r.result) {
    case 'pass':
      return {
        id: 'dmarc-pass', severity: 'ok', title: 'DMARC passed',
        why: 'The visible From domain lined up with a passing SPF or DKIM check, so the sender is very likely who they claim to be.',
        evidence,
      };
    case 'fail':
      return {
        id: 'dmarc-fail', severity: 'danger', title: 'DMARC failed: the From address could not be verified',
        why: 'Neither SPF nor DKIM verified the domain shown in the From line. This is the classic sign of a spoofed sender.',
        evidence,
      };
    default:
      return {
        id: 'dmarc-none', severity: 'info', title: 'No DMARC verdict',
        why: 'The sender domain does not publish a DMARC policy, or the check could not run.',
        evidence,
      };
  }
}

export function checkAuth(ctx: Context): Finding[] {
  const { auth } = ctx;
  if (auth.source === 'none') {
    return [{
      id: 'auth-missing', severity: 'info', title: 'No sender-verification results found',
      why: 'Mail providers normally record whether SPF, DKIM and DMARC passed. Without those lines this tool cannot tell whether the sender was verified. Make sure you copied the complete headers.',
      evidence: ['No Authentication-Results or Received-SPF header was found.'],
    }];
  }
  const fromDomain = ctx.from?.domain ?? '';
  const dmarcPass = hasPass(auth, 'dmarc');
  const source = auth.source === 'authentication-results'
    ? `Recorded by ${auth.serverId || 'the receiving server'}`
    : 'From the Received-SPF header';

  const out: Finding[] = [];
  for (const r of authResult(auth, 'spf')) out.push(spfFinding(r, fromDomain, dmarcPass, source));
  for (const r of authResult(auth, 'dkim')) out.push(dkimFinding(r, fromDomain, dmarcPass, source));
  const dmarc = authResult(auth, 'dmarc');
  for (const r of dmarc) out.push(dmarcFinding(r, source));
  if (dmarc.length === 0 && auth.source === 'authentication-results') {
    out.push({
      id: 'dmarc-missing', severity: 'info', title: 'No DMARC verdict',
      why: 'The receiving server did not report a DMARC result for this message.',
      evidence: [source],
    });
  }
  return out;
}
