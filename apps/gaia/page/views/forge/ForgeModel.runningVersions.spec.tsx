/**
 * The bar's second line (decision 31): the running and the newest Overseer and Talos, and a clean restart of each. What matters: a forge that
 * runs the installed code shows each running version and marks nothing; a newer installed Overseer, or a Talos whose protocol or code is
 * not the installed program's, marks that pair and restarts nothing; a forge with no Talos says so; Restart Overseer sends `forge-restart`
 * and Restart Talos `forge-talos-restart`, both enabled while the forge answers and waiting while a command to it is on its way; a forge
 * not answering shows no pair and both restarts disabled; and a forge Gaia cannot talk to has no such line.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandBody }                                      from '../../@types/CommandDocument.ts';
import type { FleetDocumentForge, FleetDocumentRunningVersions } from '../../@types/FleetDocument.ts';
import { PackageButtons }                                        from '../../testing/PackageButtons.ts';
import { ReactElementTree }                                      from '../../testing/ReactElementTree.ts';
import { FLEET_DEGRADED }                                        from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES_READINGS, FLEET_FIXTURES_READ_AT }    from '../../testing/fixtures/fleet-five-forges.ts';
import { FLEET_VERSIONS, FLEET_VERSIONS_TRACKER_IDS }            from '../../testing/fixtures/fleet-versions.ts';
import { RunningVersionsLine }                                   from './ForgeLayout.tsx';
import { type BarVersions, ForgeModel }                          from './ForgeModel.ts';

const CLOCK = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

const RUNNING_CODE = '3f9a2c1';
const INSTALLED_CODE = '7d4e1b0';

const RUNS_THE_INSTALLED_CODE: FleetDocumentRunningVersions = {
  overseerRunning: RUNNING_CODE,
  overseerNewest:  RUNNING_CODE,
  talosRunning:    { protocolVersion: 2, codeVersion: RUNNING_CODE },
  talosNewest:     2,
};

function storefrontWith(runningVersions: FleetDocumentRunningVersions | null): FleetDocumentForge {
  return { ...FLEET_FIVE_FORGES_READINGS.exampleStorefront, runningVersions };
}

function versionsOf(forge: FleetDocumentForge): BarVersions {
  const versions = ForgeModel.forgeContentOf(forge.trackerId, { ...FLEET_DEGRADED, forges: [forge] }, CLOCK).bar?.versions;
  if (versions === undefined || versions === null) throw new Error('The bar has no versions line.');
  return versions;
}

function lineTextOf(versions: BarVersions): string[] {
  return versions.pairs.map((pair) => pair.line.map((segment) => segment.text).join(''));
}

describe('the running and the newest versions', () => {
  test('a forge on the installed code shows each running version and marks neither pair', () => {
    const versions = versionsOf(storefrontWith(RUNS_THE_INSTALLED_CODE));
    expect(lineTextOf(versions)).toEqual([`Overseer ${RUNNING_CODE}`, `Talos protocol 2 · ${RUNNING_CODE}`]);
    expect(versions.pairs.map((pair) => pair.newerIsInstalled)).toEqual([false, false]);
  });

  test('a newer installed program marks the Overseer and the Talos that started from the older code, and names the newest', () => {
    const versions = versionsOf(storefrontWith({ ...RUNS_THE_INSTALLED_CODE, overseerNewest: INSTALLED_CODE }));
    expect(lineTextOf(versions)).toEqual([
      `Overseer ${RUNNING_CODE} · newer installed ${INSTALLED_CODE}`,
      `Talos protocol 2 · ${RUNNING_CODE} · newer installed protocol 2`,
    ]);
    expect(versions.pairs.map((pair) => pair.newerIsInstalled)).toEqual([true, true]);
    expect(versions.pairs[0]?.title).toContain('Restart Overseer');
  });

  test('a Talos of another protocol than the installed program starts is marked though the Overseer runs the installed code', () => {
    const versions = versionsOf(storefrontWith({ ...RUNS_THE_INSTALLED_CODE, talosNewest: 3 }));
    expect(versions.pairs.map((pair) => [pair.component, pair.newerIsInstalled])).toEqual([['Overseer', false], ['Talos', true]]);
    expect(lineTextOf(versions)[1]).toBe(`Talos protocol 2 · ${RUNNING_CODE} · newer installed protocol 3`);
  });

  test('an installed program not read yet marks nothing', () => {
    const versions = versionsOf(storefrontWith({ ...RUNS_THE_INSTALLED_CODE, overseerNewest: null, talosNewest: null }));
    expect(versions.pairs.map((pair) => pair.newerIsInstalled)).toEqual([false, false]);
  });

  test('a forge with no Talos running says so', () => {
    const versions = versionsOf(storefrontWith({ ...RUNS_THE_INSTALLED_CODE, talosRunning: null }));
    expect(lineTextOf(versions)[1]).toBe('Talos not running');
    expect(versions.pairs[1]?.newerIsInstalled).toBe(false);
  });

  test('a forge not answering shows no pair, and a forge Gaia cannot talk to has no line', () => {
    expect(versionsOf(storefrontWith(null)).pairs).toEqual([]);
    const forgeOfANewerSystem = FLEET_VERSIONS_TRACKER_IDS.analyticsSandbox;
    expect(ForgeModel.forgeContentOf(forgeOfANewerSystem, FLEET_VERSIONS, CLOCK).bar?.versions).toBeNull();
  });
});

describe('the restarts', () => {
  function lineOf(versions: BarVersions, commandIsOnItsWay = false) {
    const sent: CommandBody[] = [];
    const unfolded = ReactElementTree.unfolded(<RunningVersionsLine versions={versions} commandIsOnItsWay={commandIsOnItsWay} onCommand={(command) => sent.push(command)} />);
    return { buttons: PackageButtons.buttonsIn(unfolded), sent };
  }

  test('Restart Overseer sends a Baton pass and Restart Talos the clean quit, each for this forge, while the forge answers', () => {
    const { buttons, sent } = lineOf(versionsOf(storefrontWith(RUNS_THE_INSTALLED_CODE)));
    expect(buttons.map((button) => [PackageButtons.labelOf(button), button.props['disabled']])).toEqual([['Restart Overseer', false], ['Restart Talos', false]]);
    for (const button of buttons) PackageButtons.press(button);
    const { trackerId } = FLEET_FIVE_FORGES_READINGS.exampleStorefront;
    expect(sent).toEqual([{ kind: 'forge-restart', trackerId }, { kind: 'forge-talos-restart', trackerId }]);
  });

  test('both wait while a command to the forge is on its way, and are disabled for a forge not answering', () => {
    expect(lineOf(versionsOf(storefrontWith(RUNS_THE_INSTALLED_CODE)), true).buttons.map((button) => button.props['disabled'])).toEqual([true, true]);
    expect(lineOf(versionsOf(storefrontWith(null))).buttons.map((button) => button.props['disabled'])).toEqual([true, true]);
  });
});
