// Writes Gaia's real screens, painted from its fixtures, as whole documents for headless Chrome; prints "name width height address" lines.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                    from 'node:path';

const [gaiaFolder = '', outputFolder = ''] = process.argv.slice(2);
const screens = await import(join(gaiaFolder, 'page', 'testing', 'ArtboardScreens.tsx'));
mkdirSync(outputFolder, { recursive: true });
const wantedArtboards = ['A1', 'A2', 'A3', 'A4', 'B1'];
const lines: string[] = [];
for (const screen of screens.ARTBOARD_SCREENS) {
  if (!wantedArtboards.includes(screen.artboard)) continue;
  for (const theme of screens.SCREEN_THEMES) {
    const path = join(outputFolder, `${screen.artboard}-${theme}.html`);
    writeFileSync(path, screens.screenDocumentOf(screen, theme));
    lines.push(`${screen.artboard}-${theme} 1440 1016 file://${path}`);
  }
}
writeFileSync(join(outputFolder, 'list.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
