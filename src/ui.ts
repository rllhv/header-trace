import { analyze } from './analyze.ts';
import { BACKWARD_TOLERANCE_MS } from './checks/received.ts';
import { formatDuration, formatTime } from './util/format.ts';
import type { Analysis, Finding, Hop, Severity } from './types.ts';

// Injected by scripts/build.mjs from the files in samples/.
declare const SAMPLES: Record<string, string>;

type Child = Node | string | null | false | undefined;

// Every piece of header data reaches the page as a text node. innerHTML is never used,
// so markup or script placed inside a header can only ever be displayed, not run.
function el(tag: string, attrs: Record<string, string> = {}, ...kids: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  for (const kid of kids) if (kid !== null && kid !== false && kid !== undefined) node.append(kid);
  return node;
}

const GROUPS: Array<[Severity, string]> = [
  ['danger', 'Serious problems'],
  ['warning', 'Worth a closer look'],
  ['info', 'Good to know'],
];

function verdictFor(a: Analysis): { level: Severity; text: string } {
  const { danger, warning } = a.counts;
  if (danger > 0) {
    const what = danger === 1 ? 'One serious problem' : `${danger} serious problems`;
    return { level: 'danger', text: `${what} found. Do not click links or reply until you have checked with the sender another way.` };
  }
  if (warning > 0) {
    return { level: 'warning', text: 'Nothing is clearly forged, but some details deserve a closer look before you trust this message.' };
  }
  return { level: 'ok', text: 'No red flags in the headers. That does not prove the message is safe: headers say nothing about the links or attachments inside.' };
}

function fact(label: string, ...value: Child[]): HTMLElement {
  return el('div', { class: 'row' }, el('dt', {}, label), el('dd', { dir: 'auto' }, ...value));
}

function renderMessage(a: Analysis): HTMLElement {
  const verdict = verdictFor(a);
  const sender: Child[] = a.from
    ? [a.from.display ? el('strong', {}, a.from.display + ' ') : null, el('span', { class: 'addr' }, a.from.email)]
    : ['Not readable'];
  const sent = a.date !== null ? `${formatTime(a.date)} (as written by the sender)` : a.dateRaw || 'Not present';
  return el('section', { class: 'block msg' },
    el('h2', {}, 'Message'),
    el('dl', { class: 'facts' }, fact('From', ...sender), fact('Subject', a.subject || 'Not present'), fact('Sent', sent)),
    el('p', { class: `verdict ${verdict.level}` }, verdict.text),
  );
}

function renderHop(hop: Hop): HTMLElement {
  const flagged = hop.delayMs !== null && hop.delayMs < -BACKWARD_TOLERANCE_MS;
  let delay: Child = null;
  if (hop.delayMs !== null) {
    const amount = formatDuration(hop.delayMs);
    delay = el('div', { class: flagged ? 'hop-meta hop-flag' : 'hop-meta' },
      hop.delayMs < 0 ? `${amount} before the previous step` : `${amount} after the previous step`);
  }
  return el('li', { class: 'hop' + (hop.trusted ? ' trusted' : '') + (flagged ? ' flagged' : '') },
    el('div', { class: 'hop-name', dir: 'auto' }, hop.from || (hop.trusted ? 'Your mail provider (internal step)' : 'Unknown server'), hop.ip ? el('span', { class: 'hop-ip' }, hop.ip) : null),
    hop.by ? el('div', { class: 'hop-by', dir: 'auto' }, `handed to ${hop.by}`) : null,
    el('div', { class: 'hop-meta' }, hop.time !== null ? formatTime(hop.time) : 'No readable timestamp'),
    delay,
    el('div', { class: 'hop-tag' }, hop.trusted ? 'Recorded by your mail provider' : 'Claimed by an earlier server, can be forged'),
  );
}

function renderRoute(a: Analysis): HTMLElement {
  const section = el('section', { class: 'block' }, el('h2', {}, 'Route'));
  if (a.hops.length === 0) {
    section.append(el('p', { class: 'sub' }, 'No "Received" lines were found, so the route is unknown.'));
    return section;
  }
  section.append(
    el('p', { class: 'sub' }, 'Read from top to bottom: the sender\'s side first, your inbox last. Only steps recorded by your own mail provider are reliable. Earlier steps are written by the sender\'s side and can be forged.'),
    el('ol', { class: 'route' }, ...a.hops.map(renderHop)),
  );
  return section;
}

function renderFinding(f: Finding): HTMLElement {
  return el('div', { class: `finding sev-${f.severity}` },
    el('h4', { class: 'finding-title' }, f.title),
    el('p', { class: 'finding-why' }, f.why),
    f.evidence.length > 0
      ? el('div', { class: 'evidence' }, ...f.evidence.map((line) => el('div', { dir: 'auto' }, line)))
      : null,
  );
}

function renderFindings(a: Analysis): HTMLElement {
  const section = el('section', { class: 'block' }, el('h2', {}, 'What the headers show'));
  for (const [severity, title] of GROUPS) {
    const items = a.findings.filter((f) => f.severity === severity);
    if (items.length === 0) continue;
    section.append(
      el('h3', { class: `group-title sev-${severity}` }, `${title} (${items.length})`),
      el('div', {}, ...items.map(renderFinding)),
    );
  }
  const passed = a.findings.filter((f) => f.severity === 'ok');
  if (passed.length > 0) {
    section.append(el('details', { class: 'passed' },
      el('summary', {}, `Checks that passed (${passed.length})`),
      el('div', {}, ...passed.map(renderFinding)),
    ));
  }
  if (a.counts.danger + a.counts.warning + a.counts.info + a.counts.ok === 0) {
    section.append(el('p', { class: 'sub' }, 'Nothing to report.'));
  }
  return section;
}

function renderRaw(a: Analysis): HTMLElement {
  const shown = a.headers.fields.slice(0, 300);
  return el('details', { class: 'block raw' },
    el('summary', {}, `All ${a.headers.fields.length} headers as read`),
    el('div', { class: 'raw-list' }, ...shown.map((f) =>
      el('div', { class: 'raw-row' }, el('span', { class: 'raw-name' }, f.name), el('span', { class: 'raw-value', dir: 'auto' }, f.value)))),
  );
}

function emptyState(): HTMLElement {
  return el('p', { class: 'empty' }, 'Paste the headers on the left. You will see the route the message took, whether the sender was verified, and anything that looks off.');
}

function start(): void {
  const input = document.getElementById('input') as HTMLTextAreaElement;
  const results = document.getElementById('results') as HTMLElement;
  const note = document.getElementById('sample-note') as HTMLElement;
  const samples = Object.values(SAMPLES);

  function update(): void {
    const text = input.value;
    note.hidden = !samples.includes(text);
    if (text.trim() === '') {
      results.replaceChildren(emptyState());
      return;
    }
    try {
      const a = analyze(text);
      results.replaceChildren(renderMessage(a), renderRoute(a), renderFindings(a), renderRaw(a));
    } catch {
      results.replaceChildren(el('p', { class: 'empty' }, 'Something went wrong while reading this text. Try pasting the headers again.'));
    }
  }

  let timer: number | undefined;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(update, 200);
  });

  document.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.sample ?? '';
      if (Object.prototype.hasOwnProperty.call(SAMPLES, key)) {
        input.value = SAMPLES[key];
        update();
      }
    });
  });
  document.getElementById('clear')?.addEventListener('click', () => {
    input.value = '';
    update();
    input.focus();
  });

  input.value = SAMPLES.phishing;
  update();
}

if (typeof document !== 'undefined') start();
