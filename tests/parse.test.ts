import test from 'node:test';
import assert from 'node:assert/strict';
import { getAll, getFirst, parseHeaders, MAX_INPUT_CHARS } from '../src/parse/headers.ts';
import { decodeMimeWords } from '../src/parse/mime.ts';
import { parseAddress, splitAddressList } from '../src/parse/address.ts';

test('headers: folded values are joined into one line', () => {
  const h = parseHeaders('Subject: Hello\r\n  wide\r\n\tworld\r\nFrom: a@b.test\r\n');
  assert.equal(getFirst(h, 'subject')?.value, 'Hello wide world');
  assert.equal(h.fields.length, 2);
});

test('headers: lookup is case-insensitive and keeps duplicates in order', () => {
  const h = parseHeaders('received: one\nRECEIVED: two\nReceived: three\n');
  assert.deepEqual(getAll(h, 'Received').map((f) => f.value), ['one', 'two', 'three']);
});

test('headers: the body after the first blank line is ignored', () => {
  const h = parseHeaders('From: a@b.test\nSubject: Hi\n\nNot-A-Header: this is the body\n');
  assert.equal(h.fields.length, 2);
  assert.equal(getFirst(h, 'not-a-header'), undefined);
});

test('headers: an mbox "From " envelope line and leading blank lines are skipped', () => {
  const h = parseHeaders('\n\nFrom sender@b.test Mon Oct  5 15:02:05 2026\nSubject: Hi\n');
  assert.equal(h.fields.length, 1);
  assert.equal(h.malformedLines, 0);
});

test('headers: invalid lines are counted, not fatal', () => {
  const h = parseHeaders('Subject: Hi\nthis is not a header\n continuation of nothing?\nTo: x@y.test\n');
  assert.equal(h.fields.length, 2);
  assert.equal(h.malformedLines, 2); // the broken line and the continuation that follows it are both skipped
});

test('headers: continuation with no field before it is malformed', () => {
  const h = parseHeaders('  orphan continuation\nSubject: Hi\n');
  assert.equal(h.malformedLines, 1);
  assert.equal(h.fields.length, 1);
});

test('headers: oversized input is truncated and flagged', () => {
  const h = parseHeaders('Subject: x\n' + 'X-Pad: ' + 'a'.repeat(MAX_INPUT_CHARS + 50));
  assert.equal(h.truncated, true);
  assert.ok(getFirst(h, 'x-pad')!.value.length <= MAX_INPUT_CHARS);
});

test('headers: empty and whitespace input give no fields', () => {
  assert.equal(parseHeaders('').fields.length, 0);
  assert.equal(parseHeaders('   \n\n  ').fields.length, 0);
});

test('mime: base64 UTF-8 encoded word (Arabic)', () => {
  const word = '=?UTF-8?B?' + Buffer.from('تنبيه الحساب', 'utf8').toString('base64') + '?=';
  assert.equal(decodeMimeWords(word), 'تنبيه الحساب');
});

test('mime: quoted-printable word with underscore and =XX bytes', () => {
  assert.equal(decodeMimeWords('=?UTF-8?Q?Caf=C3=A9_au_lait?='), 'Café au lait');
});

test('mime: whitespace between adjacent encoded words is dropped', () => {
  const a = '=?UTF-8?B?' + Buffer.from('Hel').toString('base64') + '?=';
  const b = '=?UTF-8?B?' + Buffer.from('lo').toString('base64') + '?=';
  assert.equal(decodeMimeWords(`${a}  ${b}`), 'Hello');
});

test('mime: other charsets and plain text', () => {
  assert.equal(decodeMimeWords('=?ISO-8859-1?Q?caf=E9?='), 'café');
  assert.equal(decodeMimeWords('plain subject'), 'plain subject');
});

test('mime: malformed encoded words are left untouched, never throw', () => {
  assert.equal(decodeMimeWords('=?UTF-8?Q?bad=ZZ?='), '=?UTF-8?Q?bad=ZZ?=');
  assert.equal(decodeMimeWords('=?UTF-8?B?***?='), '=?UTF-8?B?***?=');
});

test('address: display name and angle address', () => {
  const a = parseAddress('"Example News" <Hello@News.Example.COM>');
  assert.deepEqual(a, { display: 'Example News', email: 'Hello@news.example.com', local: 'Hello', domain: 'news.example.com' });
});

test('address: the REAL address is the last <...>, even if the name contains a fake one', () => {
  const a = parseAddress('"support@bank.test <support@bank.test>" <x@evil.test>');
  assert.equal(a?.domain, 'evil.test');
  assert.match(a!.display, /support@bank\.test/);
});

test('address: bare address, comments, and encoded display name', () => {
  assert.equal(parseAddress('user@host.test (Some Name)')?.email, 'user@host.test');
  assert.equal(parseAddress('=?UTF-8?Q?J=C3=BCrgen?= <j@x.test>')?.display, 'Jürgen');
});

test('address: garbage returns null', () => {
  assert.equal(parseAddress(''), null);
  assert.equal(parseAddress('no address here'), null);
  assert.equal(parseAddress('<>'), null);
  assert.equal(parseAddress('a@' + 'x'.repeat(300) + '.test'), null);
});

test('address list: commas inside quotes or angle brackets do not split', () => {
  const parts = splitAddressList('"Doe, Jane" <j@x.test>, b@y.test; "A,B" <c@z.test>');
  assert.equal(parts.length, 3);
  assert.equal(parseAddress(parts[0])?.email, 'j@x.test');
});
