// Executa os testes de LÓGICA compilados em tools/logic-check/.out usando node:test + um shim mínimo de Jest.
// ATENÇÃO: isto NÃO é Jest. Serve só para reproduzir a verificação de lógica pura sem instalar o Expo.
require('./jestshim.cjs');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '.out', 'src');
if (!fs.existsSync(root)) { console.error('Rode antes: tsc -p tools/logic-check/tsconfig.json'); process.exit(2); }
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of walk(root).filter((f) => f.endsWith('.test.js'))) require(f);
