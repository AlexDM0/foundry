/**
 * The Gaia panel laid out, and the "What notifies" list. What matters (SCREENS A4 and C2): the panel sits under this machine's in the Forges view; its two
 * switches hand the view the setting clicked, "What notifies" opens the list and is a button of its own beside the second switch, not inside its
 * label; a refusal offers Try again and its dismissal; the facts and a settings file line show, a path free to break after each slash; the list holds the
 * seven kinds with their lines, hands the view the kind clicked, and closes on Done; it is the package's open dialog titled "What notifies".
 * The panel and the list are unfolded without a document, the package's dialog, switches and checkboxes folded.
 */
import { describe, expect, test } from 'bun:test';
import { Checkbox }               from 'design-system/Checkbox';
import { Dialog }                 from 'design-system/Dialog';
import { Switch }                 from 'design-system/Switch';
import { Text }                   from 'design-system/Text';
import { TextButton }             from 'design-system/TextButton';

import type { CommandAnswerDocument }                            from '../../@types/CommandDocument.ts';
import type { FleetDocument }                                    from '../../@types/FleetDocument.ts';
import type { CommandStates, CommandSubject }                    from '../../api/CommandSender.ts';
import { answerResponse, senderOver }                            from '../../testing/CommandServer.ts';
import { FailedActions }                                         from '../../testing/FailedActions.ts';
import { PackageButtons }                                        from '../../testing/PackageButtons.ts';
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
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'settings-unwritable',
  text:          null,
  forges:        [],
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
  const content = GaiaPanelModel.whatNotifiesOf(fleetDocument, surroundings);
  const onClose = () => handled.whatNotifiesClosed.push(1);
  const unfolded = tree.unfolded(<WhatNotifiesDialog content={content} handlers={handlers} onClose={onClose} />);
  return { unfolded, handled };
}

function checkboxLabelled(nodes: readonly RenderedNode[], label: string): HostElement {
  return tree.onlyHostElementIn(nodes, (element) => tree.withComponent(Checkbox)(element) && element.props['label'] === label);
}

/** The panel's settings are the package's switches, each named by the visible label Gaia hands it the id of. */
function switchLabelled(nodes: readonly RenderedNode[], label: string): HostElement {
  return tree.onlyHostElementIn(nodes, (element) => tree.withComponent(Switch)(element)
    && tree.textOf(tree.hostElementsIn(nodes, (candidate) => candidate.props['id'] === element.props['labelledBy'])) === label);
}

