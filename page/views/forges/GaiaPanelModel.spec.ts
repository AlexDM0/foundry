/**
 * The Gaia panel's content and its "What notifies" list. What matters (SCREENS A4 and C2): each checkbox shows the setting and sends
 * `settings-set` with that one setting turned over, the kinds' checkbox only its own kind; the facts read the document's paths from `~`,
 * the contracts Gaia reads and its version on its address, and say in words when no forge program is known; a settings change on its way
 * or a settings file newer than this Gaia leaves every checkbox off, and the second is said; a refusal shows only where this view's own
 * send came from, with the code and sentence of the answer. The command states come from the real sender over authored answers.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument }              from '../../@types/CommandDocument.ts';
import type { FleetDocument }                      from '../../@types/FleetDocument.ts';
import type { CommandStates }                      from '../../api/CommandSender.ts';
import { answerResponse, senderOver }              from '../../testing/CommandServer.ts';
import { FLEET_EMPTY }                             from '../../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES }                       from '../../testing/fixtures/fleet-five-forges.ts';
import { GaiaPanelModel, type SentSettingsChange } from './GaiaPanelModel.ts';

const IDLE_STATES: CommandStates = senderOver([]).states();

const LOGIN_ITEM_REFUSAL_SENTENCE = 'The login item for /Users/alexexample/development/example-storefront could not be written; nothing was changed.';

const LOGIN_ITEM_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'login-item-unwritable',
  text:          LOGIN_ITEM_REFUSAL_SENTENCE,
};

function panelOf(fleetDocument: FleetDocument, commandStates: CommandStates = IDLE_STATES, sentSettingsChange: SentSettingsChange | null = null) {
  return GaiaPanelModel.gaiaPanelOf(fleetDocument, { commandStates, sentSettingsChange });
}

function whatNotifiesOf(fleetDocument: FleetDocument, commandStates: CommandStates = IDLE_STATES, sentSettingsChange: SentSettingsChange | null = null) {
  return GaiaPanelModel.whatNotifiesOf(fleetDocument, { commandStates, sentSettingsChange });
}

function withSettings(fleetDocument: FleetDocument, settings: Partial<FleetDocument['settings']>): FleetDocument {
  return { ...fleetDocument, settings: { ...fleetDocument.settings, ...settings } };
}

function withSettingsFile(fleetDocument: FleetDocument, settingsFile: FleetDocument['gaia']['settingsFile']): FleetDocument {
  return { ...fleetDocument, gaia: { ...fleetDocument.gaia, settingsFile } };
}

/** The panel's "Start at login" sent over a server that refuses it, and the change as the view keeps it once it answered. */
async function refusedStartAtLogin(): Promise<{ readonly commandStates: CommandStates; readonly sentSettingsChange: SentSettingsChange }> {
  const sender = senderOver([() => Promise.resolve(answerResponse(LOGIN_ITEM_REFUSED))]);
  const checkbox = panelOf(FLEET_FIVE_FORGES).startAtLogin;
  const result = await sender.send(checkbox.command);
  return { commandStates: sender.states(), sentSettingsChange: { checkbox, result } };
}

describe('the two checkboxes', () => {
  test('"Start the running forges at login" shows the setting and sends it turned over', () => {
    const { startAtLogin } = panelOf(FLEET_FIVE_FORGES);
    expect([startAtLogin.label, startAtLogin.checked, startAtLogin.disabled]).toEqual(['Start the running forges at login', false, false]);
    expect(startAtLogin.command).toEqual({ kind: 'settings-set', key: 'startForgesAtLogin', value: true });
    expect(panelOf(withSettings(FLEET_FIVE_FORGES, { startForgesAtLogin: true })).startAtLogin.command).toEqual({ kind: 'settings-set', key: 'startForgesAtLogin', value: false });
  });

  test('"Notify me while Gaia is open" shows whether notifications are on and sends them turned over with every kind kept', () => {
    const { notify } = panelOf(FLEET_FIVE_FORGES);
    expect([notify.label, notify.checked]).toEqual(['Notify me while Gaia is open', true]);
    expect(notify.command).toEqual({
      kind:  'settings-set',
      key:   'notifications',
      value: { enabled: false, kinds: FLEET_FIVE_FORGES.settings.notifications.kinds },
    });
  });

  test('are off while a settings change is on its way', () => {
    const sender = senderOver([() => new Promise<Response>(() => undefined)]);
    void sender.send({ kind: 'settings-set', key: 'theme', value: 'dark' });
    const panel = panelOf(FLEET_FIVE_FORGES, sender.states());
    expect([panel.startAtLogin.disabled, panel.notify.disabled]).toEqual([true, true]);
    expect(whatNotifiesOf(FLEET_FIVE_FORGES, sender.states()).kinds.every((kind) => kind.disabled)).toBe(true);
  });
});

