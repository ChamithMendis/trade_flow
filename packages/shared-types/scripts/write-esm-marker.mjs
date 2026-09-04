import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The package itself is "type": "commonjs", so Node would read dist/esm/*.js as
// CommonJS. This marker tells it (and any other Node-based consumer) that the
// esm output really is ESM.
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/esm');
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
