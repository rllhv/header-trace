// RFC 2047 "encoded words": =?UTF-8?B?...?= and =?UTF-8?Q?...?=
const ENCODED_WORD = /=\?([A-Za-z0-9_-]{1,40})(?:\*[A-Za-z0-9-]{1,20})?\?([BbQq])\?([^?\s]{0,2000})\?=/g;

function base64ToBytes(text: string): Uint8Array {
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function quotedPrintableToBytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '_') {
      bytes.push(0x20);
    } else if (ch === '=') {
      const hex = text.slice(i + 1, i + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) throw new Error('bad quoted-printable');
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset.toLowerCase()).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export function decodeMimeWords(value: string): string {
  // Whitespace between two adjacent encoded words is not part of the text.
  const joined = value.replace(/(\?=)[ \t]+(?==\?)/g, '$1');
  return joined.replace(ENCODED_WORD, (whole: string, charset: string, enc: string, text: string) => {
    try {
      const bytes = enc.toUpperCase() === 'B' ? base64ToBytes(text) : quotedPrintableToBytes(text);
      return decodeBytes(bytes, charset);
    } catch {
      return whole;
    }
  });
}
