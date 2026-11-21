/**
 * A forge in place laid out at a version this Gaia cannot talk to (the Versions boards' U3). What matters: a newer forge's bar shows Pause
 * and Stop disabled, each titled with both versions, and Open in new tab, with no Update forge; an older forge's bar shows Update forge as
 * its primary, then Stop disabled, and each step of the update in Update forge's place: the status while on its way, the pending restart
 * with Restart as the primary and a named dismiss, and the forge's refusal in one line, titled with its whole sentence, with Try again and
 * a named dismiss; the area under the bar holds the notice with its word, heading, sentence and versions pair, and no button.
 */
import { describe, expect, test } from 'bun:test';
import { IconButton }             from 'design-system/IconButton';

import type { CommandBody }                                              from '../../@types/CommandDocument.ts';
import { PackageButtons }                                                from '../../testing/PackageButtons.ts';
import { ReactElementTree }                                              from '../../testing/ReactElementTree.ts';
import { FLEET_FIXTURES_READ_AT }                                        from '../../testing/fixtures/fleet-five-forges.ts';
import { FLEET_VERSIONS, FLEET_VERSIONS_TRACKER_IDS }                    from '../../testing/fixtures/fleet-versions.ts';
import { ForgeBarControls, type ForgeBarControlsProps, ForgeAreaLayout } from './ForgeLayout.tsx';
import { type BarUpdateStep, type ForgeBar, ForgeModel }                 from './ForgeModel.ts';

const tree = ReactElementTree;

const TRACKER_IDS = FLEET_VERSIONS_TRACKER_IDS;

const CLOCK = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

const REFUSED: BarUpdateStep = {
  step:          'refused',
  lead:          'The forge refused Update: ',
  code:          'repository-busy',
  sentence:      'Another forge command holds the repository.',
  wholeSentence: 'The forge refused Update: repository-busy. Another forge command holds the repository.',
};

function contentOf(trackerId: string) {
  return ForgeModel.forgeContentOf(trackerId, FLEET_VERSIONS, CLOCK);
}

function barOf(trackerId: string): ForgeBar {
  const { bar } = contentOf(trackerId);
  if (bar === null) throw new Error('The forge has no bar.');
  return bar;
}

function controlsOf(trackerId: string, overrides: Partial<ForgeBarControlsProps> = {}) {
  const sent: CommandBody[] = [];
  const events: string[] = [];
  const props: ForgeBarControlsProps = {
    bar:               barOf(trackerId),
    brainShown:        null,
    commandIsOnItsWay: false,
    stopIsOpen:        false,
    stopAnchorRef:     { current: null },
    stopAgents:        'keep',
    onCommand:         (command) => sent.push(command),
    onOpenStop:        () => events.push('open stop'),
    onChooseStop:      () => events.push('choose stop'),
    onCancelStop:      () => events.push('cancel stop'),
    updateStep:        { step: 'idle' },
    onDismissUpdate:   () => events.push('dismiss update'),
    onOpenInNewTab:    () => events.push('open in new tab'),
    ...overrides,
  };
  return { unfolded: tree.unfolded(<ForgeBarControls {...props} />), sent, events };
}

function buttonsOf(unfolded: ReturnType<typeof tree.unfolded>): string[] {
  return PackageButtons.buttonsIn(unfolded).map((button) => [
    PackageButtons.labelOf(button),
    button.props['disabled'] === true ? ' (disabled)' : '',
    PackageButtons.emphasisOf(button) === 'primary' ? ' (primary)' : '',
  ].join(''));
}

function dismissIn(unfolded: ReturnType<typeof tree.unfolded>) {
  return tree.onlyHostElementIn(unfolded, tree.withComponent(IconButton));
}

describe('the bar of a newer forge', () => {
  test('shows Pause and Stop disabled, titled with both versions, and Open in new tab, with no Update forge', () => {
    const { unfolded } = controlsOf(TRACKER_IDS.analyticsSandbox);
    expect(buttonsOf(unfolded)).toEqual(['Pause (disabled)', 'Stop (disabled)', 'Open in new tab']);
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-forge-frame-unsent')).map((unsent) => unsent.props['title'])).toEqual([
      'Analytics Sandbox serves clients built for forge 4.0 and later; this Gaia is built for forge 3.1.',
      'Analytics Sandbox serves clients built for forge 4.0 and later; this Gaia is built for forge 3.1.',
    ]);
  });

  test('its Open in new tab opens Gaia\'s own route in a tab of its own and sends no command', () => {
    const newer = controlsOf(TRACKER_IDS.analyticsSandbox);
    PackageButtons.press(PackageButtons.onlyLabelled(newer.unfolded, 'Open in new tab'));
    expect([newer.sent, newer.events]).toEqual([[], ['open in new tab']]);
  });
});

