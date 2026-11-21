/** The presence lines of `status`: the crash a down forge is off after, or the live forge's last start, beat and supervision. */
import type {
  CrashReading,
  StatusCrashLog,
  StatusPresence,
  Supervision
} from '../../src/services/hephaestus/PresenceStatus.ts';
import { PRODUCT_NAMES } from '../../src/shared/constants/ProductNames.ts';

const { PROGRAM } = PRODUCT_NAMES;

const SUPERVISION_TEXT: Readonly<Record<Supervision, string>> = Object.freeze({
  'supervising':          'Talos supervises the agents',
  'stopped':              'Talos stopped supervising the agents: their lease ended',
  'checking-after-a-gap': 'Talos checks the agents after a gap in its ticks',
  'not-yet-renewed':      'Talos waits for the first lease renewal',
  'no-talos':             'no Talos runs',
});

function crashedHephaestusLockTextOf(crash: CrashReading): string {
  const hephaestusLock = crash.crashedGeneration === null ? 'a Hephaestus lock nothing names' : `Hephaestus lock ${crash.crashedGeneration}`;
  return `${hephaestusLock}${crash.suspected ? ', suspected before the machine restarted' : ''}`;
}

function crashLogTextOf(crashLog: StatusCrashLog | null): string {
  return crashLog === null ? `no crash log yet: \`${PROGRAM} start\` writes it` : `crash log ${crashLog.number}, ${crashLog.path}`;
}

function offAfterACrashLineOf(crash: CrashReading, crashLog: StatusCrashLog | null): string {
  return `${PROGRAM}: off after a crash of ${crashedHephaestusLockTextOf(crash)} (${crashLogTextOf(crashLog)}); start it again with \`${PROGRAM} start\`, `
    + `then resume the interrupted work with \`${PROGRAM} resume --all\``;
}

function lastStartLineOf({ lastStart, crashLog }: StatusPresence): string {
  if (lastStart === null) return 'last start: not recorded';
  const suspectedText = lastStart.crashSuspected ? ', a crash suspected' : '';
  return `last start: ${lastStart.kind}${suspectedText}${crashLog === null ? '' : ` (${crashLogTextOf(crashLog)})`}`;
}

function abandonedPassesLineOf({ abandonedPasses }: StatusPresence): string {
  if (abandonedPasses === null) return 'abandoned passes: not recorded';
  const { inARow, last } = abandonedPasses;
  return `abandoned passes in a row: ${inARow}${last === null ? '' : `; the last ${last.reason} at ${last.at}: ${last.detail}`}`;
}

function livePresenceLinesOf(presence: StatusPresence): string[] {
  const { heartbeat } = presence;
  return [
    lastStartLineOf(presence),
    heartbeat === null ? 'heartbeat: none yet' : `heartbeat: beat ${heartbeat.sequence} at ${heartbeat.at}`,
    `supervision: ${SUPERVISION_TEXT[presence.supervision]}`,
    abandonedPassesLineOf(presence),
  ];
}

export const PresenceWording = Object.freeze({ offAfterACrashLineOf, livePresenceLinesOf });
