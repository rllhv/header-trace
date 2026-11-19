import type { Address } from '../types.ts';
import { decodeMimeWords } from './mime.ts';

const ADDRESS_MAX_VALUE = 2000;
const MAX_DOMAIN = 255;

/** Splits "a@x.test, B <b@y.test>" on commas that are not inside quotes, <> or (). */
export function splitAddressList(value: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let quoted = false;
  let angle = 0;
  let paren = 0;
  for (const ch of value.slice(0, ADDRESS_MAX_VALUE)) {
    if (ch === '"' && paren === 0) quoted = !quoted;
    else if (!quoted && ch === '(') paren++;
    else if (!quoted && ch === ')' && paren > 0) paren--;
    else if (!quoted && paren === 0 && ch === '<') angle++;
    else if (!quoted && paren === 0 && ch === '>' && angle > 0) angle--;
    if ((ch === ',' || ch === ';') && !quoted && angle === 0 && paren === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function cleanDisplay(raw: string): string {
  let name = raw.trim();
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return decodeMimeWords(name).trim();
}

export function parseAddress(value: string): Address | null {
  const text = value.slice(0, ADDRESS_MAX_VALUE).trim();
  if (!text) return null;
  let email = '';
  let display = '';

  // The real address is the LAST <...> pair: a quoted display name may contain "<fake@x>".
  const lt = text.lastIndexOf('<');
  const gt = lt === -1 ? -1 : text.indexOf('>', lt);
  if (lt !== -1 && gt !== -1) {
    email = text.slice(lt + 1, gt).trim();
    display = cleanDisplay(text.slice(0, lt));
  } else {
    const bare = /[^\s<>(),;:"]{1,64}@[^\s<>(),;:"]{1,256}/.exec(text.replace(/\([^)]{0,200}\)/g, ' '));
    if (!bare) return null;
    email = bare[0];
  }

  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase().replace(/\.$/, '');
  if (!domain || domain.length > MAX_DOMAIN || /\s/.test(domain)) return null;
  return { display, email: `${local}@${domain}`, local, domain };
}
