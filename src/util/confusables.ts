// A small, deliberately partial table of characters that look like basic Latin letters.
// It covers the Cyrillic / Greek letters attackers use most; it is not the full Unicode list.
const LOOKALIKES = new Map<string, string>([
  ['\u0430', 'a'], ['\u0435', 'e'], ['\u043E', 'o'], ['\u0440', 'p'], ['\u0441', 'c'],
  ['\u0445', 'x'], ['\u0443', 'y'], ['\u0456', 'i'], ['\u0458', 'j'], ['\u0455', 's'],
  ['\u04CF', 'l'], ['\u0501', 'd'], ['\u051B', 'q'], ['\u051D', 'w'], ['\u04BB', 'h'],
  ['\u043A', 'k'], ['\u0475', 'v'],
  ['\u03BF', 'o'], ['\u03BD', 'v'], ['\u03B1', 'a'], ['\u03C1', 'p'], ['\u03B9', 'i'],
  ['\u0131', 'i'], ['\u0261', 'g'], ['\u217C', 'l'], ['\u2170', 'i'],
]);

/**
 * Reduces a name to a rough "what it looks like" form so that paypa1, PayPaI,
 * and a Cyrillic-letter paypal all collapse to the same string as paypal.
 */
export function skeleton(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFKC').toLowerCase()) out += LOOKALIKES.get(ch) ?? ch;
  out = out.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/cl/g, 'd');
  return out.replace(/[1il|]/g, 'l').replace(/0/g, 'o').replace(/3/g, 'e').replace(/5/g, 's');
}

export function scriptOf(cp: number): string {
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f) || (cp >= 0x1e00 && cp <= 0x1eff)) return 'Latin';
  if (cp >= 0x370 && cp <= 0x3ff) return 'Greek';
  if (cp >= 0x400 && cp <= 0x52f) return 'Cyrillic';
  if (cp >= 0x530 && cp <= 0x58f) return 'Armenian';
  if (cp >= 0x590 && cp <= 0x5ff) return 'Hebrew';
  if ((cp >= 0x600 && cp <= 0x6ff) || (cp >= 0x750 && cp <= 0x77f) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff)) return 'Arabic';
  if (cp >= 0x4e00 && cp <= 0x9fff) return 'Han';
  if (cp >= 0x3040 && cp <= 0x30ff) return 'Kana';
  return 'Other';
}

export function scriptsIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    found.add(scriptOf(ch.codePointAt(0) as number));
  }
  return found;
}
