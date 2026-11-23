// Writes Example Storefront's board in place under Gaia's bar, on its Kanban, Questions and Progress tabs, as whole documents that mount
// Gaia's real page root in headless Chrome; prints "name width height address" lines.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                    from 'node:path';

import { documentAround, SCREEN_THEMES } from '../apps/gaia/page/testing/ArtboardScreens.tsx';

const [outputFolder = ''] = process.argv.slice(2);
const SCREEN_WIDTH = 1600;
const SCREEN_HEIGHT = 1130;
const STOREFRONT_FRAGMENT = '#forge/example-storefront-7c41';

const BOARD_SCREENS = [
  { name: 'board-kanban', fragment: `${STOREFRONT_FRAGMENT}/kanban`, foldedDecisionIds: ['E2'] },
  { name: 'board-questions', fragment: `${STOREFRONT_FRAGMENT}/questions/E2`, foldedDecisionIds: [] },
  { name: 'board-progress', fragment: `${STOREFRONT_FRAGMENT}/progress`, foldedDecisionIds: ['E2'] },
];

const build = await Bun.build({
  entrypoints: [join(import.meta.dir, 'BoardScreenClient.tsx')],
  target:      'browser',
  define:      { 'process.env.NODE_ENV': '"production"' },
  minify:      false,
});
if (!build.success) {
  for (const log of build.logs) console.error(log);
  process.exit(1);
}
const [bundle] = build.outputs;
const bundleText = (await bundle?.text() ?? '').replaceAll('</script', '<\\/script');

mkdirSync(outputFolder, { recursive: true });
const lines: string[] = [];
for (const screen of BOARD_SCREENS) {
  for (const theme of SCREEN_THEMES) {
    const path = join(outputFolder, `${screen.name}-${theme}.html`);
    const foldScript = `<script>document.documentElement.dataset.foldedDecisions = ${JSON.stringify(JSON.stringify(screen.foldedDecisionIds))};</script>`;
    writeFileSync(path, documentAround(`${screen.name}, ${theme}`, theme, `<div id="gaia-root"></div>\n${foldScript}\n<script type="module">\n${bundleText}\n</script>`));
    lines.push(`${screen.name}-${theme} ${SCREEN_WIDTH} ${SCREEN_HEIGHT} file://${path}${screen.fragment}`);
  }
}
writeFileSync(join(outputFolder, 'board-list.txt'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
