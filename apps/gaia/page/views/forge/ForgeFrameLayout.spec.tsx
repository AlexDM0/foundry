/**
 * A forge in place laid out from its model. What matters (SCREENS B1 and B2): the bar shows Pause or Unpause, Stop and Open in new tab as
 * the forge's condition allows; Stop opens its question under the button and sends `forge-stop` with `agents: 'keep'` for "Stop the
 * Overseer only" and `stop-first` for the other choice; while a command to the forge is on its way every control of the bar is disabled;
 * a forge whose control contract Gaia does not know keeps only Open in new tab; a refusal shows the forge's code and sentence with Try
 * again only where the command can be sent again as it was. Flint's brain sits between Stop and Open in new tab, in exactly the parts of
 * its state: Wake, the waking note, the chip with Stop, a refusal with Wake again, or the ended line; Wake and Stop send the brain's
 * commands for this forge alone and are disabled while a command to it is on its way; under a control contract Gaia does not send the
 * state shows with neither, and a forge that reports no brain shows no group at all. The forge mark wakes the brain by a
 * double click wherever Wake shows, and says so in its title. The frame area says "Opening Example Storefront." until the Bridge is ready,
 * keeping the frame hidden behind it; says the forge cannot be shown inside Gaia with Open in new tab; shows B3's callout with Look again;
 * and offers Try again on a refused session.
 */
import { describe, expect, test }    from 'bun:test';
import { Callout as PackageCallout } from 'design-system/Callout';
import type { ChoiceOptionProps }    from 'design-system/ChoiceOption';
import { ConfirmStrip }              from 'design-system/ConfirmStrip';
import { MonoId }                    from 'design-system/MonoId';
import { Popover }                   from 'design-system/Popover';
import { StateDot }                  from 'design-system/StateDot';

import type { CommandBody }                                   from '../../@types/CommandDocument.ts';
import type { FleetDocumentBrainState, FleetDocumentForge }   from '../../@types/FleetDocument.ts';
import { frameUrlOf }                                         from '../../testing/AuthoredBridge.ts';
import { DrawnDots }                                          from '../../testing/DrawnDots.ts';
import { FailedActions }                                      from '../../testing/FailedActions.ts';
import { PackageButtons }                                     from '../../testing/PackageButtons.ts';
import { type HostElement, ReactElementTree }                 from '../../testing/ReactElementTree.ts';
import { STOREFRONT_BRAINS }                                  from '../../testing/fixtures/fleet-brain-states.ts';
import { FLEET_DEGRADED }                                     from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES_READINGS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import {
  BarRefusalLine,
  ForgeBarControls,
  type ForgeBarControlsProps,
  type ForgeFrameAreaProps,
  ForgeFrameAreaLayout,
  forgeMarkPropsOf,
} from './ForgeFrameLayout.tsx';
import { type ForgeBar, type ForgeFrameArea, ForgeFrameModel } from './ForgeFrameModel.ts';

const tree = ReactElementTree;

const READINGS = FLEET_FIVE_FORGES_READINGS;

const CLOCK = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

/** Example Storefront without Flint, so the bar's own controls are alone in it. */
const STOREFRONT: FleetDocumentForge = { ...READINGS.exampleStorefront, brain: 'not-reported' };

function barOf(forge = STOREFRONT): ForgeBar {
  const { bar } = ForgeFrameModel.forgeFrameContentOf(forge.trackerId, { ...FLEET_DEGRADED, forges: [forge] }, CLOCK);
  if (bar === null) throw new Error('The forge has no bar.');
  return bar;
}

