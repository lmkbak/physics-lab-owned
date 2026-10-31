// Creates a server-free HTML evidence harness from only our owned modules.
// All temporary/binary outputs belong under D:/deepseek-skill.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv[2] || 'D:/deepseek-skill/owned-music-evidence.html';
if (!path.resolve(out).replaceAll('\\', '/').toLowerCase().startsWith('d:/deepseek-skill/')) throw Error('Evidence output must be inside D:/deepseek-skill');
const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const engine = data(await readFile(path.join(root, 'src/lab/owned/music/engine.js'), 'utf8'));
const beat = data((await readFile(path.join(root, 'src/lab/owned/music/beat.js'), 'utf8')).replace("'./engine.js'", JSON.stringify(engine)));
const glow = data((await readFile(path.join(root, 'src/lab/owned/music/glow.js'), 'utf8')).replace("'./engine.js'", JSON.stringify(engine)));
const evidence = data((await readFile(path.join(root, 'tools/owned-music/evidence.mjs'), 'utf8'))
  .replace("'../../src/lab/owned/music/engine.js'", JSON.stringify(engine))
  .replace("'../../src/lab/owned/music/beat.js'", JSON.stringify(beat))
  .replace("'../../src/lab/owned/music/glow.js'", JSON.stringify(glow)));
const html = (await readFile(path.join(root, 'tools/owned-music/evidence.html'), 'utf8')).replace('./evidence.mjs', evidence);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, html, 'utf8');
console.log(JSON.stringify({ out, bytes: Buffer.byteLength(html), serverRequired: false }));
