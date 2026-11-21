/**
 * The forge route's presence laid out from its model. What matters: the alert's Start sends the forge's start; each Resume and Resume all
 * send the resume of interrupted work and are disabled while a command to the forge is on its way; Show log asks for that log and a read log
 * shows in place of its button.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandBody }                                   from '../../@types/CommandDocument.ts';
import type { FleetDocumentForge }                            from '../../@types/FleetDocument.ts';
import { PackageButtons }                                     from '../../testing/PackageButtons.ts';
import { ReactElementTree }                                   from '../../testing/ReactElementTree.ts';
import { FLEET_FIVE_FORGES_READINGS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { type CrashLogOpening, ForgePresenceLayout }          from './ForgePresenceLayout.tsx';
import { ForgePresenceModel }                                 from './ForgePresenceModel.ts';

const CLOCK = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };
const STOREFRONT = FLEET_FIVE_FORGES_READINGS.exampleStorefront;

const FORGE: FleetDocumentForge = {
  ...STOREFRONT,
  presence:  { state: 'down', generation: 1, at: null },
  crashLogs: [{
    number: 1, generation: 1, component: 'hephaestus', suspected: false, recordedAt: FLEET_FIXTURES_READ_AT,
  }],
  waitingWork: [{
    jobId: 'J4', kind: 'build', ticketIds: ['004'], cause: 'network-outage', waitsFor: 'instruction',
  }],
};

function layoutOf(commandIsOnItsWay = false, openedCrashLogs: ReadonlyMap<number, CrashLogOpening> = new Map()) {
  const sent: CommandBody[] = [];
  const opened: number[] = [];
  const unfolded = ReactElementTree.unfolded(
    <ForgePresenceLayout
      project={FORGE.project}
      content={ForgePresenceModel.presenceContentOf(FORGE, CLOCK)}
      openedCrashLogs={openedCrashLogs}
      commandIsOnItsWay={commandIsOnItsWay}
      onCommand={(command) => sent.push(command)}
      onOpenCrashLog={(crashLogNumber) => opened.push(crashLogNumber)}
    />,
  );
  return { unfolded, sent, opened };
}

describe('the presence under the bar', () => {
  test('Start, Resume and Resume all send their commands', () => {
    const { unfolded, sent } = layoutOf();
    for (const label of ['Start', 'Resume', 'Resume all']) PackageButtons.press(PackageButtons.onlyLabelled(unfolded, label));
    expect(sent).toEqual([
      { kind: 'forge-start', trackerId: FORGE.trackerId },
      { kind: 'forge-interrupted-work-resume', trackerId: FORGE.trackerId, target: { jobId: 'J4' } },
      { kind: 'forge-interrupted-work-resume', trackerId: FORGE.trackerId, target: 'all' },
    ]);
  });

  test('disables every control while a command to the forge is on its way', () => {
    const { unfolded } = layoutOf(true);
    expect(['Start', 'Resume', 'Resume all'].map((label) => PackageButtons.onlyLabelled(unfolded, label).props['disabled'])).toEqual([true, true, true]);
  });

  test('Show log asks for that log, and a read log shows in place of its button', () => {
    const { unfolded, opened } = layoutOf();
    PackageButtons.press(PackageButtons.onlyLabelled(unfolded, 'Show log'));
    expect(opened).toEqual([1]);
    const shown = {
      heading: 'Crash log 1', errorLine: null, stack: null, activeJobs: null, logTail: ['Example log line.']
    };
    const read = layoutOf(false, new Map([[1, { phase: 'read', shown }]]));
    expect(PackageButtons.buttonsIn(read.unfolded).map(PackageButtons.labelOf)).not.toContain('Show log');
    expect(JSON.stringify(read.unfolded)).toContain('Example log line.');
  });
});
