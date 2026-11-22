/**
 * The Gaia panel's content and its "What notifies" list. What matters (`docs/design/screens.md` A4 and C2): each checkbox shows the setting and sends
 * `settings-set` with that one setting turned over, the kinds' checkbox only its own kind; the facts read the document's paths from `~`,
 * and this Gaia's system version, the one forge version it is built for and its address, never a package version or the contracts it
 * reads, and say in words when no forge program is known; a settings change on its way
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

const SETTINGS_REFUSAL_SENTENCE = 'Gaia could not write its settings.';

const SETTINGS_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'settings-unwritable',
  text:          SETTINGS_REFUSAL_SENTENCE,
  forges:        [],
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

/** The panel's "Notify me" sent over a server that refuses it, and the change as the view keeps it once it answered. */
async function refusedNotify(): Promise<{ readonly commandStates: CommandStates; readonly sentSettingsChange: SentSettingsChange }> {
  const sender = senderOver([() => Promise.resolve(answerResponse(SETTINGS_REFUSED))]);
  const checkbox = panelOf(FLEET_FIVE_FORGES).notify;
  const result = await sender.send(checkbox.command);
  return { commandStates: sender.states(), sentSettingsChange: { checkbox, result } };
}

describe('the panel\'s checkbox', () => {
  test('"Notify me while Gaia is open" shows whether notifications are on and sends them turned over with every kind kept', () => {
    const { notify } = panelOf(FLEET_FIVE_FORGES);
    expect([notify.label, notify.checked, notify.disabled]).toEqual(['Notify me while Gaia is open', true, false]);
    expect(notify.command).toEqual({
      kind:  'settings-set',
      key:   'notifications',
      value: { enabled: false, kinds: FLEET_FIVE_FORGES.settings.notifications.kinds },
    });
  });

  test('is off, as every kind is, while a settings change is on its way', () => {
    const sender = senderOver([() => new Promise<Response>(() => undefined)]);
    void sender.send({ kind: 'settings-set', key: 'theme', value: 'dark' });
    const panel = panelOf(FLEET_FIVE_FORGES, sender.states());
    expect(panel.notify.disabled).toBe(true);
    expect(whatNotifiesOf(FLEET_FIVE_FORGES, sender.states()).kinds.every((kind) => kind.disabled)).toBe(true);
  });
});

describe('Gaia\'s settings file', () => {
  test('one newer than this Gaia is said, and leaves every checkbox off, since Gaia never writes it', () => {
    const newer = withSettingsFile(FLEET_FIVE_FORGES, 'newer-version');
    const panel = panelOf(newer);
    expect(panel.settingsFileLine).toBe('Gaia\'s settings were written by a newer Gaia. This Gaia runs on its defaults and leaves that file as it is.');
    expect(panel.notify.disabled).toBe(true);
    expect(whatNotifiesOf(newer).kinds.every((kind) => kind.disabled)).toBe(true);
  });

  test('one that cannot be read is said, and the checkboxes stay on, since the next change writes it again', () => {
    const panel = panelOf(withSettingsFile(FLEET_FIVE_FORGES, 'unreadable'));
    expect(panel.settingsFileLine).toBe('Gaia\'s settings could not be read. Gaia runs on its defaults until a change here writes them again.');
    expect(panel.notify.disabled).toBe(false);
  });

  test('one read, or none yet, says nothing', () => {
    expect(panelOf(FLEET_FIVE_FORGES).settingsFileLine).toBeNull();
    expect(panelOf(FLEET_EMPTY).settingsFileLine).toBeNull();
  });
});

describe('the facts', () => {
  test('name the forge program and the registry from ~, and this Gaia\'s system version, the forge version it is built for and its address', () => {
    const panel = panelOf(FLEET_FIVE_FORGES);
    expect(panel.facts).toEqual([
      { label: 'Forge program', value: '~/.bun/bin/forge' },
      { label: 'Registry', value: '~/.forge-monitor/projects.json' },
    ]);
    expect(panel.thisGaiaFacts).toEqual([
      { label: 'version', value: '1.0' },
      { label: 'built for forge', value: '1.1' },
      { label: 'address', value: '127.0.0.1:4790' },
    ]);
  });

  test('name no package version and no contract Gaia reads', () => {
    const panel = panelOf(FLEET_FIVE_FORGES);
    const printed = [...panel.facts, ...panel.thisGaiaFacts].flatMap((fact) => [fact.label, fact.value]).join(' ');
    expect([printed.includes(FLEET_FIVE_FORGES.gaia.gaiaVersion), printed.includes('monitor 5'), printed.includes('Gaia reads')]).toEqual([false, false, false]);
  });

  test('say in words that no forge program was found, and print a path outside the home folder whole', () => {
    const elsewhere = { ...FLEET_EMPTY, gaia: { ...FLEET_EMPTY.gaia, registryPath: '/Volumes/Example/projects.json' } };
    const [forgeProgram, registry] = panelOf(elsewhere).facts;
    expect(forgeProgram).toEqual({ label: 'Forge program', value: 'not found', valueFace: 'ui' });
    expect(registry).toEqual({ label: 'Registry', value: '/Volumes/Example/projects.json' });
  });
});

describe('a refused settings change', () => {
  test('shows in the panel with its code and sentence, and offers the same checkbox again', async () => {
    const { commandStates, sentSettingsChange } = await refusedNotify();
    expect(panelOf(FLEET_FIVE_FORGES, commandStates, sentSettingsChange).refusal).toEqual({
      refusedBy:     'gaia',
      commandLabel:  'Notify me while Gaia is open',
      code:          'settings-unwritable',
      sentence:      SETTINGS_REFUSAL_SENTENCE,
      retryCheckbox: sentSettingsChange.checkbox,
    });
  });

  test('shows only where it was sent from: not in "What notifies"', async () => {
    const { commandStates, sentSettingsChange } = await refusedNotify();
    expect(whatNotifiesOf(FLEET_FIVE_FORGES, commandStates, sentSettingsChange).refusal).toBeNull();
  });

  test('shows nowhere while the change is on its way, nor for a settings change another part of the page sent', async () => {
    const { commandStates, sentSettingsChange } = await refusedNotify();
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
