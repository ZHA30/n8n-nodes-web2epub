import { readFile, writeFile } from 'node:fs/promises';

const css = await readFile(
	new URL('../assets/epub.css', import.meta.url),
	'utf8',
);
await writeFile(
	new URL('../nodes/shared/styles.ts', import.meta.url),
	'export const stylesheet = ' + JSON.stringify(css) + ';\n',
);
