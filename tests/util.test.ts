import test from 'node:test';
import assert from 'node:assert/strict';
import { punycodeDecode } from '../src/util/punycode.ts';
import { domainsAligned, levenshtein, registrable, toUnicodeDomain, isFreemail } from '../src/util/domain.ts';
import { scriptsIn, skeleton } from '../src/util/confusables.ts';
import { formatDuration, formatTime } from '../src/util/format.ts';

test('punycode: known vectors', () => {
  assert.equal(punycodeDecode('bcher-kva'), 'bücher');
  assert.equal(punycodeDecode('pple-43d'), '\u0430pple'); // Cyrillic "а" + "pple"
  assert.equal(punycodeDecode('mnchen-3ya'), 'münchen');
});

test('punycode: malformed input throws', () => {
  assert.throws(() => punycodeDecode('!!!'));
  assert.throws(() => punycodeDecode('a'.repeat(200)));
  assert.throws(() => punycodeDecode('99999999999999999999'));
});

test('toUnicodeDomain: decodes xn-- labels and flags broken ones', () => {
  assert.equal(toUnicodeDomain('xn--pple-43d.example').unicode, '\u0430pple.example');
  const broken = toUnicodeDomain('xn--***.example');
  assert.equal(broken.failed, true);
  assert.equal(toUnicodeDomain('plain.example').failed, false);
});

test('registrable: handles common two-part suffixes', () => {
  assert.equal(registrable('mail.news.example.com'), 'example.com');
  assert.equal(registrable('shop.example.co.uk'), 'example.co.uk');
  assert.equal(registrable('x.alrajhibank.com.sa'), 'alrajhibank.com.sa');
  assert.equal(registrable('Example.COM.'), 'example.com');
});

test('alignment and freemail', () => {
  assert.equal(domainsAligned('bounces.news.example.com', 'news.example.com'), true);
  assert.equal(domainsAligned('example.com', 'example.org'), false);
  assert.equal(domainsAligned('', 'example.com'), false);
  assert.equal(isFreemail('mail.gmail.com'), true);
  assert.equal(isFreemail('example.com'), false);
});

test('levenshtein', () => {
  assert.equal(levenshtein('paypal', 'paypall'), 1);
  assert.equal(levenshtein('paypal', 'paypal'), 0);
  assert.equal(levenshtein('abc', ''), 3);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
});

test('skeleton: lookalikes collapse onto the real name', () => {
  assert.equal(skeleton('paypa1'), skeleton('paypal'));
  assert.equal(skeleton('PayPaI'), skeleton('paypal'));
  assert.equal(skeleton('micros0ft'), skeleton('microsoft'));
  assert.equal(skeleton('arnazon'), skeleton('amazon'));
  assert.equal(skeleton('\u0430pple'), skeleton('apple'));
  assert.notEqual(skeleton('paypal'), skeleton('paypay'));
});

test('scriptsIn: detects mixed alphabets', () => {
  assert.deepEqual([...scriptsIn('\u0430pple')].sort(), ['Cyrillic', 'Latin']);
  assert.deepEqual([...scriptsIn('apple-2026')], ['Latin']);
  assert.deepEqual([...scriptsIn('الراجحي')], ['Arabic']);
});

test('format helpers', () => {
  assert.equal(formatTime(Date.UTC(2026, 9, 6, 16, 41, 15)), '2026-10-06 16:41:15 UTC');
  assert.equal(formatTime(null), 'unknown time');
  assert.equal(formatDuration(500), 'under a second');
  assert.equal(formatDuration(90_000), '2 min');
  assert.equal(formatDuration(-3 * 3600_000 - 5 * 60_000), '3 h 5 min');
  assert.equal(formatDuration(3 * 86400_000), '3 days');
});
