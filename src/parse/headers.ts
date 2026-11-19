import type { HeaderField, ParsedHeaders } from '../types.ts';

export const MAX_INPUT_CHARS = 200_000;

/**
 * Splits raw text into header fields. Stops at the first blank line, so pasting a
 * whole message is fine: the body is ignored. Folded (multi-line) values are joined.
 */
export function parseHeaders(input: string): ParsedHeaders {
  let text = input;
  let truncated = false;
  if (text.length > MAX_INPUT_CHARS) {
    text = text.slice(0, MAX_INPUT_CHARS);
    truncated = true;
  }
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const fields: HeaderField[] = [];
  let malformedLines = 0;
  let current: HeaderField | null = null;
  let i = 0;

  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && /^From \S/.test(lines[i])) i++; // mbox envelope line

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      if (fields.length > 0) break; // end of headers
      continue;
    }
    if (line[0] === ' ' || line[0] === '\t') {
      if (current) current.value = (current.value + ' ' + line.trim()).trim();
      else malformedLines++;
      continue;
    }
    const match = /^([\x21-\x39\x3B-\x7E]+):[ \t]*(.*)$/.exec(line);
    if (!match) {
      malformedLines++;
      current = null;
      continue;
    }
    current = { name: match[1], value: match[2].trim(), line: i + 1 };
    fields.push(current);
  }
  return { fields, malformedLines, truncated };
}

export function getAll(headers: ParsedHeaders, name: string): HeaderField[] {
  const wanted = name.toLowerCase();
  return headers.fields.filter((f) => f.name.toLowerCase() === wanted);
}

export function getFirst(headers: ParsedHeaders, name: string): HeaderField | undefined {
  const wanted = name.toLowerCase();
  return headers.fields.find((f) => f.name.toLowerCase() === wanted);
}
