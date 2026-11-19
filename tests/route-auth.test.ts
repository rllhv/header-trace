import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHeaders } from '../src/parse/headers.ts';
import { parseReceivedChain, parseDateValue } from '../src/parse/received.ts';
import { parseAuth } from '../src/parse/auth.ts';

const CHAIN = [
  'Received: by 2002:a05:6a00:1:b0:1c3:aa:bb with SMTP id q1; Tue, 6 Oct 2026 09:41:17 -0700 (PDT)',
  'Received: from mx-in.provider.example (mx-in.provider.example. [198.51.100.25])',
  '        by mx.provider.example with ESMTPS id k1 for <v@provider.example>;',
  '        Tue, 06 Oct 2026 09:41:16 -0700 (PDT)',
  'Received: from smtp.sender.example (unknown [203.0.113.77]) by mx-in.provider.example with ESMTP id 7f;',
  '        Tue, 6 Oct 2026 16:41:10 +0000',
  'Received: from [IPv6:2001:db8::1] (helo=laptop) by smtp.sender.example with ESMTP id 1; Tue, 6 Oct 2026 16:41:00 +0000',
].join('\n');

test('received: hops are returned oldest first with delays', () => {
  const hops = parseReceivedChain(parseHeaders(CHAIN), 'provider.example');
  assert.equal(hops.length, 4);
  assert.equal(hops[0].ip, '2001:db8::1');
  assert.equal(hops[1].from, 'smtp.sender.example');
  assert.equal(hops[1].rdns, 'unknown');
  assert.equal(hops[1].ip, '203.0.113.77');
  assert.equal(hops[1].delayMs, 10_000);
  assert.equal(hops[2].delayMs, 6_000);
  assert.equal(hops[3].by, '2002:a05:6a00:1:b0:1c3:aa:bb');
  assert.equal(hops[3].protocol, 'SMTP');
});

test('received: trust runs back from your inbox while the provider recorded the step', () => {
  const hops = parseReceivedChain(parseHeaders(CHAIN), 'provider.example');
  assert.deepEqual(hops.map((h) => h.trusted), [false, true, true, true]);
});

test('received: without a known provider only the newest step is trusted', () => {
  const hops = parseReceivedChain(parseHeaders(CHAIN));
  assert.deepEqual(hops.map((h) => h.trusted), [false, false, false, true]);
});

test('received: a missing timestamp does not break delay arithmetic', () => {
  const h = parseHeaders('Received: from a.test by b.test; not a date\nReceived: from c.test by d.test; Tue, 6 Oct 2026 16:00:00 +0000');
  const hops = parseReceivedChain(h);
  assert.equal(hops.length, 2);
  assert.equal(hops[0].time, Date.UTC(2026, 9, 6, 16, 0, 0));
  assert.equal(hops[1].time, null);
  assert.equal(hops[1].delayMs, null);
});

test('received: no Received headers gives an empty list', () => {
  assert.deepEqual(parseReceivedChain(parseHeaders('Subject: x')), []);
});

test('date parsing tolerates comments and double spaces', () => {
  assert.equal(parseDateValue('Mon,  5 Oct 2026 15:02:08 +0000 (UTC)'), Date.UTC(2026, 9, 5, 15, 2, 8));
  assert.equal(parseDateValue('garbage'), null);
});

const AR = [
  'Authentication-Results: mx.provider.example;',
  '   dkim=pass header.i=@news.example.com header.s=s1;',
  '   spf=pass (provider.example: domain of b@bounces.example.com designates 192.0.2.1 as permitted sender) smtp.mailfrom=b@bounces.example.com;',
  '   dmarc=fail (p=NONE) header.from=news.example.com',
  'Authentication-Results: attacker.example; dmarc=pass header.from=news.example.com',
].join('\n');

test('auth: reads the topmost Authentication-Results only', () => {
  const auth = parseAuth(parseHeaders(AR));
  assert.equal(auth.source, 'authentication-results');
  assert.equal(auth.serverId, 'mx.provider.example');
  assert.deepEqual(auth.results.map((r) => `${r.method}=${r.result}`), ['dkim=pass', 'spf=pass', 'dmarc=fail']);
});

test('auth: properties are extracted and comments are ignored', () => {
  const auth = parseAuth(parseHeaders(AR));
  assert.equal(auth.results[0].props['header.i'], '@news.example.com');
  assert.equal(auth.results[1].props['smtp.mailfrom'], 'b@bounces.example.com');
  assert.equal(auth.results[2].props['header.from'], 'news.example.com');
});

test('auth: falls back to Received-SPF, then to nothing', () => {
  const rs = parseAuth(parseHeaders('Received-SPF: softfail (x: domain does not designate) client-ip=203.0.113.9; envelope-from="<a@b.test>";'));
  assert.equal(rs.source, 'received-spf');
  assert.equal(rs.results[0].result, 'softfail');
  assert.equal(rs.results[0].props['smtp.mailfrom'], 'a@b.test');
  assert.equal(parseAuth(parseHeaders('Subject: x')).source, 'none');
});