describe('Gaia\'s settings file', () => {
  test('one newer than this Gaia is said, and leaves every checkbox off, since Gaia never writes it', () => {
    const newer = withSettingsFile(FLEET_FIVE_FORGES, 'newer-version');
    const panel = panelOf(newer);
    expect(panel.settingsFileLine).toBe('Gaia\'s settings were written by a newer Gaia. This Gaia runs on its defaults and leaves that file as it is.');
    expect([panel.startAtLogin.disabled, panel.notify.disabled]).toEqual([true, true]);
    expect(whatNotifiesOf(newer).kinds.every((kind) => kind.disabled)).toBe(true);
  });

  test('one that cannot be read is said, and the checkboxes stay on, since the next change writes it again', () => {
    const panel = panelOf(withSettingsFile(FLEET_FIVE_FORGES, 'unreadable'));
    expect(panel.settingsFileLine).toBe('Gaia\'s settings could not be read. Gaia runs on its defaults until a change here writes them again.');
    expect([panel.startAtLogin.disabled, panel.notify.disabled]).toEqual([false, false]);
  });

  test('one read, or none yet, says nothing', () => {
    expect(panelOf(FLEET_FIVE_FORGES).settingsFileLine).toBeNull();
    expect(panelOf(FLEET_EMPTY).settingsFileLine).toBeNull();
  });
});

describe('the facts', () => {
  test('name the forge program and the registry from ~, the contracts Gaia reads, and Gaia\'s version on its address', () => {
    expect(panelOf(FLEET_FIVE_FORGES).facts).toEqual([
      { label: 'Forge program', value: '~/.bun/bin/forge' },
      { label: 'Registry', value: '~/.forge-monitor/projects.json' },
      { label: 'Gaia reads', value: 'monitor 3 · control 2 · embed 1' },
      { label: 'Gaia', value: '0.1.0 on 127.0.0.1:4790' },
    ]);
  });

  test('say in words that no forge program was found, and print a path outside the home folder whole', () => {
    const elsewhere = { ...FLEET_EMPTY, gaia: { ...FLEET_EMPTY.gaia, registryPath: '/Volumes/Example/projects.json' } };
    const [forgeProgram, registry] = panelOf(elsewhere).facts;
    expect(forgeProgram).toEqual({ label: 'Forge program', value: 'not found', valueFace: 'ui' });
    expect(registry).toEqual({ label: 'Registry', value: '/Volumes/Example/projects.json' });
  });
});

describe('a refused settings change', () => {
  test('shows in the panel with the forge\'s code and sentence, and offers the same checkbox again', async () => {
    const { commandStates, sentSettingsChange } = await refusedStartAtLogin();
    expect(panelOf(FLEET_FIVE_FORGES, commandStates, sentSettingsChange).refusal).toEqual({
      commandLabel:  'Start the running forges at login',
      code:          'login-item-unwritable',
      sentence:      LOGIN_ITEM_REFUSAL_SENTENCE,
      retryCheckbox: sentSettingsChange.checkbox,
    });
  });

  test('shows only where it was sent from: not in "What notifies"', async () => {
    const { commandStates, sentSettingsChange } = await refusedStartAtLogin();
    expect(whatNotifiesOf(FLEET_FIVE_FORGES, commandStates, sentSettingsChange).refusal).toBeNull();
  });

  test('shows nowhere while the change is on its way, nor for a settings change another part of the page sent', async () => {
    const { commandStates, sentSettingsChange } = await refusedStartAtLogin();
    expect(panelOf(FLEET_FIVE_FORGES, commandStates, { checkbox: sentSettingsChange.checkbox, result: null }).refusal).toBeNull();
    expect(panelOf(FLEET_FIVE_FORGES, commandStates, null).refusal).toBeNull();
  });
});

describe('"What notifies" (C2)', () => {
  test('lists the seven kinds in C2\'s order, each with its line, ticked as the settings hold them', () => {
    const { kinds, offLine } = whatNotifiesOf(FLEET_FIVE_FORGES);
    expect(kinds.map((kind) => [kind.label, kind.checked])).toEqual([
      ['Escalated questions', true],
      ['Questions', true],
      ['Reviews and merge accepts', true],
      ['A forge holds its launches or stops answering', true],
      ['A quiet agent', true],
      ['The machine is at its agent limit', false],
      ['Draft tickets', false],
    ]);
    expect(kinds.every((kind) => kind.explanation !== null && kind.place === 'what-notifies')).toBe(true);
    expect(offLine).toBeNull();
  });

  test('a kind sends the notifications with only its own kind turned over', () => {
    const draftTickets = whatNotifiesOf(FLEET_FIVE_FORGES).kinds.find((kind) => kind.label === 'Draft tickets');
    expect(draftTickets?.command).toEqual({
      kind:  'settings-set',
      key:   'notifications',
      value: { enabled: true, kinds: { ...FLEET_FIVE_FORGES.settings.notifications.kinds, 'draft-tickets': true } },
    });
  });

  test('says that no kind notifies while notifications are off', () => {
    const off = withSettings(FLEET_FIVE_FORGES, { notifications: { ...FLEET_FIVE_FORGES.settings.notifications, enabled: false } });
    expect(whatNotifiesOf(off).offLine).toBe('"Notify me while Gaia is open" is off, so no kind notifies until it is on again.');
  });
});
