import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from '../src/analyze.ts';

const load = (name: string) => analyze(readFileSync(new URL(`../samples/${name}.txt`, import.meta.url), 'utf8'));
const ids = (name: string) => load(name).findings.map((f) => f.id);

test('sample phishing: shows the classic signs', () => {
  const found = ids('phishing');
  for (const id of ['spf-fail', 'dmarc-fail', 'lookalike-token', 'reply-to-mismatch', 'display-name-brand', 'time-backward', 'missing-headers']) {
    assert.ok(found.includes(id), `expected ${id} in ${found.join(', ')}`);
  }
  assert.equal(load('phishing').subject, '⚠️ Your account is limited - action required');
});

test('sample phishing: trust stops where the recipient\'s provider stops', () => {
  const hops = load('phishing').hops;
  assert.deepEqual(hops.map((h) => h.trusted), [false, true, true, true]);
  assert.equal(hops[1].ip, '203.0.113.77');
});

test('sample lookalike: every authentication check passes, yet the domain is flagged', () => {
  const a = load('lookalike');
  assert.equal(a.counts.ok, 3);
  assert.ok(a.counts.danger >= 2);
  assert.ok(ids('lookalike').includes('mixed-script'));
  assert.equal(a.subject, 'تنبيه: تم تقييد حسابك - يرجى التأكيد');
});

test('sample normal: nothing worth a warning', () => {
  const a = load('normal');
  assert.equal(a.counts.danger, 0);
  assert.equal(a.counts.warning, 0);
  assert.equal(a.counts.ok, 3);
});

test('samples contain no real-looking identifiers (fictional TLDs and documentation IPs only)', () => {
  for (const name of ['phishing', 'lookalike', 'normal']) {
    const text = readFileSync(new URL(`../samples/${name}.txt`, import.meta.url), 'utf8');
    const domains = text.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:example|test|com)\b/gi) ?? [];
    for (const d of domains) assert.ok(/\.example$|\.test$|example\.com$/i.test(d), `${name}: ${d}`);
    for (const ip of text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? []) {
      assert.ok(/^(192\.0\.2|198\.51\.100|203\.0\.113|127\.|10\.)/.test(ip), `${name}: ${ip}`);
    }
  }
});
