/**
 * The page sees the fleet only through this mapper. What matters: each internal fixture maps to exactly the page fixture of the same
 * artboards, the contract's version is stamped, a key the contract does not name never reaches the page, a value a forge did not
 * report stays `null` rather than becoming zero, and a notice or warning whose sentence names a command reaches it in Gaia's words (D10).
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_AT_LIMIT }     from '../../../page/testing/fixtures/fleet-at-limit.ts';
import { FLEET_DEGRADED }     from '../../../page/testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }        from '../../../page/testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES }  from '../../../page/testing/fixtures/fleet-five-forges.ts';
import type { FleetSnapshot } from '../../shared/@types/FleetSnapshot.ts';
import { CONTRACT_VERSIONS }  from '../../shared/constants/ContractVersions.ts';

import { FleetDocumentMapUtil }       from './FleetDocumentMapUtil.ts';
import { FLEET_SNAPSHOT_AT_LIMIT }    from './testing/fleet-snapshot-at-limit.ts';
import { FLEET_SNAPSHOT_DEGRADED }    from './testing/fleet-snapshot-degraded.ts';
import { FLEET_SNAPSHOT_EMPTY }       from './testing/fleet-snapshot-empty.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES } from './testing/fleet-snapshot-five-forges.ts';

describe('the fleet document mapper', () => {
  test('maps the five-forges model to the fleet-five-forges document', () => {
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_FIVE_FORGES)).toStrictEqual(FLEET_FIVE_FORGES);
  });

  test('maps the at-limit, degraded and empty models to their documents', () => {
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_AT_LIMIT)).toStrictEqual(FLEET_AT_LIMIT);
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_DEGRADED)).toStrictEqual(FLEET_DEGRADED);
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_EMPTY)).toStrictEqual(FLEET_EMPTY);
  });

  test('stamps the fleet contract version it was built for', () => {
    expect(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_EMPTY).fleetVersion).toBe(CONTRACT_VERSIONS.gaiaFleetDocument);
    expect(CONTRACT_VERSIONS.gaiaFleetDocument).toBe(1);
  });

  test('leaves out a key of the internal model that the contract does not name', () => {
    const forgeWithAnInternalKey = { ...FLEET_SNAPSHOT_FIVE_FORGES.forges[0], tokenPath: '/Users/alexexample/.forge-monitor/watchers/token' };
    const snapshotWithAnInternalKey = { ...FLEET_SNAPSHOT_FIVE_FORGES, forges: [forgeWithAnInternalKey], internalOnly: true } as FleetSnapshot;
    const document = FleetDocumentMapUtil.fleetDocumentOf(snapshotWithAnInternalKey);
    expect(Object.hasOwn(document, 'internalOnly')).toBe(false);
    expect(JSON.stringify(document)).not.toContain('tokenPath');
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

  test('shares no array or object with the snapshot it was built from', () => {
    const document = FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_FIVE_FORGES);
    expect(document.forges[0]?.attention[0]?.ticketIds).not.toBe(FLEET_SNAPSHOT_FIVE_FORGES.forges[0]?.attention[0]?.ticketIds);
    expect(document.forges[0]?.contracts).not.toBe(FLEET_SNAPSHOT_FIVE_FORGES.forges[0]?.contracts);
    expect(document.settings.notifications.kinds).not.toBe(FLEET_SNAPSHOT_FIVE_FORGES.settings.notifications.kinds);
    expect(document.figures.incompleteFor).not.toBe(FLEET_SNAPSHOT_FIVE_FORGES.figures.incompleteFor);
  });
});
