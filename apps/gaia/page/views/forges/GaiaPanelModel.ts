/**
 * What the Forges view's Gaia panel shows of a fleet document (SCREENS A4): "Notify me while Gaia is open", a switch that sends
 * `settings-set`; the forge program, the registry, and this Gaia's version, the one forge version it is built for and its address;
 * and, behind "What notifies", C2's seven kinds. A settings file newer than this Gaia is said once, and the switches are then off. A
 * refusal shows in the place whose switch sent the change, and only for that send.
 */
import type { CommandBody }                                                         from '../../@types/CommandDocument.ts';
import type { FleetDocument, FleetDocumentNotificationKind, FleetDocumentSettings } from '../../@types/FleetDocument.ts';
import { type CommandResult, CommandSender, type CommandStates }                    from '../../api/CommandSender.ts';
import { CommandFailureTextUtil, type RefusalText }                                 from '../../shared/utils/CommandFailureTextUtil.ts';
import { ForgeVersionsTextUtil }                                                    from '../../shared/utils/ForgeVersionsTextUtil.ts';
import { PathTextUtil }                                                             from '../../shared/utils/PathTextUtil.ts';

/** One of Gaia's facts: its value in mono, unless the fact says its value is words. */
export interface GaiaFact {
  readonly label:      string;
  readonly value:      string;
  readonly valueFace?: 'mono' | 'ui';
}

/** Where a settings switch sits: the Gaia panel, or the "What notifies" list over the view. */
export type SettingsPlace = 'gaia-panel' | 'what-notifies';

/** One settings checkbox: its label, whether it is ticked, and the change it sends when it is clicked. */
export interface SettingsCheckbox {
  readonly place:       SettingsPlace;
  readonly label:       string;
  readonly explanation: string | null;
  readonly checked:     boolean;
  readonly command:     CommandBody;
  readonly disabled:    boolean;
}

/** The last change a settings checkbox of this view sent, and what came of it once it answered. */
export interface SentSettingsChange {
  readonly checkbox: SettingsCheckbox;
  readonly result:   CommandResult | null;
}

/** A refused settings change, beside the checkbox that sent it; "Try again" sends that checkbox's change once more. */
export interface SettingsRefusal extends RefusalText {
  readonly commandLabel:  string;
  readonly retryCheckbox: SettingsCheckbox;
}

export interface GaiaPanelSurroundings {
  readonly commandStates:      CommandStates;
  readonly sentSettingsChange: SentSettingsChange | null;
}

export interface GaiaPanelContent {
  readonly notify:           SettingsCheckbox;
  /** Said when Gaia runs on its defaults because its settings file cannot be used. */
  readonly settingsFileLine: string | null;
  readonly facts:            readonly GaiaFact[];
  /** This Gaia's own facts, each a label and its mono value on one line, under one label. */
  readonly thisGaiaFacts:    readonly GaiaFact[];
  readonly refusal:          SettingsRefusal | null;
}

export interface WhatNotifiesContent {
  readonly kinds:   readonly SettingsCheckbox[];
  /** Said while "Notify me while Gaia is open" is off, since then no kind notifies. */
  readonly offLine: string | null;
  readonly refusal: SettingsRefusal | null;
}

const NOTIFY_LABEL = 'Notify me while Gaia is open';

/** C2's seven kinds, in its order, each named and explained as the artboard does. */
const NOTIFICATION_KINDS: readonly { readonly kind: FleetDocumentNotificationKind; readonly label: string; readonly explanation: string }[] = [
  { kind: 'escalated-questions', label: 'Escalated questions', explanation: 'An incident the Assistant could not settle.' },
  { kind: 'questions', label: 'Questions', explanation: 'An agent or Hephaestus asks, and work waits on the answer.' },
  { kind: 'reviews-and-merge-accepts', label: 'Reviews and merge accepts', explanation: 'A ticket is ready for review, or reviewed and waiting to be accepted.' },
  {
    kind:        'forges-held-or-unreachable',
    label:       'A forge holds its launches or stops answering',
    explanation: 'Install version changed, a failed Baton pass, or an unreachable Hephaestus.',
  },
  { kind: 'quiet-agents', label: 'A quiet agent', explanation: 'An agent whose log stood still for the forge\'s own number of sweeps.' },
  { kind: 'machine-at-agent-limit', label: 'The machine is at its agent limit', explanation: 'Ready tickets wait for a machine slot.' },
  { kind: 'draft-tickets', label: 'Draft tickets', explanation: 'A draft was filed and waits to be readied.' },
];

const SETTINGS_FILE_LINES: Readonly<Record<FleetDocument['gaia']['settingsFile'], string | null>> = {
  'read':          null,
  'absent':        null,
  'newer-version': 'Gaia\'s settings were written by a newer Gaia. This Gaia runs on its defaults and leaves that file as it is.',
  'unreadable':    'Gaia\'s settings could not be read. Gaia runs on its defaults until a change here writes them again.',
};

