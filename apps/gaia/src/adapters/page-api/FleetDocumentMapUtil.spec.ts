/**
 * The page sees the fleet only through this mapper. What matters: each internal fixture maps to exactly the page fixture of the same
 * artboards, the contract's version is stamped, a key the contract does not name never reaches the page, a value a forge did not
 * report stays `null` rather than becoming zero, a notice, warning, activity entry, brain sentence or brain move that names a command
 * reaches it in Gaia's words or not at all (D10) while a brain's refusal keeps the forge's sentence (decision 45), a forge's brain and a
 * running brain's row outside every limit reach it as the forge reports them, and a forge's system versions and their verdict as the
 * watch read them; an attention entry's monitor route, the forge's fragment read by the ingestion, reaches it as its board route.
 */
import { describe, expect, test } from 'bun:test';

import type { MonitorAttentionEntryDocument, MonitorSnapshotDocument } from 'forge-contracts/MonitorSnapshotDocument';

import { FLEET_AT_LIMIT }                                    from '../../../page/testing/fixtures/fleet-at-limit.ts';
import { FLEET_DEGRADED }                                    from '../../../page/testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                       from '../../../page/testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES }                                 from '../../../page/testing/fixtures/fleet-five-forges.ts';
import { FLEET_VERSIONS, FLEET_VERSIONS_STATING_NO_VERSION } from '../../../page/testing/fixtures/fleet-versions.ts';
import type { FleetSnapshot }                                from '../../shared/@types/FleetSnapshot.ts';
import type { ForgeBrain }                                   from '../../shared/@types/ForgeBrain.ts';
import { PAGE_CONTRACT_VERSIONS }                            from '../../shared/constants/PageContractVersions.ts';

import type { ForgeIdentity }                                                                   from '../forge-api/@types/ForgeDocumentReading.ts';
import { EXAMPLE_READ_STAMP, recordedDocumentOf, registryFactsOf }                              from '../forge-api/testing/ExampleForgeDocuments.ts';
import { ForgeReadingMapUtil }                                                                  from '../forge-api/utils/ForgeReadingMapUtil.ts';
import { FleetDocumentMapUtil }                                                                 from './FleetDocumentMapUtil.ts';
import { FLEET_SNAPSHOT_AT_LIMIT }                                                              from './testing/fleet-snapshot-at-limit.ts';
import { FLEET_SNAPSHOT_DEGRADED }                                                              from './testing/fleet-snapshot-degraded.ts';
import { FLEET_SNAPSHOT_EMPTY }                                                                 from './testing/fleet-snapshot-empty.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES, FLEET_SNAPSHOT_FIVE_FORGES_READINGS, servingFleetForgeOf } from './testing/fleet-snapshot-five-forges.ts';
import { FLEET_SNAPSHOT_VERSIONS, FLEET_SNAPSHOT_VERSIONS_STATING_NO_VERSION }                  from './testing/fleet-snapshot-versions.ts';