describe('the panel in the Forges view (A4)', () => {
  test('sits in the aside under this machine\'s panel', () => {
    const commandStates = IDLE_STATES;
    const content = ForgesModel.forgesContentOf(FLEET_FIVE_FORGES, {
      clock:            { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' },
      commandStates,
      stopDialog:       null,
      forgeInView:      null,
      lastSent:         new Map(),
      versionsShownFor: null,
    });
    const { handlers } = handledAndHandlers();
    const unfolded = tree.unfolded(
      <ForgesLayout
        content={content}
        gaiaPanel={GaiaPanelModel.gaiaPanelOf(FLEET_FIVE_FORGES, { commandStates, sentSettingsChange: null })}
        commandStates={commandStates}
        handlers={{
          ...handlers,
          onCommand:               () => undefined,
          onOpenStopDialog:        () => undefined,
          onStopChoice:            () => undefined,
          onCancelStop:            () => undefined,
          onConfirmStop:           () => undefined,
          onDismissRestartPending: () => undefined,
          onToggleVersions:        () => undefined,
        }}
      />,
    );
    const aside = tree.onlyWithTag(unfolded, 'aside');
    expect(aside.children.map((child) => (typeof child === 'string' ? child : child.props['className']))).toEqual(['gaia-forges-machine', 'gaia-forges-gaia']);
  });
});

describe('the panel', () => {
  test('is headed Gaia and holds the two switches as the settings hold them', () => {
    const { unfolded } = panelOf(FLEET_FIVE_FORGES);
    const panel = tree.onlyWithClass(unfolded, 'gaia-forges-gaia');
    const head = tree.onlyHostElementIn([panel], (element) => element.tag === Text.name && element.props['element'] === 'h2');
    expect([tree.textOf([head]), head.props['id']]).toEqual(['Gaia', panel.props['aria-labelledby']]);
    expect(switchLabelled(unfolded, 'Start the running forges at login').props['checked']).toBe(false);
    expect(switchLabelled(unfolded, 'Notify me while Gaia is open').props['checked']).toBe(true);
  });

  test('a switch clicked hands the view that setting, with the change it sends', () => {
    const { unfolded, handled } = panelOf(FLEET_FIVE_FORGES);
    tree.dispatch(switchLabelled(unfolded, 'Start the running forges at login'), 'onToggle');
    tree.dispatch(switchLabelled(unfolded, 'Notify me while Gaia is open'), 'onToggle');
    expect(handled.checkboxes.map((checkbox) => checkbox.command)).toEqual([
      { kind: 'settings-set', key: 'startForgesAtLogin', value: true },
      { kind: 'settings-set', key: 'notifications', value: { enabled: false, kinds: FLEET_FIVE_FORGES.settings.notifications.kinds } },
    ]);
  });

  test('"What notifies" is a button beside the second switch, outside its label, that opens the list', () => {
    const { unfolded, handled } = panelOf(FLEET_FIVE_FORGES);
    const notifyLine = tree.onlyWithClass(unfolded, 'gaia-forges-gaia-notify');
    const whatNotifies = tree.onlyOfComponent([notifyLine], TextButton);
    expect(whatNotifies.props['label']).toBe('What notifies');
    const labelId = switchLabelled([notifyLine], 'Notify me while Gaia is open').props['labelledBy'];
    expect(tree.hostElementsIn([tree.onlyHostElementIn([notifyLine], (element) => element.props['id'] === labelId)], tree.withComponent(TextButton))).toEqual([]);
    tree.dispatch(whatNotifies, 'onPress');
    expect(handled.whatNotifiesOpened).toEqual([1]);
  });

  test('shows the facts and, for a settings file newer than this Gaia, its line and both switches off', () => {
    const newer = { ...FLEET_FIVE_FORGES, gaia: { ...FLEET_FIVE_FORGES.gaia, settingsFile: 'newer-version' as const } };
    const { unfolded } = panelOf(newer);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forges-gaia-facts')])).toBe(
      'Forge program~/.bun/bin/forgeRegistry~/.forge-monitor/projects.jsonThis Gaiaversion1.0built for forge1.1address127.0.0.1:4790',
    );
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forges-gaia-settings-file')])).toContain('written by a newer Gaia');
    expect(tree.hostElementsIn(unfolded, tree.withComponent(Switch)).map((setting) => setting.props['disabled'])).toEqual([true, true]);
  });

  test('a path among the facts may break after each slash and nowhere else, and a fact with no slash is left whole', () => {
    const { unfolded } = panelOf(FLEET_FIVE_FORGES);
    const values = tree.hostElementsIn(unfolded, tree.withTag('dd'));
    expect(values.map((value) => [tree.textOf([value]), tree.hostElementsIn([value], tree.withTag('wbr')).length])).toEqual([
      ['~/.bun/bin/forge', 3],
      ['~/.forge-monitor/projects.json', 2],
      ['version1.0built for forge1.1address127.0.0.1:4790', 0],
      ['1.0', 0],
      ['1.1', 0],
      ['127.0.0.1:4790', 0],
    ]);
  });

  test('each fact\'s value is set in mono, but a value that is words, as a forge program not found, in the interface face', () => {
    const monoOf = (fleetDocument: FleetDocument) => tree.hostElementsIn(panelOf(fleetDocument).unfolded, tree.withTag('dd')).slice(0, 2)
      .map((value) => tree.onlyOfComponent([value], Text).props['mono']);
    expect(monoOf(FLEET_FIVE_FORGES)).toEqual([true, true]);
    expect(monoOf({ ...FLEET_FIVE_FORGES, gaia: { ...FLEET_FIVE_FORGES.gaia, forgeProgramInUse: null } })).toEqual([false, true]);
  });

  test('this Gaia\'s facts close the list under one label, each a label and its value on a line of its own', () => {
    const { unfolded } = panelOf(FLEET_FIVE_FORGES);
    const thisGaia = tree.onlyWithClass(unfolded, 'gaia-forges-gaia-this-gaia');
    expect(tree.hostElementsIn([thisGaia], tree.withClass('gaia-forges-gaia-this-gaia-fact')).map((fact) => tree.textOf([fact]))).toEqual([
      'version1.0',
      'built for forge1.1',
      'address127.0.0.1:4790',
    ]);
  });

  test('a refused change shows its code and sentence under the switches, with Try again and its dismissal', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(SETTINGS_UNWRITABLE))]);
    const checkbox = GaiaPanelModel.gaiaPanelOf(FLEET_FIVE_FORGES, { commandStates: IDLE_STATES, sentSettingsChange: null }).startAtLogin;
    const sentSettingsChange: SentSettingsChange = { checkbox, result: await sender.send(checkbox.command) };
    const { unfolded, handled } = panelOf(FLEET_FIVE_FORGES, { commandStates: sender.states(), sentSettingsChange });
    const refusal = FailedActions.onlyFailedActionIn(unfolded);
    expect(FailedActions.wordsOf(refusal)).toEqual(['Gaia could not Start the running forges at login: ', 'settings-unwritable', 'The command was refused.']);
    expect([refusal.props['retryLabel'], refusal.props['dismissLabel']]).toEqual(['Try again', 'Dismiss this refusal']);
    tree.dispatch(refusal, 'onRetry');
    tree.dispatch(refusal, 'onDismiss');
    expect(handled.checkboxes).toEqual([checkbox]);
    expect(handled.dismissed).toEqual([{ fleetCommand: 'settings-set' }]);
  });
});

describe('"What notifies" (C2)', () => {
  test('is a dialog of the seven kinds, each with its line of explanation', () => {
    const { unfolded } = whatNotifiesOf(FLEET_FIVE_FORGES);
    const dialog = tree.onlyOfComponent(unfolded, Dialog);
    expect([dialog.props['title'], dialog.props['isOpen']]).toEqual(['What notifies', true]);
    const kinds = tree.hostElementsIn([dialog], tree.withComponent(Checkbox));
    expect(kinds.filter((kind) => typeof kind.props['explanation'] === 'string' && kind.props['explanation'] !== '')).toHaveLength(7);
    expect(checkboxLabelled(unfolded, 'Draft tickets').props['checked']).toBe(false);
    expect(checkboxLabelled(unfolded, 'Questions').props['checked']).toBe(true);
  });

  test('a kind clicked hands the view that kind\'s change, and Done closes the list', () => {
    const { unfolded, handled } = whatNotifiesOf(FLEET_FIVE_FORGES);
    tree.dispatch(checkboxLabelled(unfolded, 'Questions'), 'onChange', false);
    PackageButtons.press(PackageButtons.onlyLabelled(unfolded, 'Done'));
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