/** A settings file newer than this Gaia is never written, so its checkboxes cannot change anything. */
function settingsCannotChange(fleetDocument: FleetDocument, commandStates: CommandStates): boolean {
  const settingsChangeIsOnItsWay = CommandSender.stateOf(commandStates, { fleetCommand: 'settings-set' }).onItsWay !== null;
  return settingsChangeIsOnItsWay || fleetDocument.gaia.settingsFile === 'newer-version';
}

function notificationsWith(settings: FleetDocumentSettings, change: Partial<FleetDocumentSettings['notifications']>): FleetDocumentSettings['notifications'] {
  return { enabled: settings.notifications.enabled, kinds: { ...settings.notifications.kinds }, ...change };
}

/** The refusal of this view's own last settings change, in the place whose checkbox sent it, until dismissed or the next success. */
function refusalIn(place: SettingsPlace, { commandStates, sentSettingsChange }: GaiaPanelSurroundings): SettingsRefusal | null {
  const { failure } = CommandSender.stateOf(commandStates, { fleetCommand: 'settings-set' });
  if (failure === null || sentSettingsChange === null || sentSettingsChange.checkbox.place !== place) return null;
  if (sentSettingsChange.result !== failure.result) return null;
  return {
    commandLabel:  sentSettingsChange.checkbox.label,
    ...CommandFailureTextUtil.refusalTextOf(failure),
    retryCheckbox: sentSettingsChange.checkbox,
  };
}

/** The address without its scheme, as the artboard prints it: `127.0.0.1:4790`. */
function hostOf(address: string): string {
  return address.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
}

function factsOf(fleetDocument: FleetDocument): GaiaFact[] {
  const { gaia } = fleetDocument;
  const forgeProgram: GaiaFact = gaia.forgeProgramInUse === null
    ? { label: 'Forge program', value: 'not found', valueFace: 'ui' }
    : { label: 'Forge program', value: PathTextUtil.homeRelativePathOf(gaia.forgeProgramInUse, gaia.homeFolder) };
  return [
    forgeProgram,
    { label: 'Registry', value: PathTextUtil.homeRelativePathOf(gaia.registryPath, gaia.homeFolder) },
  ];
}

/** This Gaia's system version and the one forge version it is built for, never its package version. */
function thisGaiaFactsOf({ gaia }: FleetDocument): GaiaFact[] {
  return [
    { label: 'version', value: ForgeVersionsTextUtil.versionTextOf(gaia.versions.systemVersion) },
    { label: 'built for forge', value: ForgeVersionsTextUtil.versionTextOf(gaia.versions.supportedForgeVersion) },
    { label: 'address', value: hostOf(gaia.address) },
  ];
}

function gaiaPanelOf(fleetDocument: FleetDocument, surroundings: GaiaPanelSurroundings): GaiaPanelContent {
  const { settings } = fleetDocument;
  const disabled = settingsCannotChange(fleetDocument, surroundings.commandStates);
  return {
    notify: {
      place:       'gaia-panel',
      label:       NOTIFY_LABEL,
      explanation: null,
      checked:     settings.notifications.enabled,
      command:     { kind: 'settings-set', key: 'notifications', value: notificationsWith(settings, { enabled: !settings.notifications.enabled }) },
      disabled,
    },
    settingsFileLine: SETTINGS_FILE_LINES[fleetDocument.gaia.settingsFile],
    facts:            factsOf(fleetDocument),
    thisGaiaFacts:    thisGaiaFactsOf(fleetDocument),
    refusal:          refusalIn('gaia-panel', surroundings),
  };
}

function whatNotifiesOf(fleetDocument: FleetDocument, surroundings: GaiaPanelSurroundings): WhatNotifiesContent {
  const { settings } = fleetDocument;
  const disabled = settingsCannotChange(fleetDocument, surroundings.commandStates);
  return {
    kinds: NOTIFICATION_KINDS.map(({ kind, label, explanation }) => {
      const checked = settings.notifications.kinds[kind];
      return {
        place:   'what-notifies',
        label,
        explanation,
        checked,
        command: { kind: 'settings-set', key: 'notifications', value: notificationsWith(settings, { kinds: { ...settings.notifications.kinds, [kind]: !checked } }) },
        disabled,
      };
    }),
    offLine: settings.notifications.enabled ? null : `"${NOTIFY_LABEL}" is off, so no kind notifies until it is on again.`,
    refusal: refusalIn('what-notifies', surroundings),
  };
}

export const GaiaPanelModel = {
  gaiaPanelOf,
  whatNotifiesOf,
} as const;
