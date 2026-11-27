/**
 * The rail of a fleet holding a forge with no pipeline, known by its "no pipeline" question (`checks-not-set`): that question counts
 * nowhere, the row says "Not set up yet" and offers Set up only while nothing else waits and Gaia can open its onboarding, and the forge
 * shown in place says where its setup stands as its board last reported it.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocument, FleetDocumentAttentionItem, FleetDocumentForge }    from '../@types/FleetDocument.ts';
import type { ClockReading }                                                     from '../shared/@types/ClockReading.ts';
import { DEFAULT_ROUTE }                                                         from '../shared/HashRouter.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_READINGS, FLEET_FIXTURES_READ_AT } from '../testing/fixtures/fleet-five-forges.ts';
import { FLEET_STOREFRONT_IN_SETUP }                                             from '../testing/fixtures/fleet-storefront-in-setup.ts';
import { FLEET_VERSIONS_FORGE_VERSIONS }                                         from '../testing/fixtures/fleet-versions.ts';
import { AttentionModel }                                                        from '../views/attention/AttentionModel.ts';
import { type OpenForgeSetup, RailModel }                                        from './RailModel.ts';

const STOREFRONT = FLEET_FIVE_FORGES_READINGS.exampleStorefront;

const [OTHER_ENTRY] = STOREFRONT.attention;

const NO_PIPELINE_QUESTION: FleetDocumentAttentionItem = {
  key:                     'decision:E1',
  kind:                    'question',
  idText:                  'E1',
  ticketIds:               [],
  subject:                 'No pipeline is set for this board',
  jobId:                   null,
  askedBy:                 null,
  decisionKind:            'checks-not-set',
  escalatedFromIncidentId: null,
  metaText:                null,
  stamp:                   '2026-11-12T11:00:00.000Z',
  stampWord:               'opened',
  actionLabel:             'Answer',
  boardRoute:              { tab: 'questions', item: 'E1' },
};

/** The fleet with only the storefront, holding the attention given, and the fleet's figure and list as Gaia's server would set them. */
function fleetWithStorefront(attention: readonly FleetDocumentAttentionItem[], changes: Partial<FleetDocumentForge> = {}): FleetDocument {
  const forge: FleetDocumentForge = { ...STOREFRONT, attention: [...attention], ...changes };
  return {
    ...FLEET_FIVE_FORGES,
    forges:    [forge],
    attention: attention.map((item) => ({ ...item, trackerId: forge.trackerId })),
    figures:   { ...FLEET_FIVE_FORGES.figures, waitingOnUser: attention.length, incompleteFor: [] },
  };
}

function storefrontRowOf(fleetDocument: FleetDocument, openForgeSetup: OpenForgeSetup | null = null) {
  const [row] = RailModel.railContentOf(fleetDocument, DEFAULT_ROUTE, openForgeSetup).forges;
  if (row === undefined) throw new Error('The rail has no forge row.');
  return { line: row.setupLine, offersSetUp: row.offersSetUp, count: row.count?.count ?? null };
}

function attentionCountOf(fleetDocument: FleetDocument): number | null {
  return RailModel.attentionCountOf(fleetDocument)?.count ?? null;
}

describe('a forge with no pipeline', () => {
  test('with nothing else waiting it says it is not set up yet and offers Set up, and Attention counts nothing', () => {
    const fleetDocument = fleetWithStorefront([NO_PIPELINE_QUESTION]);
    expect(storefrontRowOf(fleetDocument)).toEqual({ line: 'Not set up yet', offersSetUp: true, count: null });
    expect(attentionCountOf(fleetDocument)).toBeNull();
  });

  test('with something else waiting it keeps that count beside the line, and Attention counts only that', () => {
    if (OTHER_ENTRY === undefined) throw new Error('The storefront fixture waits on nothing.');
    const fleetDocument = fleetWithStorefront([NO_PIPELINE_QUESTION, OTHER_ENTRY]);
    expect(storefrontRowOf(fleetDocument)).toEqual({ line: 'Not set up yet', offersSetUp: false, count: 1 });
    expect(attentionCountOf(fleetDocument)).toBe(1);
  });

  test('an unreachable forge leaves the question out of its last-reported count too, and offers no Set up it cannot open', () => {
    const fleetDocument = fleetWithStorefront([NO_PIPELINE_QUESTION], { fidelity: 'unreachable', condition: 'unreachable' });
    expect(storefrontRowOf(fleetDocument)).toEqual({ line: 'Not set up yet', offersSetUp: false, count: null });
  });

  test('a forge at a version Gaia cannot talk to keeps the line and offers no Set up', () => {
    const older = fleetWithStorefront([NO_PIPELINE_QUESTION], { versions: FLEET_VERSIONS_FORGE_VERSIONS.older });
    const newer = fleetWithStorefront([NO_PIPELINE_QUESTION], { versions: FLEET_VERSIONS_FORGE_VERSIONS.newer });
    expect([storefrontRowOf(older), storefrontRowOf(newer)]).toEqual([
      { line: 'Not set up yet', offersSetUp: false, count: null },
      { line: 'Not set up yet', offersSetUp: false, count: null },
    ]);
  });

  test('a forge with a pipeline has no setup line and offers no Set up', () => {
    expect(storefrontRowOf(fleetWithStorefront([]))).toEqual({ line: null, offersSetUp: false, count: null });
  });
});

describe('the Attention view the count opens', () => {
  test('lists as many entries as the rail counts while a forge is in setup', () => {
    const clock: ClockReading = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };
    const screen = AttentionModel.screenOf(FLEET_STOREFRONT_IN_SETUP, clock);
    if (screen.kind !== 'fleet') throw new Error('Expected the fleet screen.');
    expect(screen.content.rows).toHaveLength(attentionCountOf(FLEET_STOREFRONT_IN_SETUP) ?? 0);
  });
});

describe('the forge shown in place', () => {
  const settingUp: OpenForgeSetup = { trackerId: STOREFRONT.trackerId, progress: { stage: 'setting-up', stepNumber: 3, stepCount: 6 } };

  test('says where its setup stands as its board reported it, and offers no Set up while it is under way', () => {
    expect(storefrontRowOf(fleetWithStorefront([NO_PIPELINE_QUESTION]), settingUp)).toEqual({ line: 'Setting up · step 3 of 6', offersSetUp: false, count: null });
  });

  test('another forge\'s report words nothing of this one', () => {
    expect(storefrontRowOf(fleetWithStorefront([NO_PIPELINE_QUESTION]), { ...settingUp, trackerId: 'example-other' }).line).toBe('Not set up yet');
  });

  test('a repeated report keeps the same object, a moved one replaces it, and only the forge\'s own null clears it', () => {
    const { trackerId } = settingUp;
    expect(RailModel.openForgeSetupAfterReport(settingUp, trackerId, { stage: 'setting-up', stepNumber: 3, stepCount: 6 })).toBe(settingUp);
    expect(RailModel.openForgeSetupAfterReport(settingUp, trackerId, { stage: 'setting-up', stepNumber: 4, stepCount: 6 }))
      .toEqual({ trackerId, progress: { stage: 'setting-up', stepNumber: 4, stepCount: 6 } });
    expect(RailModel.openForgeSetupAfterReport(settingUp, 'example-other', null)).toBe(settingUp);
    expect(RailModel.openForgeSetupAfterReport(settingUp, trackerId, null)).toBeNull();
  });
});
