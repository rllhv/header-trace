import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analyze.ts';

const LIMIT_MS = 1500;

const HOSTILE: Array<[string, string]> = [
  ['unbalanced parentheses in Received', 'Received: ' + '('.repeat(150_000)],
  ['keyword flood in Received', 'Received: ' + 'from '.repeat(35_000) + ';'],
  ['one huge token in Received', 'Received: ' + 'x'.repeat(190_000)],
  ['segment flood in Authentication-Results', 'Authentication-Results: x; ' + 'a=b;'.repeat(45_000)],
  ['long alphanumeric run in Authentication-Results', 'Authentication-Results: x; spf=pass ' + 'a'.repeat(190_000)],
  ['angle brackets in From', 'From: ' + '<'.repeat(100_000)],
  ['@ flood in From', 'From: ' + 'a@'.repeat(60_000)],
  ['quote flood in From', 'From: ' + '"'.repeat(100_000) + ' <a@b.test>'],
  ['oversized domain', 'From: x@' + 'a.'.repeat(90_000)],
  ['encoded-word flood', 'Subject: ' + '=?UTF-8?B?'.repeat(15_000)],
  ['quoted-printable flood', 'Subject: =?UTF-8?Q?' + '='.repeat(100_000) + '?='],
  ['whitespace flood', 'X: ' + ' '.repeat(190_000) + 'y'],
  ['punycode flood', 'From: a@xn--' + 'a'.repeat(100_000) + '.example'],
  ['many hops', 'Received: from a by b; Tue, 6 Oct 2026 16:00:00 +0000\n'.repeat(3_000)],
  ['many Reply-To addresses', 'From: a@b.test\nReply-To: ' + 'x@y.test,'.repeat(20_000)],
  ['many malformed lines', 'garbage line\n'.repeat(15_000)],
  ['NUL and control characters', 'From: a@b.test\u0000\u0007\nSubject: \u0000\u001b[31m'],
];

for (const [name, text] of HOSTILE) {
  test(`hostile input finishes quickly and never throws: ${name}`, () => {
    const started = performance.now();
    const result = analyze(text);
    const elapsed = performance.now() - started;
    assert.ok(Array.isArray(result.findings));
    assert.ok(elapsed < LIMIT_MS, `took ${Math.round(elapsed)} ms`);
  });
}

test('HTML and script text in headers is returned verbatim as data (the UI must render it as text)', () => {
  const payload = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  const a = analyze(`From: "${payload}" <x@evil.example>\nSubject: ${payload}`);
  assert.equal(a.subject, payload);
  assert.equal(a.from?.display, payload);
});

test('prototype-pollution attempts through header and property names change nothing', () => {
  analyze('__proto__: polluted\nconstructor: x\nAuthentication-Results: mx.test; spf=pass __proto__=polluted constructor=x smtp.mailfrom=a@b.test\nFrom: a@b.test');
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
});

test('the analyzer is deterministic', () => {
  const text = 'From: "PayPal" <x@paypa1.com>\nSubject: hi';
  assert.deepEqual(analyze(text), analyze(text));
});
