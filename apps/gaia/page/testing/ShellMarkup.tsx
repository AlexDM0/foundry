/**
 * Test-only: reads the shell's server-rendered markup by Gaia's own elements. The page title area holds the package's page head, which a
 * spec compares whole against the page head drawn for the props the shell hands it, so no spec reads the markup the package draws.
 */
import { renderToStaticMarkup } from 'react-dom/server';

import type { FleetDocument }      from '../@types/FleetDocument.ts';
import { CommandSenderContext }    from '../api/CommandSender.ts';
import { PageHead }                from '../lib/design-system/DesignSystemInterface.ts';
import { HashRouter }              from '../shared/HashRouter.ts';
import { FigureLookUtil }          from '../shared/utils/FigureLookUtil.ts';
import { viewPartsOf }             from '../shell/GaiaApp.tsx';
import { senderOver }              from './CommandServer.ts';
import { forgeViewSurroundingsAt } from './ShellSurroundingsAt.ts';
import { FLEET_FIXTURES_READ_AT }  from './fixtures/fleet-five-forges.ts';

/** The page title area ends where the connection banner or the view begins. */
const PAGE_TITLE_AREA = /<div class="gaia-shell-page-title">(.*?)<\/div>(?=<div class="gaia-(?:connection-banner|shell-view)">)/;

const MARKUP_TAG = /<[^>]*>/g;

const ESCAPED_CHARACTERS: Readonly<Record<string, string>> = {
  '&amp;':  '&',
  '&lt;':   '<',
  '&gt;':   '>',
  '&quot;': '"',
  '&#x27;': '\'',
};

export const ShellMarkup = {
  /** What the page title area holds; `undefined` for a view that heads itself. */
  pageTitleAreaIn(markup: string): string | undefined {
    return PAGE_TITLE_AREA.exec(markup)?.[1];
  },

  /** The view's parts at a fragment, read at the fixtures' moment, and the package's page head drawn whole for them as the shell draws it. */
  viewPageHeadAt(fragment: string, fleetDocument: FleetDocument | null) {
    const parts = viewPartsOf(HashRouter.routeOf(fragment), fleetDocument, {
      readAtMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT),
      timeZone:           'UTC',
      goTo:               () => undefined,
      forgeView:          forgeViewSurroundingsAt(),
    });
    const figures = FigureLookUtil.pageHeadFiguresOf(parts.figures);
    const markup = parts.title === null ? undefined : renderToStaticMarkup(
      <CommandSenderContext value={senderOver([])}>
        <PageHead title={parts.title} lead={parts.lead} figures={figures} {...(parts.actions === null ? {} : { actions: parts.actions })} />
      </CommandSenderContext>,
    );
    return { parts, figures, markup };
  },

  /** The text a reader sees in a stretch of markup, its tags left out and its escaped characters read back. */
  textIn(markup: string): string {
    return markup.replace(MARKUP_TAG, '').replace(/&(?:amp|lt|gt|quot|#x27);/g, (escaped) => ESCAPED_CHARACTERS[escaped] ?? escaped);
  },
} as const;