function controlsOf(overrides: Partial<ForgeBarControlsProps> = {}) {
  const sent: CommandBody[] = [];
  const events: string[] = [];
  const bar = overrides.bar ?? barOf();
  const props: ForgeBarControlsProps = {
    bar,
    brainShown:        bar.brain?.shown ?? null,
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
    const newerControl = { ...STOREFRONT, contracts: { ...STOREFRONT.contracts, control: 3 } };
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

/** Example Storefront with its brain in a state of B1's tweak, at a control contract number when one is named. */
function storefrontWithBrain(state: FleetDocumentBrainState, control: number | null = 1): FleetDocumentForge {
  return { ...STOREFRONT, brain: STOREFRONT_BRAINS[state], contracts: { ...STOREFRONT.contracts, control } };
}

function brainGroupOf(unfolded: ReturnType<typeof tree.unfolded>): HostElement {
  return tree.onlyWithClass(unfolded, 'gaia-brain-chip-group');
}

function buttonTextsOf(unfolded: ReturnType<typeof tree.unfolded>): string[] {
  return buttonsIn(unfolded).map(PackageButtons.labelOf);
}

describe('Flint\'s brain in the bar (SCREENS B1)', () => {
  test('off: Wake Flint\'s brain between Stop and Open in new tab, which sends forge-brain-start for this forge alone', () => {
    const { unfolded, sent } = controlsOf({ bar: barOf(storefrontWithBrain('off')) });
    expect(buttonTextsOf(unfolded)).toEqual(['Pause', 'Stop', 'Wake Flint\'s brain', 'Open in new tab']);
    expect(brainGroupOf(unfolded).props['data-state']).toBe('off');
    PackageButtons.press(buttonNamed(unfolded, 'Wake Flint\'s brain'));
    expect(sent).toEqual([{ kind: 'forge-brain-start', trackerId: STOREFRONT.trackerId }]);
  });

  test('starting: the waking note as a status, and no button of the brain\'s', () => {
    const { unfolded } = controlsOf({ bar: barOf(storefrontWithBrain('starting')) });
    const group = brainGroupOf(unfolded);
    expect(tree.textOf([group])).toBe('Waking Flint\'s brain…');
    expect(tree.onlyWithClass([group], 'gaia-brain-chip-note').props['role']).toBe('status');
    expect(buttonTextsOf(unfolded)).toEqual(['Pause', 'Stop', 'Open in new tab']);
  });

  test('running: the chip with the forge\'s model, effort and tokens and the time left to its end, and Stop, which sends forge-brain-stop', () => {
    const { unfolded, sent } = controlsOf({ bar: barOf(storefrontWithBrain('running')) });
    const group = brainGroupOf(unfolded);
    expect(tree.textOf([tree.onlyWithClass([group], 'gaia-brain-chip')])).toBe('Flint\'s brain · haiku low · 1:24 left · 3.1k tokens');
    const brainStop = tree.onlyHostElementIn([group], PackageButtons.isButton);
    expect(PackageButtons.nameOf(brainStop)).toBe('Stop Flint\'s brain on Example Storefront');
    expect(buttonTextsOf(unfolded)).toEqual(['Pause', 'Stop', 'Stop', 'Open in new tab']);
    PackageButtons.press(brainStop);
    expect(sent).toEqual([{ kind: 'forge-brain-stop', trackerId: STOREFRONT.trackerId }]);
  });

  test('refused: the forge\'s refusal on one line, whole in its title, then Wake again', () => {
    const { unfolded, sent } = controlsOf({ bar: barOf(storefrontWithBrain('refused')) });
    const refusal = tree.onlyWithClass([brainGroupOf(unfolded)], 'gaia-brain-chip-refusal');
    expect(refusal.props['title']).toBe('The forge refused: launches are held until 16:00 (usage limit) usage-limit-holds');
    expect(tree.textOf([tree.onlyWithClass([refusal], 'gaia-brain-chip-refusal-code')])).toBe('usage-limit-holds');
    expect(buttonTextsOf(unfolded)).toEqual(['Pause', 'Stop', 'Wake Flint\'s brain', 'Open in new tab']);
    PackageButtons.press(buttonNamed(unfolded, 'Wake Flint\'s brain'));
    expect(sent).toEqual([{ kind: 'forge-brain-start', trackerId: STOREFRONT.trackerId }]);
  });

  test('ended: the grey diamond and the forge\'s sentence, with no button', () => {
    const { unfolded } = controlsOf({ bar: barOf(storefrontWithBrain('ended')) });
    const group = brainGroupOf(unfolded);
    expect(tree.textOf([group])).toBe('Flint\'s brain stopped after 2:00 · 4.2k tokens');
    expect(['tone', 'shape'].map((propName) => tree.onlyOfComponent([group], StateDot).props[propName])).toEqual(['neutral', 'diamond']);
    expect(buttonTextsOf(unfolded)).toEqual(['Pause', 'Stop', 'Open in new tab']);
  });

  test('a wake refused here shows in the group in the forge\'s place, and the forge\'s waking brain takes it back', () => {
    const failure = {
      kind:   'forge-brain-start',
      result: {
        verdict: 'answered',
        answer:  {
          answerVersion: 3, outcome: 'refused', refusal: 'overseer-paused', text: 'the Overseer is paused'
        }
      },
    } as const;
    const off = barOf(storefrontWithBrain('off'));
    if (off.brain === null) throw new Error('The forge has no brain.');
    const { unfolded } = controlsOf({ bar: off, brainShown: ForgeFrameModel.brainShownAfter(off.brain, failure) });
    expect(tree.onlyWithClass(unfolded, 'gaia-brain-chip-refusal').props['title']).toBe('The forge refused: the Overseer is paused overseer-paused');
    expect(buttonTextsOf(unfolded)).toContain('Wake Flint\'s brain');
    const starting = barOf(storefrontWithBrain('starting'));
    if (starting.brain === null) throw new Error('The forge has no brain.');
    expect(ForgeFrameModel.brainShownAfter(starting.brain, failure)).toEqual({ state: 'starting' });
  });

  test('while a command to the forge is on its way, Wake and the brain\'s Stop are disabled with the rest', () => {
    for (const state of ['off', 'refused', 'running'] as const) {
      const { unfolded } = controlsOf({ bar: barOf(storefrontWithBrain(state)), commandIsOnItsWay: true });
      expect(buttonsIn([brainGroupOf(unfolded)]).map((button) => button.props['disabled'])).toEqual([true]);
    }
  });

  test('under a control contract Gaia does not send the brain\'s state shows with no Wake and no Stop, and off shows no group', () => {
    const running = controlsOf({ bar: barOf(storefrontWithBrain('running', 3)) });
    expect(tree.textOf([tree.onlyWithClass(running.unfolded, 'gaia-brain-chip')])).toBe('Flint\'s brain · haiku low · 1:24 left · 3.1k tokens');
    expect(buttonTextsOf(running.unfolded)).toEqual(['Pause', 'Stop', 'Open in new tab']);
    const ended = controlsOf({ bar: barOf(storefrontWithBrain('ended', 3)) });
    expect(tree.textOf([brainGroupOf(ended.unfolded)])).toBe('Flint\'s brain stopped after 2:00 · 4.2k tokens');
    const off = controlsOf({ bar: barOf(storefrontWithBrain('off', 3)) });
    expect(tree.hostElementsIn(off.unfolded, tree.withClass('gaia-brain-chip-group'))).toEqual([]);
    expect(buttonTextsOf(off.unfolded)).toEqual(['Pause', 'Stop', 'Open in new tab']);
  });

  test('a forge whose monitor is older than contract 3, or that has no Flint, shows no brain group in any state of its controls', () => {
    const olderMonitor = { ...STOREFRONT, contracts: { ...STOREFRONT.contracts, monitor: 2 } };
    for (const forge of [olderMonitor, STOREFRONT]) {
      const { unfolded } = controlsOf({ bar: barOf(forge) });
      expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-brain-chip-group'))).toEqual([]);
    }
  });
});

describe('the forge mark\'s double click (PLAN B2)', () => {
  function markOf(forge: FleetDocumentForge, commandIsOnItsWay = false) {
    const woken: string[] = [];
    const { brain } = barOf(forge);
    const markWake = ForgeFrameModel.markWakeOf(brain, brain?.shown ?? null);
    return { mark: forgeMarkPropsOf(markWake, commandIsOnItsWay, () => woken.push('wake')), woken };
  }

  test('wakes the brain in off, refused and ended, and its title says so', () => {
    for (const state of ['off', 'refused', 'ended'] as const) {
      const { mark, woken } = markOf(storefrontWithBrain(state));
      expect(mark.title).toBe('Double-click to wake Flint\'s brain');
      mark.onDoubleClick?.();
      expect(woken).toEqual(['wake']);
    }
  });

  test('does not wake a brain that is waking or awake; its title says which', () => {
    expect(markOf(storefrontWithBrain('starting')).mark).toEqual({ title: 'Flint\'s brain is waking' });
    expect(markOf(storefrontWithBrain('running')).mark).toEqual({ title: 'Flint\'s brain is awake' });
  });

  test('does nothing while a command to the forge is on its way', () => {
    expect(markOf(storefrontWithBrain('off'), true).mark).toEqual({ title: 'Double-click to wake Flint\'s brain' });
  });

  test('under a control contract Gaia does not send wakes nothing, and for a forge that reports no brain has no title', () => {
    expect(markOf(storefrontWithBrain('off', 3)).mark).toEqual({});
    expect(markOf(storefrontWithBrain('running', 3)).mark).toEqual({ title: 'Flint\'s brain is awake' });
    expect(markOf(STOREFRONT).mark).toEqual({});
  });
});

describe('the Stop question as a popover under its button (B2)', () => {
  test('asks about the forge, offers both choices with "Stop the Overseer only" chosen, and says what keeps waiting', () => {
    const { unfolded } = controlsOf({ stopIsOpen: true });
    const popover = tree.onlyOfComponent(unfolded, Popover);
    expect(tree.onlyWithClass(unfolded, 'gaia-forge-frame-stop').children).toContain(popover);
    expect(['label', 'role', 'width', 'placement'].map((propName) => popover.props[propName])).toEqual(['Stop Example Storefront', 'dialog', 'wide', 'below-end']);
    const strip = tree.onlyOfComponent([popover], ConfirmStrip);
    expect(['label', 'question', 'consequence'].map((propName) => strip.props[propName])).toEqual([
      'Stop Example Storefront',
      'Stop the Overseer of Example Storefront? 4 agents are running.',
      '2 entries keep waiting on you while it is stopped.',
    ]);
    const choices = choicesIn(popover);
    expect(choices.map((choice) => [choice.label, choice.input?.props.checked])).toEqual([['Stop the Overseer only', true], ['Stop the agents, then the Overseer', false]]);
  });

  test('"Stop the Overseer only" sends forge-stop keeping the agents, and the other choice is handed on', () => {
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

  test('with "Stop the agents, then the Overseer" chosen, Stop sends stop-first', () => {
    const { unfolded, sent } = controlsOf({ stopIsOpen: true, stopAgents: 'stop-first' });
    PackageButtons.press(buttonNamed([tree.onlyOfComponent(unfolded, Popover)], 'Stop'));
    expect(sent).toEqual([{ kind: 'forge-stop', trackerId: STOREFRONT.trackerId, agents: 'stop-first' }]);
  });

  test('with no agent running the question has no choices and Stop keeps the Overseer\'s agents, of which there are none', () => {
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
    answerVersion: 3, outcome: 'refused', refusal: 'overseer-still-live', text: 'The Overseer did not stop within its tries.'
  } as const;

  test('shows the forge\'s code and sentence, with no Try again for Stop, and dismisses', () => {
    const refusal = ForgeFrameModel.barRefusalOf(STOREFRONT.trackerId, { kind: 'forge-stop', result: { verdict: 'answered', answer: refused } });
    if (refusal === null) throw new Error('No refusal.');
    let dismissed = 0;
    const unfolded = tree.unfolded(<BarRefusalLine refusal={refusal} onCommand={() => undefined} onDismiss={() => {
      dismissed += 1;
    }} />);
    const failedAction = FailedActions.onlyFailedActionIn(unfolded);
    expect(FailedActions.wordsOf(failedAction)).toEqual(['The forge refused Stop: ', 'overseer-still-live', 'The Overseer did not stop within its tries.']);
    expect([failedAction.props['retryLabel'], failedAction.props['onRetry'], failedAction.props['dismissLabel']]).toEqual([undefined, undefined, 'Dismiss this refusal']);
    tree.dispatch(failedAction, 'onDismiss');
    expect(dismissed).toBe(1);
  });

  test('Try again sends a refused pause again as it was', () => {
    const refusal = ForgeFrameModel.barRefusalOf(STOREFRONT.trackerId, { kind: 'forge-pause', result: { verdict: 'answered', answer: refused } });
    if (refusal === null) throw new Error('No refusal.');
    const sent: CommandBody[] = [];
    const unfolded = tree.unfolded(<BarRefusalLine refusal={refusal} onCommand={(command) => sent.push(command)} onDismiss={() => undefined} />);
    const failedAction = FailedActions.onlyFailedActionIn(unfolded);
    expect(failedAction.props['retryLabel']).toBe('Try again');
    tree.dispatch(failedAction, 'onRetry');
    expect(sent).toEqual([{ kind: 'forge-pause', trackerId: STOREFRONT.trackerId }]);
  });
});

describe('the frame area', () => {
  const storefrontArea = ForgeFrameModel.forgeFrameContentOf(STOREFRONT.trackerId, { ...FLEET_DEGRADED, forges: [STOREFRONT] }, CLOCK).area;

  function areaOf(area: ForgeFrameArea, overrides: Partial<ForgeFrameAreaProps> = {}) {
    const events: string[] = [];
    const props: ForgeFrameAreaProps = {
      area,
      shown:             null,
      onFrameElement:    null,
      onLookAgain:       () => events.push('look again'),
      onAskAgain:        () => events.push('ask again'),
      onLeave:           () => events.push('leave'),
      onOpenInNewTab:    () => events.push('open in new tab'),
      commandIsOnItsWay: false,
      ...overrides,
    };
    return { unfolded: tree.unfolded(<ForgeFrameAreaLayout {...props} />), events };
  }

  test('says "Opening Example Storefront." while the session is asked for, with no frame yet', () => {
    const { unfolded } = areaOf(storefrontArea, { shown: { kind: 'opening' } });
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forge-frame-opening')])).toBe('Opening Example Storefront.');
    expect(tree.hostElementsIn(unfolded, tree.withTag('iframe'))).toEqual([]);
  });

  test('loads the Bridge at the session\'s address behind "Opening" until it is ready, then shows it alone', () => {
    const loading = areaOf(storefrontArea, {
      shown: {
        kind: 'frame', frameUrl: frameUrlOf(1), frameLoad: 1, bridgeIsReady: false
      }
    });
    const frame = tree.onlyWithTag(loading.unfolded, 'iframe');
    expect(frame.props['src']).toBe(frameUrlOf(1));
    expect(frame.props['title']).toBe('The Bridge of Example Storefront');
    expect(frame.props['data-bridge-ready']).toBeUndefined();
    expect(tree.textOf([tree.onlyWithClass(loading.unfolded, 'gaia-forge-frame-opening')])).toBe('Opening Example Storefront.');
    const ready = areaOf(storefrontArea, {
      shown: {
        kind: 'frame', frameUrl: frameUrlOf(1), frameLoad: 1, bridgeIsReady: true
      }
    });
    expect(tree.onlyWithTag(ready.unfolded, 'iframe').props['data-bridge-ready']).toBe('');
    expect(tree.hostElementsIn(ready.unfolded, tree.withClass('gaia-forge-frame-opening'))).toEqual([]);
  });

  test('a forge that cannot open in place says so, with Open in new tab', () => {
    const cannotShow = ForgeFrameModel.forgeFrameContentOf('research-wiki-58d0', FLEET_DEGRADED, CLOCK).area;
    const { unfolded, events } = areaOf(cannotShow);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forge-frame-notice-text')])).toBe('This forge cannot be shown inside Gaia yet.');
    PackageButtons.press(buttonNamed(unfolded, 'Open in new tab'));
    expect(events).toEqual(['open in new tab']);
    const sessionNotSupported = areaOf(storefrontArea, { shown: { kind: 'cannot-show' } });
    expect(tree.textOf([tree.onlyWithClass(sessionNotSupported.unfolded, 'gaia-forge-frame-notice-text')])).toBe('This forge cannot be shown inside Gaia yet.');
  });

  test('an unreachable forge shows B3\'s callout in the frame area with Look again', () => {
    const unreachable = ForgeFrameModel.forgeFrameContentOf('invoice-service-2b9e', FLEET_DEGRADED, CLOCK).area;
    const { unfolded, events } = areaOf(unreachable);
    const callout = tree.onlyWithClass(unfolded, 'gaia-callout');
    expect(tree.onlyOfComponent([callout], PackageCallout).props['tone']).toBe('error');
    expect(tree.textOf([callout])).toContain('Its Overseer stopped answering. The registry still names it.');
    expect(tree.textOf([tree.onlyWithClass([callout], 'gaia-callout-machine-line')])).toBe('127.0.0.1:4957 · process 48211 · last answer 13:14');
    PackageButtons.press(buttonNamed(unfolded, 'Look again'));
    expect(events).toEqual(['look again']);
  });

  test('an Overseer the session finds gone shows the same callout with the unreachable dot, whose Look again asks the session again', () => {
    const { unfolded, events } = areaOf(storefrontArea, { shown: { kind: 'unreachable' } });
    const callout = tree.onlyWithClass(unfolded, 'gaia-callout');
    expect(callout.props['aria-label']).toBe('Example Storefront: Unreachable');
    expect(DrawnDots.conditionOf(tree.onlyHostElementIn([callout], DrawnDots.isDot))).toBe('unreachable');
    PackageButtons.press(buttonNamed(unfolded, 'Look again'));
    expect(events).toEqual(['ask again']);
  });

  test('a refused session shows the reason with Try again in a notice that leaves the fade to the refusal, and dismissing it goes back', () => {
    const refusal = ForgeFrameModel.frameSessionRefusalTextOf('token-rejected', null);
    const { unfolded, events } = areaOf(storefrontArea, { shown: { kind: 'refused', refusal } });
    const failedAction = FailedActions.onlyFailedActionIn(unfolded);
    expect(FailedActions.wordsOf(failedAction)).toEqual(['Gaia could not Open: ', 'token-rejected', 'The forge did not accept Gaia\'s token.']);
    expect(tree.onlyWithClass(unfolded, 'gaia-forge-frame-notice').props['data-refused']).toBe('');
    expect([failedAction.props['retryLabel'], failedAction.props['dismissLabel']]).toEqual(['Try again', 'Dismiss this refusal']);
    tree.dispatch(failedAction, 'onRetry');
    tree.dispatch(failedAction, 'onDismiss');
    expect(events).toEqual(['ask again', 'leave']);
  });

  test('a tracker id the registry does not name says so and names the id', () => {
    const { unfolded } = areaOf({ kind: 'not-registered', trackerId: 'example-unknown-0000' });
    expect(tree.textOf(unfolded)).toBe('The registry names no forge with this id.');
    expect(tree.onlyOfComponent([tree.onlyWithClass(unfolded, 'gaia-forge-frame-notice-id')], MonoId).props['text']).toBe('example-unknown-0000');
  });
});