describe('the fleet document mapper', () => {
  test('maps the five-forges model to the fleet-five-forges document', () => {
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_FIVE_FORGES)).toStrictEqual(FLEET_FIVE_FORGES);
  });

  test('maps the at-limit, degraded and empty models to their documents', () => {
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_AT_LIMIT)).toStrictEqual(FLEET_AT_LIMIT);
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_DEGRADED)).toStrictEqual(FLEET_DEGRADED);
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_EMPTY)).toStrictEqual(FLEET_EMPTY);
  });

  test('maps the Versions boards\' models, a forge at each verdict and one that states no version, to their documents', () => {
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_VERSIONS)).toStrictEqual(FLEET_VERSIONS);
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_VERSIONS_STATING_NO_VERSION)).toStrictEqual(FLEET_VERSIONS_STATING_NO_VERSION);
  });

  test('an attention entry\'s monitor route becomes its board route', async () => {
    const storefront = FLEET_SNAPSHOT_FIVE_FORGES_READINGS.exampleStorefront;
    const storefrontFacts = registryFactsOf(storefront);
    const [item] = storefront.attention;
    if (item === undefined) throw new Error('the five-forges snapshot shows Example Storefront with nothing waiting');
    const { boardRoute: _boardRoute, ...entryFields } = item;
    const monitorEntries: MonitorAttentionEntryDocument[] = [
      { ...entryFields, route: '#kanban/ticket/001' } as MonitorAttentionEntryDocument,
      { ...entryFields, key: 'decision:E2', route: '#questions/E2' } as MonitorAttentionEntryDocument,
    ];
    const recordedSnapshot = await recordedDocumentOf('serving-every-contract', 'monitor', storefrontFacts.overseerUrl) as MonitorSnapshotDocument;
    const storefrontIdentity: ForgeIdentity = {
      trackerId: storefront.trackerId, project: storefront.project, codeVersion: 'example-code', installVersion: 42, processId: storefrontFacts.overseerProcessId, contracts: null,
    };
    const reading = ForgeReadingMapUtil.fullReadingOf({ ...recordedSnapshot, attention: monitorEntries }, storefrontFacts, storefrontIdentity, EXAMPLE_READ_STAMP);
    const fleetDocument = FleetDocumentMapUtil.fleetDocumentOf({ ...FLEET_SNAPSHOT_FIVE_FORGES, forges: [servingFleetForgeOf(reading)] });
    expect(fleetDocument.forges[0]?.attention.map(({ boardRoute }) => boardRoute)).toEqual([{ tab: 'kanban', item: 'ticket/001' }, { tab: 'questions', item: 'E2' }]);
  });

  test('stamps the fleet contract version it was built for', () => {
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_EMPTY).fleetVersion).toBe(PAGE_CONTRACT_VERSIONS.gaiaFleetDocument);
    expect(PAGE_CONTRACT_VERSIONS.gaiaFleetDocument).toBe(7);
  });

  test('leaves out a key of the internal model that the contract does not name', () => {
    const forgeWithAnInternalKey = { ...FLEET_SNAPSHOT_FIVE_FORGES.forges[0], tokenPath: '/Users/alexexample/.forge-monitor/private/token' };
    const snapshotWithAnInternalKey = { ...FLEET_SNAPSHOT_FIVE_FORGES, forges: [forgeWithAnInternalKey], internalOnly: true } as FleetSnapshot;
    const document = FleetDocumentMapUtil.fleetDocumentOf(snapshotWithAnInternalKey);
    expect(Object.hasOwn(document, 'internalOnly')).toBe(false);
    expect(JSON.stringify(document)).not.toContain('tokenPath');
  });

  test('carries a forge\'s system versions and their verdict to the page as the watch read them', () => {
    const [storefront] = FLEET_SNAPSHOT_FIVE_FORGES.forges;
    if (storefront === undefined) throw new Error('The five-forges model holds no forge.');
    const versions = { verdict: 'ahead', current: { major: 1, minor: 3 }, minimumSupported: { major: 1, minor: 0 } } as const;
    const document = FleetDocumentMapUtil.fleetDocumentOf({ ...FLEET_SNAPSHOT_FIVE_FORGES, forges: [{ ...storefront, versions }] });
    expect(document.forges[0]?.versions).toEqual(versions);
  });

  test('carries a forge that serves no versions as older with neither version, and one read without its versions as none', () => {
    const [storefront] = FLEET_SNAPSHOT_FIVE_FORGES.forges;
    if (storefront === undefined) throw new Error('The five-forges model holds no forge.');
    const noVersionsServed = { verdict: 'older', current: null, minimumSupported: null } as const;
    const forges = [{ ...storefront, versions: noVersionsServed }, { ...storefront, versions: null }];
    const document = FleetDocumentMapUtil.fleetDocumentOf({ ...FLEET_SNAPSHOT_FIVE_FORGES, forges });
    expect(document.forges.map((forge) => forge.versions)).toEqual([noVersionsServed, null]);
  });

  test('keeps what a counts-only forge does not report as null, not zero', () => {
    const document  = FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_DEGRADED);
    const countsOnly = document.forges.find((forge) => forge.fidelity === 'counts-only');
    expect(countsOnly?.concurrency).toBeNull();
    expect(countsOnly?.today).toBeNull();
    expect(countsOnly?.attentionCount).toBe(1);
    expect(countsOnly?.agents[0]?.calls).toBeNull();
    expect(countsOnly?.agents[0]?.callBudget).toBeNull();
    expect(countsOnly?.agents[0]?.quiet).toBeNull();
  });

  test('words a notice or a warning whose sentence names a command in Gaia\'s words, and passes the others through', () => {
    const [storefront] = FLEET_SNAPSHOT_FIVE_FORGES.forges;
    if (storefront === undefined) throw new Error('The five-forges model holds no forge.');
    const watcherNotice = { kind: 'watcher-endpoint-does-not-fit', text: 'job J1 is not launched: this platform cannot bind the Watcher endpoint' };
    const forge = {
      ...storefront,
      notices:  [{ kind: 'new-code', text: 'new code: run `forge update`' }, watcherNotice],
      warnings: [{ kind: 'forge-warning', text: 'The Baton pass failed: run `forge oversee restart`.' }],
    };
    const [document] = FleetDocumentMapUtil.fleetDocumentOf({ ...FLEET_SNAPSHOT_FIVE_FORGES, forges: [forge] }).forges;
    expect(document?.notices).toEqual([{ kind: 'new-code', text: 'New code is on disk. The Overseer runs the code it started with until it restarts.' }, watcherNotice]);
    expect(document?.warnings).toEqual([{ kind: 'forge-warning', text: 'This forge reports a warning that Gaia does not word yet.' }]);
  });

  test('words an Assistant that cannot come up in Gaia\'s words, and passes a failed Baton pass that names no command through with its kind', () => {
    const [storefront] = FLEET_SNAPSHOT_FIVE_FORGES.forges;
    if (storefront === undefined) throw new Error('The five-forges model holds no forge.');
    const batonPassFailed = { kind: 'baton-pass-failed', text: 'the Baton pass to code example-code failed at take-baton: Example error' };
    const forge = {
      ...storefront,
      notices:  [{ kind: 'assistant-down', text: 'no Assistant can come up: open incidents take their defaults' }],
      warnings: [batonPassFailed],
    };
    const [document] = FleetDocumentMapUtil.fleetDocumentOf({ ...FLEET_SNAPSHOT_FIVE_FORGES, forges: [forge] }).forges;
    expect(document?.notices).toEqual([{ kind: 'assistant-down', text: 'This forge\'s Assistant cannot come up, so its open incidents take their defaults.' }]);
    expect(document?.warnings).toEqual([batonPassFailed]);
  });

  test('carries the current usage window and its reset beside the limit hit', () => {
    const [storefront] = FLEET_SNAPSHOT_FIVE_FORGES.forges;
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_FIVE_FORGES).forges[0]?.usage).toEqual(storefront?.usage);
    expect(storefront?.usage?.currentWindowResetsAt).toBe('2026-11-12T16:00:00.000Z');
  });

  test('carries each forge\'s brain, a running brain\'s row outside every limit, and a brain not reported as not-reported', () => {
    const document = FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_FIVE_FORGES);
    const brains = document.forges.map((forge) => (forge.brain === 'not-reported' ? forge.brain : forge.brain.state));
    expect(brains).toEqual(['running', 'off', 'off', 'off', 'not-reported', 'not-reported']);
    expect(document.agents.filter((row) => !row.countsAgainstLimit).map((row) => `${row.trackerId} ${row.jobId} ${row.role ?? ''}`))
      .toEqual([`${FLEET_SNAPSHOT_FIVE_FORGES.forges[0]?.trackerId ?? ''} flint-brain brain`]);
  });

  test('leaves a brain\'s sentence that names a command for the page to word, passes the others through, and keeps its refusal\'s sentence unchanged', () => {
    const [storefront] = FLEET_SNAPSHOT_FIVE_FORGES.forges;
    const runningBrain = storefront?.brain;
    if (storefront === undefined || runningBrain === undefined || runningBrain === 'not-reported') throw new Error('The five-forges model shows no brain on its first forge.');
    const usageLimitSentence = 'Flint\'s brain cannot start while the usage limit holds. It resets at 14:00.';
    const brainOf = (brain: Partial<ForgeBrain>) => FleetDocumentMapUtil.fleetDocumentOf({
      ...FLEET_SNAPSHOT_FIVE_FORGES,
      forges: [{ ...storefront, brain: { ...runningBrain, ...brain } }],
    }).forges[0]?.brain;
    expect(brainOf({ state: 'refused', sentence: usageLimitSentence, refusal: { code: 'usage-limit-holds', sentence: usageLimitSentence } })).toMatchObject({
      sentence: usageLimitSentence,
      refusal:  { code: 'usage-limit-holds', sentence: usageLimitSentence },
    });
    const namingACommand = 'Flint\'s brain cannot start: run `forge update` first.';
    expect(brainOf({ state: 'refused', sentence: namingACommand, refusal: { code: 'example-new-refusal', sentence: namingACommand } })).toMatchObject({
      sentence: null,
      refusal:  { code: 'example-new-refusal', sentence: namingACommand },
    });
  });

  test('carries an ended brain\'s activity entry with its kind and tokens', () => {
    const [storefront] = FLEET_SNAPSHOT_FIVE_FORGES.forges;
    if (storefront === undefined) throw new Error('The five-forges model holds no forge.');
    const entry = {
      logPosition: 460,
      at:          '2026-11-12T13:18:00.000Z',
      category:    'agent',
      text:        'Flint\'s brain ran 2:00',
      boardRoute:  null,
      kind:        'flint-brain',
      tokens:      4200,
    } as const;
    const document = FleetDocumentMapUtil.fleetDocumentOf({ ...FLEET_SNAPSHOT_FIVE_FORGES, activity: [{ ...entry, trackerId: storefront.trackerId }] });
    expect(document.activity).toEqual([{ ...entry, trackerId: storefront.trackerId }]);
  });

  test('words an activity entry or a brain\'s move that names a command in Gaia\'s words, drops such an emote, and passes the others through', () => {
    const [storefront] = FLEET_SNAPSHOT_FIVE_FORGES.forges;
    const runningBrain = storefront?.brain;
    if (storefront === undefined || runningBrain === undefined || runningBrain === 'not-reported') throw new Error('The five-forges model shows no brain on its first forge.');
    const entryOf = (text: string) => ({
      logPosition: 461, at: '2026-11-12T13:19:00.000Z', category: 'forge', text, boardRoute: null, kind: null, tokens: null,
    } as const);
    const recentMoves = [
      { at: '2026-11-12T13:19:00.000Z', intent: 'run `forge merges`', emote: 'say forge update' },
      { at: '2026-11-12T13:18:00.000Z', intent: 'walk-to-column', emote: 'wave' },
    ];
    const forge = { ...storefront, activity: [entryOf('The Baton pass failed: run `forge oversee restart`.')], brain: { ...runningBrain, recentMoves } };
    const document = FleetDocumentMapUtil.fleetDocumentOf({
      ...FLEET_SNAPSHOT_FIVE_FORGES,
      forges:   [forge],
      activity: [{ ...entryOf('Flint\'s brain ran 2:00 after `forge stop`'), trackerId: storefront.trackerId }],
    });
    expect(document.activity.map((entry) => entry.text)).toEqual(['This forge logged an entry that Gaia does not word yet.']);
    expect(document.forges[0]?.activity.map((entry) => entry.text)).toEqual(['This forge logged an entry that Gaia does not word yet.']);
    const brain = document.forges[0]?.brain;
    expect(brain === 'not-reported' ? brain : brain?.recentMoves).toEqual([
      { at: '2026-11-12T13:19:00.000Z', intent: 'Flint\'s brain made a move that Gaia does not word yet.', emote: null },
      { at: '2026-11-12T13:18:00.000Z', intent: 'walk-to-column', emote: 'wave' },
    ]);
  });

  test('shares no array or object with the snapshot it was built from', () => {
    const document = FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_FIVE_FORGES);
    expect(document.forges[0]?.attention[0]?.ticketIds).not.toBe(FLEET_SNAPSHOT_FIVE_FORGES.forges[0]?.attention[0]?.ticketIds);
    expect(document.forges[0]?.contracts).not.toBe(FLEET_SNAPSHOT_FIVE_FORGES.forges[0]?.contracts);
    expect(document.settings.notifications.kinds).not.toBe(FLEET_SNAPSHOT_FIVE_FORGES.settings.notifications.kinds);
    expect(document.figures.incompleteFor).not.toBe(FLEET_SNAPSHOT_FIVE_FORGES.figures.incompleteFor);
  });
});
