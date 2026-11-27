/**
 * A forge in place laid out from its model: the bar's controls as the condition allows, Stop's question and the `forge-stop` it sends, every
 * control disabled while a command is on its way, refusals with Try again only where resendable, and why the area shows no board when it shows none.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandBody }        from '../../@types/CommandDocument.ts';
import type { FleetDocumentForge } from '../../@types/FleetDocument.ts';
import {
  type ChoiceOptionProps,
  ConfirmStrip,
  MonoId,
  Popover
} from '../../lib/design-system/DesignSystemInterface.ts';
import { FailedActions }                                      from '../../testing/FailedActions.ts';
import { PackageButtons }                                     from '../../testing/PackageButtons.ts';
import { type HostElement, ReactElementTree }                 from '../../testing/ReactElementTree.ts';
import { FLEET_DEGRADED }                                     from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES_READINGS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import {
  BarRefusalLine,
  ForgeBarControls,
  type ForgeAreaProps,
  ForgeAreaLayout,
  type ForgeBarControlsProps,
} from './ForgeLayout.tsx';
import { type ForgeBar, ForgeModel } from './ForgeModel.ts';

const tree = ReactElementTree;

const READINGS = FLEET_FIVE_FORGES_READINGS;

const CLOCK = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

const STOREFRONT: FleetDocumentForge = { ...READINGS.exampleStorefront };

function barOf(forge = STOREFRONT): ForgeBar {
  const { bar } = ForgeModel.forgeContentOf(forge.trackerId, { ...FLEET_DEGRADED, forges: [forge] }, CLOCK);
  if (bar === null) throw new Error('The forge has no bar.');
  return bar;
}

function controlsOf(overrides: Partial<ForgeBarControlsProps> = {}) {
  const sent: CommandBody[] = [];
  const events: string[] = [];
  const bar = overrides.bar ?? barOf();
  const props: ForgeBarControlsProps = {
    bar,
    commandIsOnItsWay: false,
    stopIsOpen:        false,
    stopAnchorRef:     { current: null },
    stopAgents:        'keep',
    onCommand:         (command) => sent.push(command),
    onOpenStop:        () => events.push('open stop'),
    onChooseStop:      (agents) => events.push(`choose ${agents}`),
    onCancelStop:      () => events.push('cancel stop'),
    updateStep:        { step: 'idle' },
    onDismissUpdate:   () => events.push('dismiss update'),
    onOpenInNewTab:    () => events.push('open in new tab'),
    ...overrides,
  };
  return { unfolded: tree.unfolded(<ForgeBarControls {...props} />), sent, events };
}

function choicesIn(popover: HostElement): ChoiceOptionProps[] {
  return tree.hostElementsIn([popover], tree.withTag('ChoiceOption')).map((choice) => choice.props as unknown as ChoiceOptionProps);
}

function buttonsIn(nodes: ReturnType<typeof tree.unfolded>): HostElement[] {
  return PackageButtons.buttonsIn(nodes);
}

function buttonNamed(nodes: ReturnType<typeof tree.unfolded>, name: string): HostElement {
  return tree.onlyHostElementIn(nodes, (element) => PackageButtons.isButton(element) && (PackageButtons.labelOf(element) === name || PackageButtons.nameOf(element) === name));
}

describe('the bar\'s controls', () => {
  test('a live forge shows Pause, Stop and Open in new tab, each enabled, and none primary', () => {
    const { unfolded } = controlsOf();
    expect(buttonsIn(unfolded).map(PackageButtons.labelOf)).toEqual(['Pause', 'Stop', 'Open in new tab']);
    expect(buttonsIn(unfolded).map((button) => [button.props['disabled'], PackageButtons.emphasisOf(button)])).toEqual([
      [false, 'quiet'], [false, 'quiet'], [false, 'quiet'],
    ]);
  });

  test('a paused forge shows Unpause as the primary button, and Pause sends the forge\'s pause', () => {
    const paused = controlsOf({ bar: barOf({ ...STOREFRONT, condition: 'paused' }) });
    expect(PackageButtons.emphasisOf(buttonNamed(paused.unfolded, 'Unpause'))).toBe('primary');
    const live = controlsOf();
    PackageButtons.press(buttonNamed(live.unfolded, 'Pause'));
    expect(live.sent).toEqual([{ kind: 'forge-pause', trackerId: STOREFRONT.trackerId }]);
  });

  test('Open in new tab opens the board\'s route in a tab of its own and sends no command', () => {
    const live = controlsOf();
    PackageButtons.press(buttonNamed(live.unfolded, 'Open in new tab'));
    expect([live.sent, live.events]).toEqual([[], ['open in new tab']]);
  });

  test('while a command to the forge is on its way, every control of the bar is disabled', () => {
    const { unfolded } = controlsOf({ commandIsOnItsWay: true });
    expect(buttonsIn(unfolded).map((button) => button.props['disabled'])).toEqual([true, true, true]);
  });

  test('a forge whose control contract Gaia does not know keeps only Open in new tab', () => {
    const newerControl = { ...STOREFRONT, contracts: { ...STOREFRONT.contracts, control: 4 } };
    const { unfolded } = controlsOf({ bar: barOf(newerControl), stopIsOpen: true });
    expect(buttonsIn(unfolded).map((button) => [PackageButtons.labelOf(button), button.props['disabled']])).toEqual([
      ['Pause', true], ['Stop', true], ['Open in new tab', false],
    ]);
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-forge-frame-stop-popover'))).toEqual([]);
  });

  test('Stop opens its question rather than stopping', () => {
    const { unfolded, sent, events } = controlsOf();
    PackageButtons.press(buttonNamed(unfolded, 'Stop'));
    expect(events).toEqual(['open stop']);
    expect(sent).toEqual([]);
  });
});

describe('the Stop question as a popover under its button (B2)', () => {
  test('asks about the forge, offers both choices with "Stop Hephaestus only" chosen, and says what keeps waiting', () => {
    const { unfolded } = controlsOf({ stopIsOpen: true });
    const popover = tree.onlyOfComponent(unfolded, Popover);
    expect(tree.onlyWithClass(unfolded, 'gaia-forge-frame-stop').children).toContain(popover);
    expect(['label', 'role', 'width', 'placement'].map((propName) => popover.props[propName])).toEqual(['Stop Example Storefront', 'dialog', 'wide', 'below-end']);
    const strip = tree.onlyOfComponent([popover], ConfirmStrip);
    expect(['label', 'question', 'consequence'].map((propName) => strip.props[propName])).toEqual([
      'Stop Example Storefront',
      'Stop Hephaestus of Example Storefront? 4 agents are running.',
      '2 entries keep waiting on you while it is stopped.',
    ]);
    const choices = choicesIn(popover);
    expect(choices.map((choice) => [choice.label, choice.input?.props.checked])).toEqual([['Stop Hephaestus only', true], ['Stop the agents, then Hephaestus', false]]);
  });

  test('"Stop Hephaestus only" sends forge-stop keeping the agents, and the other choice is handed on', () => {
    const { unfolded, sent, events } = controlsOf({ stopIsOpen: true });
    const popover = tree.onlyOfComponent(unfolded, Popover);
    const [, stopFirst] = choicesIn(popover);
    if (stopFirst?.input === undefined) throw new Error('The question has no second choice.');
    stopFirst.input.props.onChange();
    PackageButtons.press(buttonNamed([popover], 'Stop'));
    tree.dispatch(tree.onlyOfComponent([popover], ConfirmStrip), 'onCancel');
    expect(events).toEqual(['choose stop-first', 'cancel stop']);
    expect(sent).toEqual([{ kind: 'forge-stop', trackerId: STOREFRONT.trackerId, agents: 'keep' }]);
  });

  test('with "Stop the agents, then Hephaestus" chosen, Stop sends stop-first', () => {
    const { unfolded, sent } = controlsOf({ stopIsOpen: true, stopAgents: 'stop-first' });
    PackageButtons.press(buttonNamed([tree.onlyOfComponent(unfolded, Popover)], 'Stop'));
    expect(sent).toEqual([{ kind: 'forge-stop', trackerId: STOREFRONT.trackerId, agents: 'stop-first' }]);
  });

  test('with no agent running the question has no choices and Stop keeps Hephaestus\'s agents, of which there are none', () => {
    const idle = barOf({ ...STOREFRONT, concurrency: null, agents: [] });
    const { unfolded, sent } = controlsOf({ bar: idle, stopIsOpen: true, stopAgents: 'stop-first' });
    const popover = tree.onlyOfComponent(unfolded, Popover);
    expect(choicesIn(popover)).toEqual([]);
    PackageButtons.press(buttonNamed([popover], 'Stop'));
    expect(sent).toEqual([{ kind: 'forge-stop', trackerId: STOREFRONT.trackerId, agents: 'keep' }]);
  });
});

describe('a refusal under the bar', () => {
  const refused = {
    answerVersion: 3, outcome: 'refused', refusal: 'hephaestus-still-live', text: 'Hephaestus did not stop within its tries.', forges: []
  } as const;

  test('shows the forge\'s code and sentence, with no Try again for Stop, and dismisses', () => {
    const refusal = ForgeModel.barRefusalOf(STOREFRONT.trackerId, { kind: 'forge-stop', result: { verdict: 'answered', answer: refused } });
    if (refusal === null) throw new Error('No refusal.');
    let dismissed = 0;
    const unfolded = tree.unfolded(<BarRefusalLine refusal={refusal} onCommand={() => undefined} onDismiss={() => {
      dismissed += 1;
    }} />);
    const failedAction = FailedActions.onlyFailedActionIn(unfolded);
    expect(FailedActions.wordsOf(failedAction)).toEqual(['The forge refused Stop: ', 'hephaestus-still-live', 'Hephaestus did not stop within its tries.']);
    expect([failedAction.props['retryLabel'], failedAction.props['onRetry'], failedAction.props['dismissLabel']]).toEqual([undefined, undefined, 'Dismiss this refusal']);
    tree.dispatch(failedAction, 'onDismiss');
    expect(dismissed).toBe(1);
  });

  test('Try again sends a refused pause again as it was', () => {
    const refusal = ForgeModel.barRefusalOf(STOREFRONT.trackerId, { kind: 'forge-pause', result: { verdict: 'answered', answer: refused } });
    if (refusal === null) throw new Error('No refusal.');
    const sent: CommandBody[] = [];
    const unfolded = tree.unfolded(<BarRefusalLine refusal={refusal} onCommand={(command) => sent.push(command)} onDismiss={() => undefined} />);
    const failedAction = FailedActions.onlyFailedActionIn(unfolded);
    expect(failedAction.props['retryLabel']).toBe('Try again');
    tree.dispatch(failedAction, 'onRetry');
    expect(sent).toEqual([{ kind: 'forge-pause', trackerId: STOREFRONT.trackerId }]);
  });
});

describe('the area where no board shows', () => {
  function areaOf(area: ForgeAreaProps['area']) {
    return { unfolded: tree.unfolded(<ForgeAreaLayout area={area} />) };
  }

  test('a forge whose board Gaia cannot read says so, and offers no way to open the forge\'s own Bridge', () => {
    const cannotShow = ForgeModel.forgeContentOf('research-wiki-58d0', FLEET_DEGRADED, CLOCK).area;
    if (cannotShow.kind === 'board') throw new Error('A forge read through its summary shows its board.');
    const { unfolded } = areaOf(cannotShow);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forge-frame-notice-text')])).toBe('Gaia cannot read this forge\'s board.');
    expect(PackageButtons.buttonsIn(unfolded)).toEqual([]);
  });

  test('a tracker id the registry does not name says so and names the id', () => {
    const { unfolded } = areaOf({ kind: 'not-registered', trackerId: 'example-unknown-0000' });
    expect(tree.textOf(unfolded)).toBe('The registry names no forge with this id.');
    expect(tree.onlyOfComponent([tree.onlyWithClass(unfolded, 'gaia-forge-frame-notice-id')], MonoId).props['text']).toBe('example-unknown-0000');
  });
});
