/**
 * A forge in place laid out from its model. What matters (SCREENS B1 and B2): the bar shows Pause or Resume, Stop and Open in new tab as
 * the forge's condition allows; Stop opens its question under the button and sends `forge-stop` with `agents: 'keep'` for "Stop the
 * Overseer only" and `stop-first` for the other choice; while a command to the forge is on its way every control of the bar is disabled;
 * a forge whose control contract Gaia does not know keeps only Open in new tab; a refusal shows the forge's code and sentence with Try
 * again only where the command can be sent again as it was. The frame area says "Opening Example Storefront." until the Bridge is ready,
 * keeping the frame hidden behind it; says the forge cannot be shown inside Gaia with Open in new tab; shows B3's callout with Look again;
 * and offers Try again on a refused session.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandBody }                                   from '../../@types/CommandDocument.ts';
import { frameUrlOf }                                         from '../../testing/AuthoredBridge.ts';
import { type HostElement, ReactElementTree }                 from '../../testing/ReactElementTree.ts';
import { FLEET_DEGRADED }                                     from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES_READINGS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import {
  BarRefusalLine,
  ForgeBarControls,
  type ForgeBarControlsProps,
  type ForgeFrameAreaProps,
  ForgeFrameAreaLayout,
} from './ForgeFrameLayout.tsx';
import { type ForgeBar, type ForgeFrameArea, ForgeFrameModel } from './ForgeFrameModel.ts';

const tree = ReactElementTree;

const READINGS = FLEET_FIVE_FORGES_READINGS;

const CLOCK = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

function barOf(forge = READINGS.exampleStorefront): ForgeBar {
  const { bar } = ForgeFrameModel.forgeFrameContentOf(forge.trackerId, { ...FLEET_DEGRADED, forges: [forge] }, CLOCK);
  if (bar === null) throw new Error('The forge has no bar.');
  return bar;
}

function controlsOf(overrides: Partial<ForgeBarControlsProps> = {}) {
  const sent: CommandBody[] = [];
  const events: string[] = [];
  const props: ForgeBarControlsProps = {
    bar:               barOf(),
    commandIsOnItsWay: false,
    stopIsOpen:        false,
    stopAgents:        'keep',
    onCommand:         (command) => sent.push(command),
    onOpenStop:        () => events.push('open stop'),
    onChooseStop:      (agents) => events.push(`choose ${agents}`),
    onCancelStop:      () => events.push('cancel stop'),
    ...overrides,
  };
  return { unfolded: tree.unfolded(<ForgeBarControls {...props} />), sent, events };
}

function buttonsIn(nodes: ReturnType<typeof tree.unfolded>): HostElement[] {
  return tree.hostElementsIn(nodes, (element) => element.tag === 'button' || (element.tag === 'a' && tree.hasClass(element, 'gaia-button')));
}

function buttonNamed(nodes: ReturnType<typeof tree.unfolded>, name: string): HostElement {
  return tree.onlyHostElementIn(nodes, (element) => element.tag === 'button' && (tree.textOf([element]) === name || element.props['aria-label'] === name));
}

describe('the bar\'s controls', () => {
  test('a live forge shows Pause, Stop and Open in new tab, each enabled, and none primary', () => {
    const { unfolded } = controlsOf();
    expect(buttonsIn(unfolded).map((button) => tree.textOf([button]))).toEqual(['Pause', 'Stop', 'Open in new tab']);
    expect(buttonsIn(unfolded).map((button) => [button.props['disabled'], button.props['data-emphasis']])).toEqual([
      [false, 'plain'], [false, 'plain'], [false, 'plain'],
    ]);
  });

  test('a paused forge shows Resume as the primary button, and Pause sends the forge\'s pause', () => {
    const paused = controlsOf({ bar: barOf({ ...READINGS.exampleStorefront, condition: 'paused' }) });
    expect(buttonNamed(paused.unfolded, 'Resume').props['data-emphasis']).toBe('primary');
    const live = controlsOf();
    tree.dispatch(buttonNamed(live.unfolded, 'Pause'), 'onClick');
    tree.dispatch(buttonNamed(live.unfolded, 'Open in new tab'), 'onClick');
    expect(live.sent).toEqual([
      { kind: 'forge-pause', trackerId: READINGS.exampleStorefront.trackerId },
      { kind: 'forge-open-in-browser', trackerId: READINGS.exampleStorefront.trackerId },
    ]);
  });

  test('while a command to the forge is on its way, every control of the bar is disabled', () => {
    const { unfolded } = controlsOf({ commandIsOnItsWay: true });
    expect(buttonsIn(unfolded).map((button) => button.props['disabled'])).toEqual([true, true, true]);
  });

  test('a forge whose control contract Gaia does not know keeps only Open in new tab', () => {
    const newerControl = { ...READINGS.exampleStorefront, contracts: { ...READINGS.exampleStorefront.contracts, control: 3 } };
    const { unfolded } = controlsOf({ bar: barOf(newerControl), stopIsOpen: true });
    expect(buttonsIn(unfolded).map((button) => [tree.textOf([button]), button.props['disabled']])).toEqual([
      ['Pause', true], ['Stop', true], ['Open in new tab', false],
    ]);
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-forge-frame-stop-popover'))).toEqual([]);
  });

  test('Stop opens its question rather than stopping', () => {
    const { unfolded, sent, events } = controlsOf();
    tree.dispatch(buttonNamed(unfolded, 'Stop'), 'onClick');
    expect(events).toEqual(['open stop']);
    expect(sent).toEqual([]);
  });
});

describe('the Stop question as a popover under its button (B2)', () => {
  test('asks about the forge, offers both choices with "Stop the Overseer only" chosen, and says what keeps waiting', () => {
    const { unfolded } = controlsOf({ stopIsOpen: true });
    const popover = tree.onlyWithClass(unfolded, 'gaia-forge-frame-stop-popover');
    expect(tree.onlyWithClass(unfolded, 'gaia-forge-frame-stop').children).toContain(popover);
    expect(tree.onlyWithClass([popover], 'gaia-confirm').props['aria-label']).toBe('Stop Example Storefront');
    expect(tree.textOf([tree.onlyWithClass([popover], 'gaia-confirm-question')])).toBe('Stop the Overseer of Example Storefront? 4 agents are running.');
    const radios = tree.hostElementsIn([popover], tree.withTag('input'));
    expect(radios.map((radio) => radio.props['checked'])).toEqual([true, false]);
    expect(tree.textOf([tree.onlyWithClass([popover], 'gaia-confirm-consequence')])).toBe('2 entries keep waiting on you while it is stopped.');
  });

  test('"Stop the Overseer only" sends forge-stop keeping the agents, and the other choice is handed on', () => {
    const { unfolded, sent, events } = controlsOf({ stopIsOpen: true });
    const popover = tree.onlyWithClass(unfolded, 'gaia-forge-frame-stop-popover');
    const [, stopFirst] = tree.hostElementsIn([popover], tree.withTag('input'));
    if (stopFirst === undefined) throw new Error('The question has no second choice.');
    tree.dispatch(stopFirst, 'onChange');
    tree.dispatch(buttonNamed([popover], 'Stop'), 'onClick');
    tree.dispatch(buttonNamed([popover], 'Cancel'), 'onClick');
    expect(events).toEqual(['choose stop-first', 'cancel stop']);
    expect(sent).toEqual([{ kind: 'forge-stop', trackerId: READINGS.exampleStorefront.trackerId, agents: 'keep' }]);
  });

  test('with "Stop the agents, then the Overseer" chosen, Stop sends stop-first', () => {
    const { unfolded, sent } = controlsOf({ stopIsOpen: true, stopAgents: 'stop-first' });
    tree.dispatch(buttonNamed([tree.onlyWithClass(unfolded, 'gaia-forge-frame-stop-popover')], 'Stop'), 'onClick');
    expect(sent).toEqual([{ kind: 'forge-stop', trackerId: READINGS.exampleStorefront.trackerId, agents: 'stop-first' }]);
  });

  test('with no agent running the question has no choices and Stop keeps the Overseer\'s agents, of which there are none', () => {
    const idle = barOf({ ...READINGS.exampleStorefront, concurrency: null, agents: [] });
    const { unfolded, sent } = controlsOf({ bar: idle, stopIsOpen: true, stopAgents: 'stop-first' });
    const popover = tree.onlyWithClass(unfolded, 'gaia-forge-frame-stop-popover');
    expect(tree.hostElementsIn([popover], tree.withTag('input'))).toEqual([]);
    tree.dispatch(buttonNamed([popover], 'Stop'), 'onClick');
    expect(sent).toEqual([{ kind: 'forge-stop', trackerId: READINGS.exampleStorefront.trackerId, agents: 'keep' }]);
  });
});

describe('a refusal under the bar', () => {
  const refused = {
    answerVersion: 2, outcome: 'refused', refusal: 'overseer-still-live', text: 'The Overseer did not stop within its tries.'
  } as const;

  test('shows the forge\'s code and sentence, with no Try again for Stop, and dismisses', () => {
    const refusal = ForgeFrameModel.barRefusalOf(READINGS.exampleStorefront.trackerId, { kind: 'forge-stop', result: { verdict: 'answered', answer: refused } });
    if (refusal === null) throw new Error('No refusal.');
    let dismissed = 0;
    const unfolded = tree.unfolded(<BarRefusalLine refusal={refusal} onCommand={() => undefined} onDismiss={() => {
      dismissed += 1;
    }} />);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-refusal-text')])).toBe('The forge refused Stop: overseer-still-live. The Overseer did not stop within its tries.');
    expect(buttonsIn(unfolded).map((button) => button.props['aria-label'] ?? tree.textOf([button]))).toEqual(['Dismiss this refusal']);
    tree.dispatch(buttonNamed(unfolded, 'Dismiss this refusal'), 'onClick');
    expect(dismissed).toBe(1);
  });

  test('Try again sends a refused pause again as it was', () => {
    const refusal = ForgeFrameModel.barRefusalOf(READINGS.exampleStorefront.trackerId, { kind: 'forge-pause', result: { verdict: 'answered', answer: refused } });
    if (refusal === null) throw new Error('No refusal.');
    const sent: CommandBody[] = [];
    const unfolded = tree.unfolded(<BarRefusalLine refusal={refusal} onCommand={(command) => sent.push(command)} onDismiss={() => undefined} />);
    tree.dispatch(buttonNamed(unfolded, 'Try again'), 'onClick');
    expect(sent).toEqual([{ kind: 'forge-pause', trackerId: READINGS.exampleStorefront.trackerId }]);
  });
});

describe('the frame area', () => {
  const storefrontArea = ForgeFrameModel.forgeFrameContentOf(READINGS.exampleStorefront.trackerId, { ...FLEET_DEGRADED, forges: [READINGS.exampleStorefront] }, CLOCK).area;

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
    tree.dispatch(buttonNamed(unfolded, 'Open in new tab'), 'onClick');
    expect(events).toEqual(['open in new tab']);
    const sessionNotSupported = areaOf(storefrontArea, { shown: { kind: 'cannot-show' } });
    expect(tree.textOf([tree.onlyWithClass(sessionNotSupported.unfolded, 'gaia-forge-frame-notice-text')])).toBe('This forge cannot be shown inside Gaia yet.');
  });

  test('an unreachable forge shows B3\'s callout in the frame area with Look again', () => {
    const unreachable = ForgeFrameModel.forgeFrameContentOf('invoice-service-2b9e', FLEET_DEGRADED, CLOCK).area;
    const { unfolded, events } = areaOf(unreachable);
    const callout = tree.onlyWithClass(unfolded, 'gaia-callout');
    expect(callout.props['data-tone']).toBe('error');
    expect(tree.textOf([callout])).toContain('Its Overseer stopped answering. The registry still names it.');
    expect(tree.textOf([tree.onlyWithClass([callout], 'gaia-callout-machine-line')])).toBe('127.0.0.1:4957 · process 48211 · last answer 13:14');
    tree.dispatch(buttonNamed(unfolded, 'Look again'), 'onClick');
    expect(events).toEqual(['look again']);
  });

  test('an Overseer the session finds gone shows the same callout with the unreachable dot, whose Look again asks the session again', () => {
    const { unfolded, events } = areaOf(storefrontArea, { shown: { kind: 'unreachable' } });
    const callout = tree.onlyWithClass(unfolded, 'gaia-callout');
    expect(callout.props['aria-label']).toBe('Example Storefront: Unreachable');
    expect(tree.onlyWithClass([callout], 'gaia-condition-dot').props['data-condition']).toBe('unreachable');
    tree.dispatch(buttonNamed(unfolded, 'Look again'), 'onClick');
    expect(events).toEqual(['ask again']);
  });

  test('a refused session shows the reason with Try again, and dismissing it goes back', () => {
    const refusal = ForgeFrameModel.frameSessionRefusalTextOf('token-rejected', null);
    const { unfolded, events } = areaOf(storefrontArea, { shown: { kind: 'refused', refusal } });
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-refusal-text')])).toBe('The forge refused Open: token-rejected. The forge did not accept Gaia\'s token.');
    tree.dispatch(buttonNamed(unfolded, 'Try again'), 'onClick');
    tree.dispatch(buttonNamed(unfolded, 'Dismiss this refusal'), 'onClick');
    expect(events).toEqual(['ask again', 'leave']);
  });

  test('a tracker id the registry does not name says so and names the id', () => {
    const { unfolded } = areaOf({ kind: 'not-registered', trackerId: 'example-unknown-0000' });
    expect(tree.textOf(unfolded)).toBe('The registry names no forge with this id.example-unknown-0000');
  });
});
