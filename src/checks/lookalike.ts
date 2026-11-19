import type { Address, Context, Finding } from '../types.ts';
import { BRANDS } from '../data/brands.ts';
import type { Brand } from '../data/brands.ts';
import { getFirst } from '../parse/headers.ts';
import { parseAddress, splitAddressList } from '../parse/address.ts';
import { levenshtein, registrable, toUnicodeDomain } from '../util/domain.ts';
import { scriptsIn, skeleton } from '../util/confusables.ts';

const MAX_LABEL = 100;

function ownedByBrand(domain: string): Brand | undefined {
  const reg = registrable(domain);
  return BRANDS.find((b) => b.domains.includes(reg));
}

function mixesLookalikeScripts(label: string): boolean {
  const s = scriptsIn(label);
  if (s.size < 2) return false;
  const lookalike = s.has('Cyrillic') || s.has('Greek') || s.has('Armenian');
  return (s.has('Latin') && lookalike) || (s.has('Cyrillic') && s.has('Greek'));
}

function brandFinding(brand: Brand, role: string, nameLabel: string, tokens: string[], evidence: string[]): Finding | null {
  const real = `${brand.name}'s real domain: ${brand.domains[0]}`;
  const sk = skeleton(brand.label);
  if (nameLabel === brand.label) {
    return {
      id: 'brand-other-domain', severity: 'warning',
      title: `The ${role} domain uses ${brand.name}'s name on a different domain`,
      why: `This could be a regional site or an imitation. Compare it with the company's official address before trusting it.`,
      evidence: [...evidence, real],
    };
  }
  if (brand.label.length >= 5 && skeleton(nameLabel) === sk) {
    return {
      id: 'lookalike-domain', severity: 'danger',
      title: `The ${role} domain imitates ${brand.name}`,
      why: `The name is written with lookalike characters or digits so that it reads as "${brand.label}" at a glance. It is not one of ${brand.name}'s domains. This is a common phishing trick.`,
      evidence: [...evidence, real],
    };
  }
  if (brand.label.length >= 6 && nameLabel.length >= 5 && levenshtein(nameLabel, brand.label) === 1) {
    return {
      id: 'near-miss-domain', severity: 'warning',
      title: `The ${role} domain is one character away from ${brand.name}`,
      why: 'Misspelled copies of well-known names are used to catch people who read quickly. Some are innocent coincidences, so check before deciding.',
      evidence: [...evidence, real],
    };
  }
  for (const token of tokens) {
    if (token === brand.label) {
      return {
        id: 'brand-in-domain', severity: 'warning',
        title: `The ${role} domain contains the name ${brand.name}, but is not theirs`,
        why: 'Placing a well-known name inside a different domain makes it look official. The owner is the part right before the final ".com" (or similar), not the words before it.',
        evidence: [...evidence, real],
      };
    }
    if (brand.label.length >= 5 && token.length >= 5 && skeleton(token) === sk) {
      return {
        id: 'lookalike-token', severity: 'danger',
        title: `The ${role} domain contains a disguised copy of ${brand.name}'s name`,
        why: `A word inside the domain is spelled with lookalike characters or digits to read as "${brand.label}". It is not one of ${brand.name}'s domains.`,
        evidence: [...evidence, real],
      };
    }
  }
  return null;
}

function assessDomain(role: string, domain: string): Finding[] {
  if (ownedByBrand(domain)) return [];
  const out: Finding[] = [];
  const { unicode, failed } = toUnicodeDomain(domain);
  const evidence = [`${role} domain: ${domain}`];
  if (unicode !== domain) evidence.push(`Spelled out in Unicode: ${unicode}`);

  if (failed) {
    out.push({
      id: 'bad-punycode', severity: 'warning', title: `The ${role} domain contains a malformed encoded name`,
      why: 'Part of the domain starts with "xn--" (the encoding for non-Latin characters) but cannot be decoded. Legitimate domains do not look like this.',
      evidence,
    });
  }

  const labels = unicode.toLowerCase().split('.').map((l) => l.slice(0, MAX_LABEL));
  if (labels.some(mixesLookalikeScripts)) {
    out.push({
      id: 'mixed-script', severity: 'danger',
      title: `The ${role} domain mixes alphabets that look alike`,
      why: 'A single word in this domain combines Latin letters with Cyrillic or Greek letters that look identical to them. This is the signature of a "homograph" attack, where a fake domain is indistinguishable by eye.',
      evidence,
    });
  } else if (unicode !== domain && !failed) {
    out.push({
      id: 'idn-domain', severity: 'info',
      title: `The ${role} domain uses non-Latin characters`,
      why: 'Internationalised domains are legitimate, but they are also used for imitation. The raw header stores them in an "xn--" form.',
      evidence,
    });
  }

  const reg = registrable(unicode.toLowerCase());
  const nameLabel = (reg.split('.')[0] ?? '').slice(0, MAX_LABEL);
  const tokens = labels.slice(0, -1).flatMap((l) => l.split('-')).filter((t) => t.length >= 3);
  let best: Finding | null = null;
  for (const brand of BRANDS) {
    const f = brandFinding(brand, role, nameLabel, tokens, evidence);
    if (!f) continue;
    if (f.severity === 'danger') { best = f; break; }
    if (!best) best = f;
  }
  if (best) out.push(best);
  return out;
}

function checkDisplayNameBrand(from: Address): Finding[] {
  const words = from.display.slice(0, 300).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const padded = ` ${words.join(' ')} `;
  const own = registrable(from.domain);
  for (const brand of BRANDS) {
    const names = brand.aliases ?? [brand.label];
    if (names.some((n) => padded.includes(` ${n} `)) && !brand.domains.includes(own)) {
      return [{
        id: 'display-name-brand', severity: 'warning',
        title: `The display name mentions ${brand.name}, but the address is not theirs`,
        why: 'Anyone can type any name into the display name, and many mail apps show only that. Judge the message by the address, not the name. (A genuine service sending on behalf of a brand can trigger this too.)',
        evidence: [`Display name: ${from.display}`, `Actual address: ${from.email}`, `${brand.name}'s domains include: ${brand.domains.slice(0, 3).join(', ')}`],
      }];
    }
  }
  return [];
}

export function checkLookalike(ctx: Context): Finding[] {
  const from = ctx.from;
  if (!from) return [];
  const out: Finding[] = [];
  const seen = new Set<string>();
  const assess = (role: string, domain: string): void => {
    if (!domain || seen.has(domain)) return;
    seen.add(domain);
    out.push(...assessDomain(role, domain));
  };

  assess('From', from.domain);
  const replyTo = getFirst(ctx.headers, 'reply-to');
  if (replyTo) {
    for (const part of splitAddressList(replyTo.value).slice(0, 5)) {
      const a = parseAddress(part);
      if (a) assess('Reply-To', a.domain);
    }
  }
  const returnPath = getFirst(ctx.headers, 'return-path');
  const rp = returnPath ? parseAddress(returnPath.value) : null;
  if (rp) assess('Return-Path', rp.domain);

  out.push(...checkDisplayNameBrand(from));
  return out;
}
