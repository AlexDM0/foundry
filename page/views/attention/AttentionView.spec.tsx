/**
 * The Attention view in the shell, fed by the fleet source as Gaia's event stream feeds it. What matters (SCREENS A1 acceptance 2 and 4;
 * B3 acceptance 3; B4 acceptance 1): every change arrives as the next fleet document, with no reload: a new entry appears and a closed one
 * leaves; the held forge's callout leaves once the forge reports serving; an unreachable forge that answers again has its rows back to
 * normal; a forge that registers while no forge is shown replaces B4 with A1. Also: the top bar carries the view's status line, and B4 its
 * Look again; ages are printed from the page's clock.
 *
 * `GaiaApp` is rendered with React's own server renderer, which runs the hooks without a document, so each spec reads the markup the page
 * would paint for the source's current document.
 */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup }   from 'react-dom/server';

import type { FleetDocument, FleetDocumentFleetAttentionItem }                          from '../../@types/FleetDocument.ts';
import type { FleetStreamState }                                                        from '../../api/FleetStreamClient.ts';
import { createFleetSource, type FleetSource }                                          from '../../shell/FleetSource.ts';
import { GaiaApp }                                                                      from '../../shell/GaiaApp.tsx';
import { senderOver }                                                                   from '../../testing/CommandServer.ts';
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
  route:                   '#questions/E5',
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

function rowIdsIn(markup: string): string[] {
  return [...markup.matchAll(/class="gaia-attention-row-id">([^<]*)</g)].map(([, idText = '']) => idText);
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
    expect(renderToStaticMarkup(app)).toContain('>Update forge<');
    source.publish({
      ...FLEET_FIVE_FORGES,
      forges:     FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.exampleMobileApp ? { ...forge, condition: 'live', notices: [] } : forge)),
      needsALook: FLEET_FIVE_FORGES.needsALook.filter((look) => look.trackerId !== TRACKER_IDS.exampleMobileApp),
    });
    const serving = renderToStaticMarkup(app);
    expect(serving).not.toContain('>Update forge<');
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

describe('the top bar and the clock', () => {
  test('the top bar carries the view\'s status line; B4 adds Look again, A1 no button of its own', () => {
    const fleet = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES)));
    expect(fleet).toContain('4 forges running, 1 holds its launches · 1 dormant · 1 repository missing</span></span><span class="gaia-top-bar-actions"></span>');
    const empty = renderToStaticMarkup(appAt(sourceHolding(FLEET_EMPTY)));
    expect(empty).toMatch(/no forge on this machine yet<\/span><\/span><span class="gaia-top-bar-actions"><button[^>]*>Look again<\/button><\/span>/);
  });

  test('ages are printed from the page\'s clock', () => {
    const later = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), '#attention', '2026-11-12T14:19:30.000Z'));
    expect(later).toContain('asked by J3 builder · opened 1h 04m');
  });

  test('another view of the shell does not show Attention', () => {
    expect(rowIdsIn(renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), '#agents')))).toEqual([]);
  });
});