describe('the bar of an older forge', () => {
  test('offers Update forge as its primary, then Stop disabled, and Update forge sends the forge\'s update', () => {
    const { unfolded, sent } = controlsOf(TRACKER_IDS.exampleBilling);
    expect(buttonsOf(unfolded)).toEqual(['Update forge (primary)', 'Stop (disabled)', 'Open in new tab']);
    PackageButtons.press(PackageButtons.onlyLabelled(unfolded, 'Update forge'));
    expect(sent).toEqual([{ kind: 'forge-update', trackerId: TRACKER_IDS.exampleBilling }]);
  });

  test('while the update is on its way says so in Update forge\'s place, every control waiting', () => {
    const { unfolded } = controlsOf(TRACKER_IDS.exampleBilling, { updateStep: { step: 'pending' }, commandIsOnItsWay: true });
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forge-frame-bar-note')])).toBe('Updating the forge…');
    expect(buttonsOf(unfolded)).toEqual(['Stop (disabled)', 'Open in new tab (disabled)']);
  });

  test('once done shows the pending restart with Restart as the primary, which restarts the forge, and a named dismiss', () => {
    const { unfolded, sent, events } = controlsOf(TRACKER_IDS.exampleBilling, { updateStep: { step: 'done' } });
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forge-frame-bar-restart')])).toBe('Updated; restart pending. Gaia reads it after the restart.');
    expect(buttonsOf(unfolded)).toEqual(['Restart (primary)', 'Stop (disabled)', 'Open in new tab']);
    PackageButtons.press(PackageButtons.onlyLabelled(unfolded, 'Restart'));
    const dismiss = dismissIn(unfolded);
    expect(dismiss.props['accessibleName']).toBe('Dismiss the pending restart');
    tree.dispatch(dismiss, 'onPress');
    expect(sent).toEqual([{ kind: 'forge-restart', trackerId: TRACKER_IDS.exampleBilling }]);
    expect(events).toEqual(['dismiss update']);
  });

  test('once refused shows the forge\'s code and sentence in one line, titled whole, with Try again and a named dismiss', () => {
    const { unfolded, sent, events } = controlsOf(TRACKER_IDS.exampleBilling, { updateStep: REFUSED });
    const refusal = tree.onlyWithClass(unfolded, 'gaia-forge-frame-bar-update-refusal');
    expect(refusal.props['role']).toBe('alert');
    expect(refusal.props['title']).toBe(REFUSED.wholeSentence);
    expect(tree.textOf([refusal])).toBe(REFUSED.wholeSentence);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forge-frame-bar-update-refusal-code')])).toBe('repository-busy');
    expect(buttonsOf(unfolded)).toEqual(['Try again', 'Stop (disabled)', 'Open in new tab']);
    PackageButtons.press(PackageButtons.onlyLabelled(unfolded, 'Try again'));
    const dismiss = dismissIn(unfolded);
    expect(dismiss.props['accessibleName']).toBe('Dismiss this refusal');
    tree.dispatch(dismiss, 'onPress');
    expect(sent).toEqual([{ kind: 'forge-update', trackerId: TRACKER_IDS.exampleBilling }]);
    expect(events).toEqual(['dismiss update']);
  });
});

describe('the area of a forge Gaia cannot talk to', () => {
  function areaOf(trackerId: string) {
    const { area } = contentOf(trackerId);
    if (area.kind === 'board') throw new Error('A forge Gaia cannot talk to shows its board.');
    return tree.unfolded(<ForgeAreaLayout area={area} />);
  }

  test('holds the newer notice and its versions pair, and no board and no way to open the forge\'s own Bridge', () => {
    const unfolded = areaOf(TRACKER_IDS.analyticsSandbox);
    expect(tree.onlyHostElementIn(unfolded, tree.withTag('section')).props['data-cannot-talk']).toBe('');
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forge-frame-versions-word')])).toBe('Newer than this Gaia.');
    expect(tree.textOf(unfolded)).toContain('This Gaia cannot show Analytics Sandbox in place');
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-versions-pair'))).toHaveLength(1);
    expect(buttonsOf(unfolded)).toEqual([]);
  });

  test('holds the older notice in the work ink, leaving Update forge to the bar', () => {
    const unfolded = areaOf(TRACKER_IDS.exampleBilling);
    const word = tree.onlyWithClass(unfolded, 'gaia-forge-frame-versions-word');
    expect(word.props['data-verdict']).toBe('older');
    expect(tree.textOf([word])).toBe('Older than this Gaia.');
    expect(tree.textOf(unfolded)).toContain('Example Billing is older than this Gaia');
    expect(buttonsOf(unfolded)).toEqual([]);
  });
});
