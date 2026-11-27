/**
 * A forge in place at each version this Gaia, built for forge 3.1, meets: one it cannot talk to gets the versions notice in place of the board and no
 * control Gaia would send, an older one offering Update forge; an ahead forge keeps every control with a quiet version clause; a current forge
 * names no version.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandState }                                                             from '../../api/CommandSender.ts';
import type { ClockReading }                                                             from '../../shared/@types/ClockReading.ts';
import { FLEET_FIXTURES_READ_AT }                                                        from '../../testing/fixtures/fleet-five-forges.ts';
import { FLEET_VERSIONS, FLEET_VERSIONS_STATING_NO_VERSION, FLEET_VERSIONS_TRACKER_IDS } from '../../testing/fixtures/fleet-versions.ts';
import { ForgeModel }                                                                    from './ForgeModel.ts';

const TRACKER_IDS = FLEET_VERSIONS_TRACKER_IDS;

const CLOCK: ClockReading = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

const IDLE: CommandState = { onItsWay: null, failure: null, restartPending: false };

function contentOf(trackerId: string, fleetDocument = FLEET_VERSIONS) {
  return ForgeModel.forgeContentOf(trackerId, fleetDocument, CLOCK);
}

function barOf(trackerId: string, fleetDocument = FLEET_VERSIONS) {
  const { bar } = contentOf(trackerId, fleetDocument);
  if (bar === null) throw new Error('The forge has no bar.');
  return bar;
}

function lineTextOf(trackerId: string, fleetDocument = FLEET_VERSIONS): string {
  return barOf(trackerId, fleetDocument).status.line.map((segment) => segment.text).join('');
}

describe('the area under the bar of a forge Gaia cannot talk to', () => {
  test('holds the newer notice and the versions pair instead of the board', () => {
    const { area } = contentOf(TRACKER_IDS.analyticsSandbox);
    if (area.kind !== 'cannot-talk') throw new Error(`Analytics Sandbox shows ${area.kind}.`);
    expect(area.verdict).toBe('newer');
    expect(area.notice.word).toBe('Newer than this Gaia.');
    expect(area.notice.heading).toBe('This Gaia cannot show Analytics Sandbox in place');
    expect(area.pair.forgeName).toBe('Analytics Sandbox');
    expect(area.pair.verdict).toBe('newer');
  });

  test('holds the older notice, also for a forge that states no version', () => {
    const older = contentOf(TRACKER_IDS.exampleBilling).area;
    const statesNoVersion = contentOf(TRACKER_IDS.exampleDocs, FLEET_VERSIONS_STATING_NO_VERSION).area;
    if (older.kind !== 'cannot-talk' || statesNoVersion.kind !== 'cannot-talk') throw new Error('An older forge shows something else.');
    expect(older.notice.heading).toBe('Example Billing is older than this Gaia');
    expect(older.notice.sentence).toContain('and Example Billing is 1.8.');
    expect(statesNoVersion.verdict).toBe('older');
    expect(statesNoVersion.notice.sentence).toContain('and Example Docs states no version.');
  });

  test('shows the board of an ahead forge, which Gaia reads in full', () => {
    expect(contentOf(TRACKER_IDS.exampleStorefront).area.kind).toBe('board');
  });
});

describe('the bar at each verdict', () => {
  test('of a newer forge reads "Not readable", names its version in the line and both in the title', () => {
    const bar = barOf(TRACKER_IDS.analyticsSandbox);
    expect(bar.status.word).toBe('Not readable');
    expect(lineTextOf(TRACKER_IDS.analyticsSandbox)).toBe('forge 4.1 · newer than this Gaia, built for 3.1');
    expect(bar.status.line.filter((segment) => segment.look === 'version').map((segment) => segment.text)).toEqual(['4.1', '3.1']);
    expect(bar.status.text).toBe('Analytics Sandbox is forge 4.1 and serves clients built for forge 4.0 and later; this Gaia is built for forge 3.1, so they cannot talk.');
    expect(bar.pauseOrUnpause).toBeNull();
    expect(bar.stop).toBeNull();
    expect(bar.cannotTalk).toEqual({
      verdict:            'newer',
      unsentControls:     ['Pause', 'Stop'],
      unsentControlTitle: 'Analytics Sandbox serves clients built for forge 4.0 and later; this Gaia is built for forge 3.1.',
    });
  });

  test('of an older forge reads "Needs update" by the outdated dot and leaves only Stop unsent beside Update forge', () => {
    const bar = barOf(TRACKER_IDS.exampleBilling);
    expect(bar.status.condition).toBe('outdated');
    expect(bar.status.word).toBe('Needs update');
    expect(lineTextOf(TRACKER_IDS.exampleBilling)).toBe('forge 1.8 · older than this Gaia, built for 3.1');
    expect(bar.status.text).toBe('Example Billing is forge 1.8; this Gaia is built for forge 3.1, so they cannot talk until the forge is updated.');
    expect(bar.cannotTalk).toEqual({
      verdict:            'older',
      unsentControls:     ['Stop'],
      unsentControlTitle: 'Example Billing is forge 1.8; this Gaia is built for forge 3.1.',
    });
  });

  test('of a forge that states no version is older and says so', () => {
    expect(lineTextOf(TRACKER_IDS.exampleDocs, FLEET_VERSIONS_STATING_NO_VERSION)).toBe('states no version · older than this Gaia');
    expect(barOf(TRACKER_IDS.exampleDocs, FLEET_VERSIONS_STATING_NO_VERSION).cannotTalk?.verdict).toBe('older');
  });

  test('of an ahead forge keeps its condition and controls, and ends its line with the quiet version clause', () => {
    const bar = barOf(TRACKER_IDS.exampleStorefront);
    expect(bar.status.word).toBe('Live');
    expect(lineTextOf(TRACKER_IDS.exampleStorefront)).toBe('4 / 5 agents · 2 wait on you · forge 3.4, its newest parts only in its Bridge');
    expect(bar.status.text).toStartWith('Example Storefront is forge 3.4; this Gaia is built for 3.1.');
    expect(bar.cannotTalk).toBeNull();
    expect(bar.pauseOrUnpause?.label).toBe('Pause');
    expect(bar.stop).not.toBeNull();
  });

  test('of a current forge names no version', () => {
    expect(lineTextOf(TRACKER_IDS.invoiceService)).not.toContain('forge 3.1');
    expect(barOf(TRACKER_IDS.invoiceService).cannotTalk).toBeNull();
  });
});

describe('Update forge in the bar of an older forge', () => {
  const refused: CommandState = {
    ...IDLE,
    failure: {
      kind:   'forge-update',
      result: {
        verdict: 'answered',
        answer:  {
          answerVersion: 3, outcome: 'refused', refusal: 'repository-busy', text: 'Another forge command holds the repository.', forges: []
        }
      },
    },
  };

  test('is idle, pending while on its way, and done while the restart it left is pending', () => {
    expect(ForgeModel.updateStepOf(IDLE)).toEqual({ step: 'idle' });
    expect(ForgeModel.updateStepOf({ ...IDLE, onItsWay: 'forge-update' })).toEqual({ step: 'pending' });
    expect(ForgeModel.updateStepOf({ ...IDLE, restartPending: true })).toEqual({ step: 'done' });
  });

  test('a refusal carries the forge\'s code and sentence and its whole sentence for the title', () => {
    expect(ForgeModel.updateStepOf(refused)).toEqual({
      step:          'refused',
      lead:          'The forge refused Update: ',
      code:          'repository-busy',
      sentence:      'Another forge command holds the repository.',
      wholeSentence: 'The forge refused Update: repository-busy. Another forge command holds the repository.',
    });
  });

  test('a refused update shows in the bar and not under it as well, while any other refusal still shows under it', () => {
    expect(ForgeModel.barRefusalOf(TRACKER_IDS.exampleBilling, refused.failure, true)).toBeNull();
    expect(ForgeModel.barRefusalOf(TRACKER_IDS.exampleBilling, refused.failure, false)?.commandLabel).toBe('Update forge');
    expect(ForgeModel.barRefusalOf(TRACKER_IDS.exampleBilling, { kind: 'forge-pause', result: { verdict: 'server-unreachable' } }, true))
      .not.toBeNull();
  });
});
