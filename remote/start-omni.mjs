import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
process.env.DATA_DIR||=resolve(root,'remote-state');
process.env.RESEARCH_ENGINE||='codex';
process.env.PORT||='8788';
await import('./server.mjs');
