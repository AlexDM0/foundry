/**
 * How a forge is present, told from served facts alone: the registry's presence key, whether its Overseer answered the watch, and the
 * supervision its presence document serves; never a clock of Gaia's. A crashed, down or hung forge raises a forge alert in what waits on User.
 * A running Talos is not read as a running forge: only the Overseer's answer and the forge's own writes are.
 */
import type { ForgeAlertKind }                              from '../../../shared/@types/AttentionItem.ts';
import type { FleetAttentionItem, FleetForge }              from '../../../shared/@types/FleetSnapshot.ts';
import type { ForgePresence, ForgePresenceState }           from '../../../shared/@types/ForgePresence.ts';
import type { ForgeCondition, ForgeFidelity, ForgeReading } from '../../../shared/@types/ForgeReading.ts';
import { OVERSEER_ANSWERED_FIDELITIES }                     from '../../../shared/constants/ForgeFidelities.ts';

/** A forge older than Gaia supports answered its versions, so its Overseer answers though Gaia reads nothing more of it. */
const PRESENCE_ANSWERED_FIDELITIES: ReadonlySet<ForgeFidelity> = new Set<ForgeFidelity>([...OVERSEER_ANSWERED_FIDELITIES, 'older-contract']);

/** An Overseer that says it is starting or passing the baton answers, though nothing of it can be read yet. */
const ANSWERING_CONDITIONS: ReadonlySet<ForgeCondition> = new Set<ForgeCondition>(['starting', 'passing-baton']);

/** The registry's state of a forge whose Overseer does not answer, by the state the forge last wrote. */
const STATE_WITHOUT_AN_ANSWER = {
  'serving':     'down',
  'stopped':     'stopped',
  'handed-over': 'handed-over',
  'crashed':     'crashed',
} as const satisfies Record<NonNullable<ForgeReading['registryPresence']>['state'], ForgePresenceState>;

const ALERT_KIND_OF_STATE: Readonly<Partial<Record<ForgePresenceState, ForgeAlertKind>>> = {
  crashed: 'forge-crashed',
  down:    'forge-down',
  hung:    'forge-hung',
};

/** One alert per forge, so its key is the kind alone. */
const FORGE_ALERT_KEY_PREFIX = 'forge-alert:';

function overseerAnswers(reading: ForgeReading): boolean {
  return PRESENCE_ANSWERED_FIDELITIES.has(reading.fidelity) || ANSWERING_CONDITIONS.has(reading.condition);
}

/** A crash the registry records wins over an answer: the forge stays off after it until User starts it, and its start then writes `serving`. */
function presenceStateOf(reading: ForgeReading): ForgePresenceState {
  const { registryPresence, presenceReport } = reading;
  if (registryPresence?.state === 'crashed') return 'crashed';
  if (overseerAnswers(reading)) return presenceReport?.supervision === 'stopped' ? 'hung' : 'serving';
  return registryPresence === null ? 'unknown' : STATE_WITHOUT_AN_ANSWER[registryPresence.state];
}

function presenceOf(reading: ForgeReading): ForgePresence {
  return { state: presenceStateOf(reading), generation: reading.registryPresence?.generation ?? null, at: reading.registryPresence?.at ?? null };
}

function fleetForgeOf(reading: ForgeReading): FleetForge {
  const presence = presenceOf(reading);
  const report   = reading.fidelity === 'full' ? reading.presenceReport : null;
  return {
    ...reading,
    presence,
    crashSummary: presence.state === 'crashed' ? reading.registryPresence?.crash ?? null : null,
    crashLogs:    report === null ? [] : [...report.crashLogs],
    waitingWork:  report === null ? [] : [...report.interruptedWork],
  };
}

/** A crashed or down forge is offered its start; a hung one answers, so its alert opens its route, where its waiting work is. */
function forgeAlertOf(forge: FleetForge): FleetAttentionItem | null {
  const kind = ALERT_KIND_OF_STATE[forge.presence.state];
  if (kind === undefined) return null;
  const isCrash = kind === 'forge-crashed';
  return {
    trackerId:               forge.trackerId,
    key:                     `${FORGE_ALERT_KEY_PREFIX}${kind}`,
    kind,
    idText:                  '',
    ticketIds:               [],
    subject:                 '',
    jobId:                   null,
    askedBy:                 null,
    decisionKind:            null,
    escalatedFromIncidentId: null,
    metaText:                null,
    stamp:                   (isCrash ? forge.presence.at : forge.lastReportedAt ?? forge.presence.at) ?? '',
    stampWord:               isCrash ? 'crashed' : 'last reported',
    actionLabel:             kind === 'forge-hung' ? 'Open' : 'Start',
    boardRoute:              null,
  };
}

export const ForgePresenceUtil = {
  presenceOf,
  fleetForgeOf,
  forgeAlertOf,
} as const;
