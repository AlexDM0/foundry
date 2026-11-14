/**
 * The rail's model, on the four fleet fixtures. What matters (SCREENS "The shell", acceptance 1): each count is the fleet document's own
 * figure for its row: Attention is `figures.waitingOnUser`, with `+` when a forge cannot vouch for it; Agents counts the job rows, never a
 * running brain's (shell acceptance 2: 10 with the brain running on Example Storefront); Forges and the forge rows count and list the forges
 * not hidden, in registry order. A count the document does not hold is absent, never 0.
 * Also: each condition's dot, where a forge row leads, the line that says no forge is registered only when the registry holds none, and
 * this machine's line at, under and without a limit.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocument }                               from '../@types/FleetDocument.ts';
import { FLEET_AT_LIMIT }                                   from '../testing/fixtures/fleet-at-limit.ts';
import { FLEET_DEGRADED }                                   from '../testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                      from '../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS } from '../testing/fixtures/fleet-five-forges.ts';
import { DEFAULT_ROUTE }                                    from './HashRouter.ts';
import { type RailContent, RailModel }                      from './RailModel.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const FIXTURES: readonly (readonly [name: string, fleetDocument: FleetDocument])[] = [
  ['fleet-five-forges', FLEET_FIVE_FORGES],
  ['fleet-degraded', FLEET_DEGRADED],
  ['fleet-empty', FLEET_EMPTY],
  ['fleet-at-limit', FLEET_AT_LIMIT],
];

function viewCountsOf(content: RailContent): Record<string, string | null> {
  return Object.fromEntries(content.views.map((row) => [row.view, row.count?.text ?? null]));
}

function forgeRowsOf(content: RailContent): [project: string, condition: string, count: string | null, href: string][] {
  return content.forges.map((row) => [row.project, row.condition, row.count?.text ?? null, row.href]);
}

describe('each rail count is the fleet document\'s figure for its row', () => {
  for (const [name, fleetDocument] of FIXTURES) {
    test(`on ${name}`, () => {
      const content = RailModel.railContentOf(fleetDocument, DEFAULT_ROUTE);
      const { waitingOnUser, incompleteFor } = fleetDocument.figures;
      const attentionFigure = waitingOnUser === 0 && incompleteFor.length === 0 ? null : `${waitingOnUser}${incompleteFor.length > 0 ? '+' : ''}`;
      expect(viewCountsOf(content)).toEqual({
        attention: attentionFigure,
        agents:    String(fleetDocument.agents.filter((row) => row.countsAgainstLimit).length),
        activity:  null,
        forges:    String(fleetDocument.forges.length),
      });
      expect(content.forges.map((row) => row.trackerId)).toEqual(fleetDocument.forges.map((forge) => forge.trackerId));
      expect(content.forges.map((row) => row.count?.text.replace('?', '') ?? '0')).toEqual(fleetDocument.forges.map((forge) => String(
        forge.fidelity === 'counts-only' ? forge.attentionCount ?? 0 : forge.attention.length,
      )));
    });
  }
});

describe('the rail of artboard A1', () => {
  test('Attention 5, Agents 10, Forges 6, and each forge with its dot, its count and where it leads', () => {
    const content = RailModel.railContentOf(FLEET_FIVE_FORGES, DEFAULT_ROUTE);
    expect(viewCountsOf(content)).toEqual({
      attention: '5', agents: '10', activity: null, forges: '6'
    });
    expect(forgeRowsOf(content)).toEqual([
      ['Example Storefront', 'live', '2', `#forge/${TRACKER_IDS.exampleStorefront}`],
      ['Invoice Service', 'live', '2', `#forge/${TRACKER_IDS.invoiceService}`],
      ['Research Wiki', 'live', '1', `#forge/${TRACKER_IDS.researchWiki}`],
      ['Example Mobile App', 'held', null, `#forge/${TRACKER_IDS.exampleMobileApp}`],
      ['Design System', 'dormant', null, `#forges?forge=${TRACKER_IDS.designSystem}`],
      ['Legacy Importer', 'missing', null, `#forges?forge=${TRACKER_IDS.legacyImporter}`],
    ]);
    expect(content.forges.every((row) => row.count === null || row.count.tone === 'attention')).toBe(true);
  });

  test('this machine reads 10 / 12 agents, a meter of 10 of 12, and the limit against the CPUs', () => {
    expect(RailModel.railContentOf(FLEET_FIVE_FORGES, DEFAULT_ROUTE).machine).toEqual({
      agentsText:   '10 / 12',
      meter:        { used: 10, whole: 12, label: '10 of 12 agents' },
      limitLine:    'limit 12 of 12 CPUs',
      isAtTheLimit: false,
    });
  });
});

describe('a fleet Gaia cannot fully read (B3)', () => {
  test('Attention reads 4+, an unreachable forge\'s count is marked as last reported, and a counts-only forge gives its count', () => {
    const content = RailModel.railContentOf(FLEET_DEGRADED, DEFAULT_ROUTE);
    expect(viewCountsOf(content)['attention']).toBe('4+');
    expect(content.forges.map((row) => [row.project, row.condition, row.count])).toEqual([
      ['Example Storefront', 'live', { text: '2', tone: 'attention' }],
      ['Invoice Service', 'unreachable', { text: '2?', tone: 'muted' }],
      ['Research Wiki', 'live', { text: '1', tone: 'attention' }],
      ['Example Mobile App', 'held', null],
      ['Analytics Sandbox', 'unreadable', null],
    ]);
  });

  test('an unreachable forge still opens in place; a counts-only one and a newer one open at their Forges row', () => {
    const hrefs = RailModel.railContentOf(FLEET_DEGRADED, DEFAULT_ROUTE).forges.map((row) => row.href);
    expect(hrefs).toEqual([
      `#forge/${TRACKER_IDS.exampleStorefront}`,
      `#forge/${TRACKER_IDS.invoiceService}`,
      `#forges?forge=${TRACKER_IDS.researchWiki}`,
      `#forge/${TRACKER_IDS.exampleMobileApp}`,
      '#forges?forge=analytics-sandbox-4d18',
    ]);
  });
});

describe('the counts that are absent', () => {
  test('before the first document no view has a count, no forge is listed and this machine is not shown', () => {
    const content = RailModel.railContentOf(null, DEFAULT_ROUTE);
    expect(viewCountsOf(content)).toEqual({
      attention: null, agents: null, activity: null, forges: null
    });
    expect(content.forges).toEqual([]);
    expect(content.noForgeLine).toBeNull();
    expect(content.machine).toBeNull();
  });

  test('with no forge (B4) Attention has no count, Agents and Forges read 0, and an unknown limit draws no meter', () => {
    const content = RailModel.railContentOf(FLEET_EMPTY, DEFAULT_ROUTE);
    expect(viewCountsOf(content)).toEqual({
      attention: null, agents: '0', activity: null, forges: '0'
    });
    expect(content.machine).toEqual({
      agentsText: '0', meter: null, limitLine: 'no limit known · 12 CPUs', isAtTheLimit: false
    });
  });

  test('with no forge (B4) the forges\' group says no forge is registered; with one, it lists the forge and says nothing of the kind', () => {
    expect(RailModel.railContentOf(FLEET_EMPTY, DEFAULT_ROUTE).noForgeLine).toBe('No forge is registered.');
    expect(RailModel.railContentOf(FLEET_FIVE_FORGES, DEFAULT_ROUTE).noForgeLine).toBeNull();
  });

  test('a registry whose every forge is hidden lists no forge, yet does not say none is registered', () => {
    const everyForgeHidden: FleetDocument = {
      ...FLEET_FIVE_FORGES,
      settings: { ...FLEET_FIVE_FORGES.settings, hiddenTrackerIds: FLEET_FIVE_FORGES.forges.map((forge) => forge.trackerId) },
    };
    const content = RailModel.railContentOf(everyForgeHidden, DEFAULT_ROUTE);
    expect([content.forges, content.noForgeLine]).toEqual([[], null]);
  });

  test('a hidden forge is neither counted nor listed, even when a document still carries it', () => {
    const withHidden: FleetDocument = { ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, hiddenTrackerIds: [TRACKER_IDS.legacyImporter] } };
    const content = RailModel.railContentOf(withHidden, DEFAULT_ROUTE);
    expect(viewCountsOf(content)['forges']).toBe('5');
    expect(content.forges.map((row) => row.trackerId)).not.toContain(TRACKER_IDS.legacyImporter);
  });
});

describe('this machine at its limit (B2)', () => {
  test('the line says the limit is reached and how many tickets wait, and the meter is full', () => {
    expect(RailModel.railContentOf(FLEET_AT_LIMIT, DEFAULT_ROUTE).machine).toEqual({
      agentsText:   '10 / 10',
      meter:        { used: 10, whole: 10, label: '10 of 10 agents' },
      limitLine:    'at the limit · 3 tickets wait',
      isAtTheLimit: true,
    });
  });

  test('one waiting ticket is singular, and none leaves only the limit', () => {
    const lineWith = (ticketsWaitingForMachineSlot: number | null) => RailModel.railContentOf({
      ...FLEET_AT_LIMIT,
      machine: { ...FLEET_AT_LIMIT.machine, ticketsWaitingForMachineSlot },
    }, DEFAULT_ROUTE).machine?.limitLine;
    expect([lineWith(1), lineWith(0), lineWith(null)]).toEqual(['at the limit · 1 ticket waits', 'at the limit', 'at the limit']);
  });
});

describe('the current row', () => {
  test('a view\'s route marks its row, and a forge in place marks that forge\'s row and no view', () => {
    const onAgents = RailModel.railContentOf(FLEET_FIVE_FORGES, { view: 'agents', selectedAgent: { trackerId: TRACKER_IDS.invoiceService, jobId: 'J12' }, query: '' });
    expect(onAgents.views.filter((row) => row.isCurrent).map((row) => row.view)).toEqual(['agents']);
    expect(onAgents.forges.some((row) => row.isCurrent)).toBe(false);
    const inPlace = RailModel.railContentOf(FLEET_FIVE_FORGES, { view: 'forge', trackerId: TRACKER_IDS.invoiceService, bridgeFragment: '#questions/E4' });
    expect(inPlace.views.some((row) => row.isCurrent)).toBe(false);
    expect(inPlace.forges.filter((row) => row.isCurrent).map((row) => row.project)).toEqual(['Invoice Service']);
  });

  test('a forge passing the baton shows the ring of a forge on its way', () => {
    const [storefront] = FLEET_FIVE_FORGES.forges;
    if (storefront === undefined) throw new Error('The fixture holds no forge.');
    const passing: FleetDocument = { ...FLEET_FIVE_FORGES, forges: [{ ...storefront, condition: 'passing-baton' }] };
    expect(RailModel.railContentOf(passing, DEFAULT_ROUTE).forges.map((row) => row.condition)).toEqual(['starting']);
  });
});
