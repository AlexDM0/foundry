/**
 * The Attention view in the shell, fed by the fleet source as Gaia's event stream feeds it. What matters (SCREENS A1 acceptance 2 and 4;
 * B3 acceptance 3; B4 acceptance 1): every change arrives as the next fleet document, with no reload: a new entry appears and a closed one
 * leaves; the held forge's callout leaves once the forge reports serving; an unreachable forge that answers again has its rows back to
 * normal; a forge that registers while no forge is shown replaces B4 with A1. Also: A1's page title carries the title, the lead and the
 * six figures, the waiting one marked, and keeps them with nothing waiting; B3 and B4 draw no figures there, and B4 no page title at all,
 * while a fleet whose every forge is hidden keeps it; ages are printed from the page's clock.
 *
 * `GaiaApp` is rendered with React's own server renderer, which runs the hooks without a document, so each spec reads the markup the page
 * would paint for the source's current document: Gaia's own markup and the text a reader sees in it, and a package part only whole, as the
 * package draws it for the props Gaia hands it.
 */
import { describe, expect, test } from 'bun:test';
import { Button }                 from 'design-system/Button';
import { renderToStaticMarkup }   from 'react-dom/server';

import type { FleetDocument, FleetDocumentFleetAttentionItem }                          from '../../@types/FleetDocument.ts';
import type { FleetStreamState }                                                        from '../../api/FleetStreamClient.ts';
import { createFleetSource, type FleetSource }                                          from '../../shell/FleetSource.ts';
import { GaiaApp }                                                                      from '../../shell/GaiaApp.tsx';
import { senderOver }                                                                   from '../../testing/CommandServer.ts';
import { ShellMarkup }                                                                  from '../../testing/ShellMarkup.tsx';
import { fixedPageClockAt, shellSurroundingsAt }                                        from '../../testing/ShellSurroundingsAt.ts';
import { FLEET_DEGRADED }                                                               from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                                                  from '../../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_READINGS, FLEET_FIVE_FORGES_TRACKER_IDS } from '../../testing/fixtures/fleet-five-forges.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const LIVE_STREAM = { state: (): FleetStreamState => 'live', subscribe: () => () => undefined };

const STOREFRONT_QUESTION_E5: FleetDocumentFleetAttentionItem = {
  key:                     'decision:E5',
  kind:                    'question',
  idText:                  'E5',
  ticketIds:               ['013'],
  subject:                 'Should zoom open on hover or on click?',
  jobId:                   'J4',
  askedBy:                 'J4',
  decisionKind:            null,
  escalatedFromIncidentId: null,
  metaText:                'asked by J4 builder',
  stamp:                   '2026-11-12T13:18:40.000Z',
  stampWord:               'opened',
  actionLabel:             'Answer',
  boardRoute:              { tab: 'questions', item: 'E5' },
  trackerId:               TRACKER_IDS.exampleStorefront,
};

function appAt(fleetSource: FleetSource, fragment = '#attention', clockStamp: string | null = null) {
  const surroundings = shellSurroundingsAt(fragment);
  return (
    <GaiaApp
      fleetSource={fleetSource}
      fleetStream={LIVE_STREAM}
      commandSender={senderOver([])}
      surroundings={clockStamp === null ? surroundings : { ...surroundings, clock: fixedPageClockAt(clockStamp) }}
    />
  );
}

function sourceHolding(fleetDocument: FleetDocument): FleetSource {
  const source = createFleetSource();
  source.publish(fleetDocument);
  return source;
}

/** The id a reader sees in each row's id cell, which ends where the row's text begins. */
function rowIdsIn(markup: string): string[] {
  return [...markup.matchAll(/<span class="gaia-attention-row-id">(.*?)<\/span>(?=<span class="gaia-attention-row-text">)/g)]
    .map(([, idMarkup = '']) => ShellMarkup.textIn(idMarkup));
}

/** Whether the held forge's callout is in the list of forges that need a look. */
function heldCalloutIn(markup: string): boolean {
  return markup.includes('<div class="gaia-attention-look" data-look-kind="launches-held"');
}

function staleRowCountIn(markup: string): number {
  return [...markup.matchAll(/class="gaia-attention-row" data-stale=""/g)].length;
}

