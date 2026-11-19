import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analyze.ts';
import type { Analysis, Severity } from '../src/types.ts';

const BASE = ['Date: Tue, 6 Oct 2026 16:41:10 +0000', 'Message-ID: <m@x.test>', 'To: me@mail.test'];
const run = (...lines: string[]): Analysis => analyze([...BASE, ...lines].join('\n'));
const ids = (a: Analysis): string[] => a.findings.map((f) => f.id);
const sev = (a: Analysis, id: string): Severity | undefined => a.findings.find((f) => f.id === id)?.severity;

// ---------- authentication ----------
test('auth: SPF fail is a danger, DMARC fail is a danger', () => {
  const a = run('From: a@shop.example', 'Authentication-Results: mx.mail.test; spf=fail smtp.mailfrom=a@shop.example; dmarc=fail header.from=shop.example');
  assert.equal(sev(a, 'spf-fail'), 'danger');
  assert.equal(sev(a, 'dmarc-fail'), 'danger');
});

test('auth: softfail is a warning, no DKIM is only info', () => {
  const a = run('From: a@shop.example', 'Authentication-Results: mx.mail.test; spf=softfail smtp.mailfrom=a@shop.example; dkim=none');
  assert.equal(sev(a, 'spf-softfail'), 'warning');
  assert.equal(sev(a, 'dkim-none'), 'info');
});

test('auth: aligned passes are reported as ok, not as problems', () => {
  const a = run('From: a@news.shop.example', 'Authentication-Results: mx.mail.test; spf=pass smtp.mailfrom=b@bounce.shop.example; dkim=pass header.d=shop.example; dmarc=pass header.from=news.shop.example');
  assert.deepEqual(['spf-pass', 'dkim-pass', 'dmarc-pass'].map((i) => sev(a, i)), ['ok', 'ok', 'ok']);
});

test('auth: SPF pass for an unrelated domain is flagged unless DMARC passed', () => {
  const header = 'Authentication-Results: mx.mail.test; spf=pass smtp.mailfrom=b@attacker.example';
  assert.equal(sev(run('From: a@bank.example', header), 'spf-misaligned'), 'warning');
  assert.equal(sev(run('From: a@bank.example', header + '; dmarc=pass header.from=bank.example'), 'spf-pass'), 'ok');
});

test('auth: DKIM pass for an unrelated domain is flagged', () => {
  const a = run('From: a@bank.example', 'Authentication-Results: mx.mail.test; dkim=pass header.d=attacker.example');
  assert.equal(sev(a, 'dkim-misaligned'), 'warning');
});

test('auth: a missing verdict is info and never a danger', () => {
  const a = run('From: a@shop.example');
  assert.equal(sev(a, 'auth-missing'), 'info');
});

test('auth: only the topmost Authentication-Results counts (a lower one is forgeable)', () => {
  const a = run('From: a@shop.example',
    'Authentication-Results: mx.mail.test; dmarc=fail header.from=shop.example',
    'Authentication-Results: attacker.example; dmarc=pass header.from=shop.example');
  assert.equal(sev(a, 'dmarc-fail'), 'danger');
  assert.equal(ids(a).includes('dmarc-pass'), false);
});

// ---------- addresses ----------
test('addresses: a display name carrying another address is a danger', () => {
  const a = run('From: "support@bank.example" <x@evil.example>');
  assert.equal(sev(a, 'display-name-address'), 'danger');
});

test('addresses: a display name with the sender\'s own address is fine', () => {
  const a = run('From: "x@evil.example" <x@evil.example>');
  assert.equal(ids(a).includes('display-name-address'), false);
});

test('addresses: Reply-To on another domain warns, a free mailbox is called out', () => {
  const a = run('From: help@shop.example', 'Reply-To: helpdesk.2026@gmail.com');
  assert.equal(sev(a, 'reply-to-mismatch'), 'warning');
  assert.match(a.findings.find((f) => f.id === 'reply-to-mismatch')!.why, /free personal mailbox/);
  assert.equal(ids(run('From: help@shop.example', 'Reply-To: other@mail.shop.example')).includes('reply-to-mismatch'), false);
});

