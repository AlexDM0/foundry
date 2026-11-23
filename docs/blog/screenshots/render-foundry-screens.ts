/* Writes Gaia's own fixture screens (synthetic data) as whole documents, the way its by-eye visual pass does. */
import { writeFileSync } from 'node:fs';
import { join }          from 'node:path';

import { HashRouter }                            from '../../../apps/gaia/page/shared/HashRouter.ts';
import { ARTBOARD_SCREENS, screenDocumentOf }    from '../../../apps/gaia/page/testing/ArtboardScreens.tsx';
import { FLEET_FIVE_FORGES_TRACKER_IDS }         from '../../../apps/gaia/page/testing/fixtures/fleet-five-forges.ts';

const outputFolder = process.argv[2];
if (outputFolder === undefined) throw new Error('Give the output folder.');

function artboardScreenOf(artboard: string) {
  const screen = ARTBOARD_SCREENS.find((candidate) => candidate.artboard === artboard);
  if (screen === undefined) throw new Error(`No screen paints artboard ${artboard}.`);
  return screen;
}

function storefrontBoardScreenOf(tab: 'kanban' | 'intake' | 'pipeline' | 'agents') {
  const forgeInPlace = artboardScreenOf('B1');
  const fragment = HashRouter.fragmentOf({ view: 'forge', trackerId: FLEET_FIVE_FORGES_TRACKER_IDS.exampleStorefront, boardRoute: { tab, item: null } });
  return { ...forgeInPlace, title: `A forge in place, ${tab}`, fragment };
}

const screensByKey = {
  'gaia-attention': artboardScreenOf('A1'),
  'gaia-forges':    artboardScreenOf('A4'),
  'board-kanban':   storefrontBoardScreenOf('kanban'),
  'board-intake':   storefrontBoardScreenOf('intake'),
  'board-pipeline': storefrontBoardScreenOf('pipeline'),
  'board-agents':   storefrontBoardScreenOf('agents'),
};

for (const [screenshotKey, screen] of Object.entries(screensByKey)) {
  for (const theme of ['light', 'dark'] as const) {
    const documentPath = join(outputFolder, `${screenshotKey}-${theme}.html`);
    writeFileSync(documentPath, screenDocumentOf(screen, theme));
    console.log(`${screenshotKey} ${theme}: ${screen.fragment}`);
  }
}
