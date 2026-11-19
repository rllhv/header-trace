// Bundles src/*.ts into one self-contained dist/index.html (no dependencies, no network).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

const ORDER = [
  'src/util/format.ts', 'src/util/punycode.ts', 'src/util/confusables.ts', 'src/util/domain.ts',
  'src/data/brands.ts', 'src/parse/headers.ts', 'src/parse/mime.ts', 'src/parse/address.ts',
  'src/parse/received.ts', 'src/parse/auth.ts', 'src/checks/auth.ts', 'src/checks/addresses.ts',
  'src/checks/lookalike.ts', 'src/checks/received.ts', 'src/checks/structure.ts', 'src/analyze.ts', 'src/ui.ts',
];

const seen = new Map();
const modules = ORDER.map((file) => {
  let code = stripTypeScriptTypes(read(file), { mode: 'strip' });
  code = code.replace(/^import\b[^;]*;[ \t]*$/gm, '');
  code = code.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '');
  if (/^\s*(import|export)\b/m.test(code)) throw new Error(`${file}: unsupported import/export left after bundling`);
  for (const m of code.matchAll(/^(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (seen.has(m[1])) throw new Error(`Duplicate top-level name "${m[1]}" in ${file} and ${seen.get(m[1])}`);
    seen.set(m[1], file);
  }
  return `// ---- ${file}\n${code}`;
});

const samples = {};
for (const name of ['phishing', 'lookalike', 'normal']) samples[name] = read(`samples/${name}.txt`);
const samplesJs = JSON.stringify(samples).replace(/</g, '\\u003c');

const bundle = `(() => {\n'use strict';\nconst SAMPLES = ${samplesJs};\n${modules.join('\n')}\n})();`
  .replace(/<\/script/gi, '<\\/script');

const html = read('web/template.html').replace('/*__BUNDLE__*/', () => bundle);
mkdirSync(new URL('dist/', ROOT), { recursive: true });
writeFileSync(new URL('dist/index.html', ROOT), html);
console.log(`dist/index.html written (${(html.length / 1024).toFixed(1)} KB, ${seen.size} top-level names, no collisions)`);