test('addresses: Return-Path mismatch is info only when DMARC passed', () => {
  const rp = ['From: a@shop.example', 'Return-Path: <b@esp.example>'];
  assert.equal(sev(run(...rp), 'return-path-mismatch'), 'warning');
  assert.equal(sev(run(...rp, 'Authentication-Results: mx.mail.test; dmarc=pass header.from=shop.example'), 'return-path-mismatch'), 'info');
  assert.equal(ids(run('From: a@shop.example', 'Return-Path: <>')).includes('return-path-mismatch'), false);
});

// ---------- look-alike domains ----------
const fromFinding = (domain: string): string[] => ids(run(`From: x@${domain}`)).filter((i) => /lookalike|brand|near-miss|mixed|idn/.test(i));

test('lookalike: genuine brand domains raise nothing', () => {
  for (const d of ['paypal.com', 'mail.paypal.com', 'amazon.sa', 'amazon.co.uk', 'alrajhibank.com.sa', 'e.stc.com.sa']) {
    assert.deepEqual(fromFinding(d), [], d);
  }
});

test('lookalike: digit/letter swaps are caught', () => {
  assert.deepEqual(fromFinding('paypa1.com'), ['lookalike-domain']);
  assert.deepEqual(fromFinding('arnazon.com'), ['lookalike-domain']);
  assert.deepEqual(fromFinding('micros0ft.com'), ['lookalike-domain']);
});

test('lookalike: a disguised brand word inside a longer domain is a danger', () => {
  assert.deepEqual(fromFinding('paypa1-secure.example'), ['lookalike-token']);
});

test('lookalike: brand name inside another domain is a warning', () => {
  assert.deepEqual(fromFinding('paypal-support.example'), ['brand-in-domain']);
  assert.deepEqual(fromFinding('secure.paypal.com.evil.example'), ['brand-in-domain']);
});

test('lookalike: one-character misspelling and other-TLD copies are warnings', () => {
  assert.deepEqual(fromFinding('paypall.com'), ['near-miss-domain']);
  assert.equal(sev(run('From: x@paypal.co'), 'brand-other-domain'), 'warning');
});

test('lookalike: unrelated domains and short names do not trigger', () => {
  assert.deepEqual(fromFinding('example.com'), []);
  assert.deepEqual(fromFinding('news.example.com'), []);
  assert.deepEqual(fromFinding('staples.com'), []);
});

test('lookalike: Cyrillic "а" in an xn-- domain is a homograph danger', () => {
  const found = fromFinding('xn--pple-43d.example');
  assert.ok(found.includes('mixed-script'));
  assert.ok(found.includes('lookalike-domain'));
  assert.equal(sev(run('From: x@xn--pple-43d.example'), 'mixed-script'), 'danger');
});

test('lookalike: a harmless internationalised domain is info only', () => {
  assert.deepEqual(fromFinding('xn--bcher-kva.example'), ['idn-domain']);
});

test('lookalike: a malformed xn-- label is flagged as a warning', () => {
  assert.equal(sev(run('From: x@xn--zzz!!.example'), 'bad-punycode'), 'warning');
  assert.equal(sev(run('From: x@xn--bcher-kva.example'), 'bad-punycode'), undefined); // a valid one is not
});

test('lookalike: Reply-To and Return-Path domains are checked too', () => {
  const a = run('From: x@shop.example', 'Reply-To: y@paypa1.com');
  assert.ok(a.findings.some((f) => f.id === 'lookalike-domain' && /Reply-To/.test(f.title)));
});

test('display name: brand names with a foreign address warn; the real address does not', () => {
  assert.equal(sev(run('From: "PayPal Support" <x@evil.example>'), 'display-name-brand'), 'warning');
  assert.equal(ids(run('From: "PayPal" <service@paypal.com>')).includes('display-name-brand'), false);
  assert.equal(sev(run('From: "Al Rajhi Bank" <x@evil.example>'), 'display-name-brand'), 'warning');
  assert.equal(sev(run('From: "مصرف الراجحي" <x@evil.example>'), 'display-name-brand'), 'warning');
  assert.equal(ids(run('From: "Example News" <x@news.example.com>')).includes('display-name-brand'), false);
});

// ---------- route ----------
const hop = (by: string, when: string) => `Received: from a.example (a.example [192.0.2.1]) by ${by} with ESMTP id 1; ${when}`;

test('route: timestamps going backwards beyond clock skew are a warning', () => {
  const a = run('From: a@shop.example', hop('c.test', 'Tue, 6 Oct 2026 16:41:00 +0000'), hop('b.test', 'Tue, 6 Oct 2026 16:55:00 +0000'));
  assert.equal(sev(a, 'time-backward'), 'warning');
});

