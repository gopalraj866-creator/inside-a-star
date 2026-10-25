// Exports the narration lines to JSON for the Python audio tools.
import fs from 'node:fs';
import { LINES, SHORT_IDS } from '../public/src/script.js';
fs.mkdirSync('build/audio', { recursive: true });
fs.writeFileSync('build/audio/lines.json', JSON.stringify({ lines: LINES, shortIds: SHORT_IDS }, null, 1));
console.log(`exported ${LINES.length} narration lines`);
