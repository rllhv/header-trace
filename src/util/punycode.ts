// Decoder for RFC 3492 (Punycode), used to reveal what an "xn--" label really says.
const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const MAX_INPUT = 100;

function adapt(delta: number, numPoints: number, first: boolean): number {
  delta = first ? Math.floor(delta / DAMP) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = Math.floor(delta / (BASE - TMIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
}

function digitValue(cp: number): number {
  if (cp >= 0x30 && cp <= 0x39) return 26 + (cp - 0x30);
  if (cp >= 0x41 && cp <= 0x5a) return cp - 0x41;
  if (cp >= 0x61 && cp <= 0x7a) return cp - 0x61;
  return BASE;
}

/** Decodes the part of a label that follows "xn--". Throws on malformed input. */
export function punycodeDecode(input: string): string {
  if (input.length > MAX_INPUT) throw new RangeError('punycode input too long');
  const output: number[] = [];
  let basic = input.lastIndexOf('-');
  if (basic < 0) basic = 0;
  for (let j = 0; j < basic; j++) {
    const cp = input.charCodeAt(j);
    if (cp >= 0x80) throw new RangeError('non-basic code point in basic section');
    output.push(cp);
  }
  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  let index = basic > 0 ? basic + 1 : 0;
  while (index < input.length) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) throw new RangeError('truncated punycode');
      const digit = digitValue(input.charCodeAt(index++));
      if (digit >= BASE) throw new RangeError('invalid punycode digit');
      i += digit * w;
      if (i > 0x7fffffff) throw new RangeError('punycode overflow');
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
    }
    const len = output.length + 1;
    bias = adapt(i - oldi, len, oldi === 0);
    n += Math.floor(i / len);
    if (n > 0x10ffff) throw new RangeError('code point out of range');
    i %= len;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}