test('route: a one-minute skew is tolerated', () => {
  const a = run('From: a@shop.example', hop('c.test', 'Tue, 6 Oct 2026 16:41:00 +0000'), hop('b.test', 'Tue, 6 Oct 2026 16:41:40 +0000'));
  assert.equal(ids(a).includes('time-backward'), false);
});

test('route: a many-hour hold-up is info', () => {
  const a = run('From: a@shop.example', hop('c.test', 'Tue, 6 Oct 2026 16:41:00 +0000'), hop('b.test', 'Tue, 6 Oct 2026 02:00:00 +0000'));
  assert.equal(sev(a, 'long-delay'), 'info');
});

test('route: a Date header far from the first server\'s timestamp is a warning', () => {
  const a = analyze(['From: a@shop.example', 'Date: Mon, 1 Jan 2024 10:00:00 +0000', hop('b.test', 'Tue, 6 Oct 2026 16:41:00 +0000')].join('\n'));
  assert.equal(sev(a, 'date-mismatch'), 'warning');
});

test('route: no Received lines is an info note', () => {
  assert.equal(sev(run('From: a@shop.example'), 'received-none'), 'info');
});

test('route: the entry point reports IP, and notes a missing reverse DNS', () => {
  const a = analyze(['From: a@shop.example', 'Authentication-Results: mx.mail.test; spf=pass smtp.mailfrom=a@shop.example',
    'Received: from sender.example (unknown [203.0.113.9]) by mx.mail.test with ESMTP id 1; Tue, 6 Oct 2026 16:41:00 +0000'].join('\n'));
  const entry = a.findings.find((f) => f.id === 'entry-point')!;
  assert.ok(entry.evidence.some((e) => e.includes('203.0.113.9')));
  assert.match(entry.why, /no reverse-DNS/);
});

// ---------- structure ----------
test('structure: two From headers is a danger', () => {
  assert.equal(sev(run('From: a@good.example', 'From: b@evil.example'), 'duplicate-from'), 'danger');
});

test('structure: other duplicated headers and missing Date / Message-ID are warnings', () => {
  assert.equal(sev(analyze('From: a@x.test\nSubject: one\nSubject: two\nTo: me@x.test'), 'duplicate-headers'), 'warning');
  const a = analyze('From: a@x.test\nTo: me@x.test');
  assert.equal(sev(a, 'missing-headers'), 'warning');
  assert.deepEqual(a.findings.find((f) => f.id === 'missing-headers')!.evidence, ['Missing: date', 'Missing: message-id']);
});

test('structure: an unreadable From is reported', () => {
  assert.equal(sev(run('From: not an address'), 'unreadable-from'), 'warning');
});

test('structure: text that is not headers gives a single clear finding', () => {
  const a = analyze('Hello, this is just a sentence and not headers.');
  assert.deepEqual(ids(a), ['no-headers']);
  assert.deepEqual(ids(analyze('')), ['no-headers']);
});

test('result: findings are ordered danger, warning, info, ok and counted', () => {
  const a = run('From: "PayPal" <x@paypa1.com>', 'Authentication-Results: mx.mail.test; spf=pass smtp.mailfrom=x@paypa1.com; dmarc=fail header.from=paypa1.com');
  const order = { danger: 0, warning: 1, info: 2, ok: 3 };
  const ranks = a.findings.map((f) => order[f.severity]);
  assert.deepEqual(ranks, [...ranks].sort((x, y) => x - y));
  assert.equal(a.counts.danger + a.counts.warning + a.counts.info + a.counts.ok, a.findings.length);
});

test('summary fields: subject is decoded, date parsed, address split', () => {
  const a = analyze('From: =?UTF-8?Q?J=C3=BCrgen?= <J@Mail.Example>\nSubject: =?UTF-8?B?' + Buffer.from('مرحبا').toString('base64') + '?=\nDate: Tue, 6 Oct 2026 16:41:10 +0000');
  assert.equal(a.from?.display, 'Jürgen');
  assert.equal(a.from?.domain, 'mail.example');
  assert.equal(a.subject, 'مرحبا');
  assert.equal(a.date, Date.UTC(2026, 9, 6, 16, 41, 10));
});