describe('the view follows the fleet source, with no reload', () => {
  test('a new entry in a forge\'s snapshot appears in the list, and a closed one leaves', () => {
    const source = sourceHolding(FLEET_FIVE_FORGES);
    const app = appAt(source);
    expect(rowIdsIn(renderToStaticMarkup(app))).toEqual(['E4', '#015', 'E1', '#031', 'E2']);
    const withoutE1 = FLEET_FIVE_FORGES.attention.filter((item) => item.idText !== 'E1');
    source.publish({ ...FLEET_FIVE_FORGES, attention: [...withoutE1, STOREFRONT_QUESTION_E5] });
    expect(rowIdsIn(renderToStaticMarkup(app))).toEqual(['E4', '#015', '#031', 'E2', 'E5']);
  });

  test('the held forge\'s callout leaves once the forge reports serving', () => {
    const source = sourceHolding(FLEET_FIVE_FORGES);
    const app = appAt(source);
    expect(heldCalloutIn(renderToStaticMarkup(app))).toBe(true);
    source.publish({
      ...FLEET_FIVE_FORGES,
      forges:     FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.exampleMobileApp ? { ...forge, condition: 'live', notices: [] } : forge)),
      needsALook: FLEET_FIVE_FORGES.needsALook.filter((look) => look.trackerId !== TRACKER_IDS.exampleMobileApp),
    });
    const serving = renderToStaticMarkup(app);
    expect(heldCalloutIn(serving)).toBe(false);
    expect(serving).toContain('Forges that need a look · 1');
  });

  test('an unreachable forge that answers again has its rows back to normal and its banner gone', () => {
    const source = sourceHolding(FLEET_DEGRADED);
    const app = appAt(source);
    const unreachable = renderToStaticMarkup(app);
    expect(staleRowCountIn(unreachable)).toBe(2);
    expect(unreachable).toContain('Overseer unreachable: Invoice Service.');
    source.publish({
      ...FLEET_DEGRADED,
      forges:     FLEET_DEGRADED.forges.map((forge) => (forge.trackerId === TRACKER_IDS.invoiceService ? FLEET_FIVE_FORGES_READINGS.invoiceService : forge)),
      needsALook: FLEET_DEGRADED.needsALook.filter((look) => look.trackerId !== TRACKER_IDS.invoiceService),
    });
    const answered = renderToStaticMarkup(app);
    expect(staleRowCountIn(answered)).toBe(0);
    expect(answered).not.toContain('Overseer unreachable');
  });

  test('a forge that registers while no forge is shown replaces B4 with A1', () => {
    const source = sourceHolding(FLEET_EMPTY);
    const app = appAt(source);
    expect(renderToStaticMarkup(app)).toContain('Nothing waits on you, because no forge is registered.');
    source.publish(FLEET_FIVE_FORGES);
    const registered = renderToStaticMarkup(app);
    expect(registered).not.toContain('because no forge is registered');
    expect(rowIdsIn(registered)).toEqual(['E4', '#015', 'E1', '#031', 'E2']);
  });
});

/**
 * The figures the page title carries for this document, each marked where it waits on User, once the app's page title area is the
 * package's page head drawn whole for them; a page title area of anything else fails the spec.
 */
function pageTitleFiguresIn(markup: string, fleetDocument: FleetDocument): string[] {
  const { parts, markup: pageHead } = ShellMarkup.viewPageHeadAt('#attention', fleetDocument);
  expect(ShellMarkup.pageTitleAreaIn(markup)).toBe(pageHead);
  return parts.figures.map((figure) => `${figure.value} ${figure.label}${figure.attention === true ? ' (waits on you)' : ''}`);
}

describe('the page title and the clock', () => {
  test('A1\'s page title carries the title, the lead and the six figures stacked, the waiting one marked, and no button of its own', () => {
    const fleet = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES)));
    const { parts } = ShellMarkup.viewPageHeadAt('#attention', FLEET_FIVE_FORGES);
    expect([parts.title, parts.lead, parts.actions]).toEqual(['Attention', 'What waits on you across every forge, and the forges that need a look.', null]);
    expect(pageTitleFiguresIn(fleet, FLEET_FIVE_FORGES)).toEqual([
      '5 waiting on you (waits on you)',
      '10 / 12 agents',
      '11 tickets ready',
      '6 done today',
      '1.24M tokens today',
      '0 open incidents',
    ]);
    expect(fleet).not.toContain('class="gaia-attention-figures"');
  });

  test('with nothing waiting the page title keeps its six figures', () => {
    const nothingWaits = { ...FLEET_FIVE_FORGES, attention: [], figures: { ...FLEET_FIVE_FORGES.figures, waitingOnUser: 0 } };
    expect(pageTitleFiguresIn(renderToStaticMarkup(appAt(sourceHolding(nothingWaits))), nothingWaits)).toHaveLength(6);
  });

  test('B3 folds the figures into the main column and leaves the page title without them; B4 heads itself with no page title', () => {
    const degraded = renderToStaticMarkup(appAt(sourceHolding(FLEET_DEGRADED)));
    expect(ShellMarkup.viewPageHeadAt('#attention', FLEET_DEGRADED).parts.title).toBe('Attention');
    expect(pageTitleFiguresIn(degraded, FLEET_DEGRADED)).toEqual([]);
    expect(degraded).toContain('<div class="gaia-attention-figures" data-form="line">');
    const empty = renderToStaticMarkup(appAt(sourceHolding(FLEET_EMPTY)));
    expect(ShellMarkup.pageTitleAreaIn(empty)).toBeUndefined();
    const lookAgain = renderToStaticMarkup(<Button label="Look again" compact disabled={false} onPress={() => undefined} />);
    expect(empty).toContain(`<div class="gaia-attention-no-forge-actions">${lookAgain}</div>`);
  });

  test('a fleet whose every forge is hidden keeps the page title, as the fleet screen it is', () => {
    const everyForgeHidden = { ...FLEET_EMPTY, settings: { ...FLEET_EMPTY.settings, hiddenTrackerIds: [TRACKER_IDS.exampleStorefront] } };
    const { parts, markup: pageHead } = ShellMarkup.viewPageHeadAt('#attention', everyForgeHidden);
    expect(parts.title).toBe('Attention');
    expect(ShellMarkup.pageTitleAreaIn(renderToStaticMarkup(appAt(sourceHolding(everyForgeHidden))))).toBe(pageHead);
  });

  test('ages are printed from the page\'s clock', () => {
    const later = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), '#attention', '2026-11-12T14:19:30.000Z'));
    expect(later).toContain('asked by J3 builder · opened 1h 04m');
  });

  test('another view of the shell does not show Attention', () => {
    expect(rowIdsIn(renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), '#agents')))).toEqual([]);
  });
});
