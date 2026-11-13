/**
 * The Gaia panel laid out, and the "What notifies" list. What matters (SCREENS A4 and C2): the panel sits under this machine's in the Forges view; its two
 * checkboxes hand the view the checkbox clicked, "What notifies" opens the list and is a button of its own beside the second checkbox, not inside its
 * label; a refusal offers Try again and its dismissal; the facts and a settings file line show, a path free to break after each slash; the list holds the
 * seven kinds with their lines, hands the view the kind clicked, and closes on Done. Both are unfolded without a document.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument }                            from '../../@types/CommandDocument.ts';
import type { FleetDocument }                                    from '../../@types/FleetDocument.ts';
import type { CommandStates, CommandSubject }                    from '../../api/CommandSender.ts';
import { answerResponse, senderOver }                            from '../../testing/CommandServer.ts';
import { type HostElement, ReactElementTree, type RenderedNode } from '../../testing/ReactElementTree.ts';
import { FLEET_FIVE_FORGES, FLEET_FIXTURES_READ_AT }             from '../../testing/fixtures/fleet-five-forges.ts';
import { ForgesLayout }                                          from './ForgesLayout.tsx';
import { ForgesModel }                                           from './ForgesModel.ts';
import { GaiaPanel }                                             from './GaiaPanel.tsx';
import {
  GaiaPanelModel,
  type GaiaPanelSurroundings,
  type SentSettingsChange,
  type SettingsCheckbox,
} from './GaiaPanelModel.ts';
import { WhatNotifiesDialog } from './WhatNotifiesDialog.tsx';

const tree = ReactElementTree;

const IDLE_STATES: CommandStates = senderOver([]).states();

const SETTINGS_UNWRITABLE: CommandAnswerDocument = {
  answerVersion: 1,
  outcome:       'refused',
  refusal:       'settings-unwritable',
  text:          null,
};

interface Handled {
  readonly checkboxes:         SettingsCheckbox[];
  readonly whatNotifiesOpened: number[];
  readonly dismissed:          CommandSubject[];
  readonly whatNotifiesClosed: number[];
}

function handledAndHandlers() {
  const handled: Handled = {
    checkboxes: [], whatNotifiesOpened: [], dismissed: [], whatNotifiesClosed: []
  };
  const handlers = {
    onSettingsCheckbox: (checkbox: SettingsCheckbox) => handled.checkboxes.push(checkbox),
    onOpenWhatNotifies: () => handled.whatNotifiesOpened.push(1),
    onDismissFailure:   (subject: CommandSubject) => handled.dismissed.push(subject),
  };
  return { handled, handlers };
}

function panelOf(fleetDocument: FleetDocument, surroundings: GaiaPanelSurroundings = { commandStates: IDLE_STATES, sentSettingsChange: null }) {
  const { handled, handlers } = handledAndHandlers();
  const unfolded = tree.unfolded(<GaiaPanel content={GaiaPanelModel.gaiaPanelOf(fleetDocument, surroundings)} handlers={handlers} />);
  return { unfolded, handled };
}

function whatNotifiesOf(fleetDocument: FleetDocument, surroundings: GaiaPanelSurroundings = { commandStates: IDLE_STATES, sentSettingsChange: null }) {
  const { handled, handlers } = handledAndHandlers();
  const unfolded = tree.unfolded(
    <WhatNotifiesDialog
      content={GaiaPanelModel.whatNotifiesOf(fleetDocument, surroundings)}
      handlers={handlers}
      onClose={() => handled.whatNotifiesClosed.push(1)}
    />,
  );
  return { unfolded, handled };
}

function checkboxLabelled(nodes: readonly RenderedNode[], label: string): HostElement {
  const box = tree.onlyHostElementIn(nodes, (element) => tree.hasClass(element, 'gaia-checkbox') && tree.textOf([tree.onlyWithClass([element], 'gaia-checkbox-label')]) === label);
  return tree.onlyWithTag([box], 'input');
}

function buttonNamed(nodes: readonly RenderedNode[], name: string): HostElement {
  return tree.onlyHostElementIn(nodes, (element) => element.tag === 'button'
    && (element.props['aria-label'] === name || (element.props['aria-label'] === undefined && tree.textOf([element]) === name)));
}

describe('the panel in the Forges view (A4)', () => {
  test('sits in the aside under this machine\'s panel', () => {
    const commandStates = IDLE_STATES;
    const content = ForgesModel.forgesContentOf(FLEET_FIVE_FORGES, {
      clock:       { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' },
      commandStates,
      stopDialog:  null,
      forgeInView: null,
      lastSent:    new Map(),
    });
    const { handlers } = handledAndHandlers();
    const unfolded = tree.unfolded(
      <ForgesLayout
        content={content}
        gaiaPanel={GaiaPanelModel.gaiaPanelOf(FLEET_FIVE_FORGES, { commandStates, sentSettingsChange: null })}
        commandStates={commandStates}
        handlers={{
          ...handlers,
          onCommand:        () => undefined,
          onOpenStopDialog: () => undefined,
          onStopChoice:     () => undefined,
          onCancelStop:     () => undefined,
          onConfirmStop:    () => undefined,
        }}
      />,
    );
    const aside = tree.onlyWithTag(unfolded, 'aside');
    expect(aside.children.map((child) => (typeof child === 'string' ? child : child.props['className']))).toEqual(['gaia-forges-machine', 'gaia-forges-gaia']);
  });
});

describe('the panel', () => {
  test('is headed Gaia and holds the two checkboxes as the settings hold them', () => {
    const { unfolded } = panelOf(FLEET_FIVE_FORGES);
    const panel = tree.onlyWithClass(unfolded, 'gaia-forges-gaia');
    expect(tree.textOf([tree.onlyWithTag([panel], 'h2')])).toBe('Gaia');
    expect(checkboxLabelled(unfolded, 'Start the running forges at login').props['checked']).toBe(false);
    expect(checkboxLabelled(unfolded, 'Notify me while Gaia is open').props['checked']).toBe(true);
  });

  test('a checkbox clicked hands the view that checkbox, with the change it sends', () => {
    const { unfolded, handled } = panelOf(FLEET_FIVE_FORGES);
    tree.dispatch(checkboxLabelled(unfolded, 'Start the running forges at login'), 'onChange', { currentTarget: { checked: true } });
    tree.dispatch(checkboxLabelled(unfolded, 'Notify me while Gaia is open'), 'onChange', { currentTarget: { checked: false } });
    expect(handled.checkboxes.map((checkbox) => checkbox.command)).toEqual([
      { kind: 'settings-set', key: 'startForgesAtLogin', value: true },
      { kind: 'settings-set', key: 'notifications', value: { enabled: false, kinds: FLEET_FIVE_FORGES.settings.notifications.kinds } },
    ]);
  });

  test('"What notifies" is a button beside the second checkbox, outside its label, that opens the list', () => {
    const { unfolded, handled } = panelOf(FLEET_FIVE_FORGES);
    const notifyLine = tree.onlyWithClass(unfolded, 'gaia-forges-gaia-notify');
    const whatNotifies = buttonNamed([notifyLine], 'What notifies');
    expect(tree.hostElementsIn([tree.onlyWithTag([notifyLine], 'label')], tree.withTag('button'))).toEqual([]);
    tree.dispatch(whatNotifies, 'onClick');
    expect(handled.whatNotifiesOpened).toEqual([1]);
  });

  test('shows the facts and, for a settings file newer than this Gaia, its line and both checkboxes off', () => {
    const newer = { ...FLEET_FIVE_FORGES, gaia: { ...FLEET_FIVE_FORGES.gaia, settingsFile: 'newer-version' as const } };
    const { unfolded } = panelOf(newer);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-facts')])).toBe(
      'Forge program~/.bun/bin/forgeRegistry~/.forge-monitor/projects.jsonGaia readsmonitor 1 · control 1 · embed 1Gaia0.1.0 on 127.0.0.1:4790',
    );
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forges-gaia-settings-file')])).toContain('written by a newer Gaia');
    expect(tree.hostElementsIn(unfolded, tree.withTag('input')).map((input) => input.props['disabled'])).toEqual([true, true]);
  });

  test('a path among the facts may break after each slash and nowhere else, and a fact with no slash is left whole', () => {
    const { unfolded } = panelOf(FLEET_FIVE_FORGES);
    const values = tree.hostElementsIn(unfolded, tree.withTag('dd'));
    expect(values.map((value) => [tree.textOf([value]), tree.hostElementsIn([value], tree.withTag('wbr')).length])).toEqual([
      ['~/.bun/bin/forge', 3],
      ['~/.forge-monitor/projects.json', 2],
      ['monitor 1 · control 1 · embed 1', 0],
      ['0.1.0 on 127.0.0.1:4790', 0],
    ]);
  });

  test('a refused change shows its code and sentence under the checkboxes, with Try again and its dismissal', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(SETTINGS_UNWRITABLE))]);
    const checkbox = GaiaPanelModel.gaiaPanelOf(FLEET_FIVE_FORGES, { commandStates: IDLE_STATES, sentSettingsChange: null }).startAtLogin;
    const sentSettingsChange: SentSettingsChange = { checkbox, result: await sender.send(checkbox.command) };
    const { unfolded, handled } = panelOf(FLEET_FIVE_FORGES, { commandStates: sender.states(), sentSettingsChange });
    const refusal = tree.onlyWithClass(unfolded, 'gaia-refusal');
    expect(tree.textOf([tree.onlyWithClass([refusal], 'gaia-refusal-text')])).toBe(
      'The forge refused Start the running forges at login: settings-unwritable. The command was refused.',
    );
    tree.dispatch(buttonNamed([refusal], 'Try again'), 'onClick');
    tree.dispatch(buttonNamed([refusal], 'Dismiss this refusal'), 'onClick');
    expect(handled.checkboxes).toEqual([checkbox]);
    expect(handled.dismissed).toEqual([{ fleetCommand: 'settings-set' }]);
  });
});

describe('"What notifies" (C2)', () => {
  test('is a dialog of the seven kinds, each with its line of explanation', () => {
    const { unfolded } = whatNotifiesOf(FLEET_FIVE_FORGES);
    expect(tree.onlyHostElementIn(unfolded, (element) => element.props['role'] === 'dialog').props['aria-label']).toBe('What notifies');
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-checkbox-explanation'))).toHaveLength(7);
    expect(checkboxLabelled(unfolded, 'Draft tickets').props['checked']).toBe(false);
    expect(checkboxLabelled(unfolded, 'Questions').props['checked']).toBe(true);
  });

  test('a kind clicked hands the view that kind\'s change, and Done closes the list', () => {
    const { unfolded, handled } = whatNotifiesOf(FLEET_FIVE_FORGES);
    tree.dispatch(checkboxLabelled(unfolded, 'Questions'), 'onChange', { currentTarget: { checked: false } });
    tree.dispatch(buttonNamed(unfolded, 'Done'), 'onClick');
    expect(handled.checkboxes.map((checkbox) => checkbox.command)).toEqual([{
      kind:  'settings-set',
      key:   'notifications',
      value: { enabled: true, kinds: { ...FLEET_FIVE_FORGES.settings.notifications.kinds, questions: false } },
    }]);
    expect(handled.whatNotifiesClosed).toEqual([1]);
  });

  test('says that nothing notifies while notifications are off', () => {
    const off = { ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, notifications: { ...FLEET_FIVE_FORGES.settings.notifications, enabled: false } } };
    const { unfolded } = whatNotifiesOf(off);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forges-what-notifies-off')])).toContain('is off, so no kind notifies');
  });
});
