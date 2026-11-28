/**
 * The control contract's rule: every kind but a client-only one names a verb of `cli/CommandTable.ts`, every mutating verb is a kind's or on the
 * exact list User runs by hand, and every verb is placed once. Each list is exact both ways, so a stale entry fails as loudly as a missing one.
 */
import { describe, expect, test } from 'bun:test';
import type { ForgeResumeTarget } from 'forge-contracts/ForgeControlCommand';

import { CONTROL_COMMAND_KINDS }                 from '../src/services/control/ControlService.ts';
import type { ControlCommandKind, ResumeTarget } from '../src/shared/@types/ControlCommand.ts';
import { COMMAND_NAMES }                         from './CommandTable.ts';
import {
  BY_HAND_VERB_OF_CONTROL_KIND,
  CLIENT_ONLY_CONTROL_KINDS,
  type ClientOnlyControlCommandKind,
  OTHER_VERBS_OF_CONTROL_KIND,
  READ_ONLY_VERBS_UNDER_A_JOB,
  RELAYED_VERB_OF_CONTROL_KIND,
  UNRELAYED_VERB_OF_CONTROL_KIND
} from './constants/JobVerbs.ts';
import { QUESTION_SUBCOMMAND_NAMES } from './decisions/QuestionCommand.ts';
import { MACHINE_SUBCOMMAND_NAMES }  from './dispatch/machine/MachineCommand.ts';
import { DOCUMENT_SUBCOMMAND_NAMES } from './documents/DocumentCommand.ts';
import { DRAFT_SUBCOMMAND_NAMES }    from './drafts/DraftCommand.ts';
import { EPIC_SUBCOMMAND_NAMES }     from './epics/EpicCommand.ts';
import { GATE_SUBCOMMAND_NAMES }     from './gates/GateCommand.ts';
import { INCIDENT_SUBCOMMAND_NAMES } from './incidents/IncidentCommand.ts';
import { INTAKE_SUBCOMMAND_NAMES }   from './intake/IntakeCommand.ts';
import { JOB_SUBCOMMAND_NAMES }      from './jobs/JobCommand.ts';
import { MERGE_SUBCOMMAND_NAMES }    from './merges/MergeCommand.ts';
import { NEED_SUBCOMMAND_NAMES }     from './needs/NeedCommand.ts';
import { PIPELINE_SUBCOMMAND_NAMES } from './pipeline/PipelineCommand.ts';
import { TICKET_SUBCOMMAND_NAMES }   from './tickets/TicketCommand.ts';
import { WORKTREE_SUBCOMMAND_NAMES } from './worktrees/WorktreeCommand.ts';

/** True only when each type is assignable to the other, so a member added on one side alone fails the typecheck. */
type IsTheSameTypeAs<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;

const RESUME_TARGET_IS_THE_CONTRACTS: IsTheSameTypeAs<ResumeTarget, ForgeResumeTarget> = true;

const VERB_OF_KIND: { readonly [Kind in Exclude<ControlCommandKind, ClientOnlyControlCommandKind>]: string } = {
  ...RELAYED_VERB_OF_CONTROL_KIND,
  ...UNRELAYED_VERB_OF_CONTROL_KIND,
  ...BY_HAND_VERB_OF_CONTROL_KIND,
};

/**
 * Mutating verbs that apply no control command, never relayed and never offered in the UI (design section 9.1): machine setup, and
 * Hephaestus's own start and stop.
 */
const NOT_RELAYABLE_MUTATING_VERBS = [
  'init',
  'update',
  'start',
];

/**
 * `await` is the wait of User's own session around Hephaestus, which runs under no job; `crash-log` reads a crash log and writes nothing.
 */
const READ_ONLY_VERBS = [...READ_ONLY_VERBS_UNDER_A_JOB, 'await', 'crash-log', 'hephaestus-log'];

/** Verbs retired with no command in their place. */
const RETIRING_VERBS = ['hook'];

interface ControlContract {
  readonly verbOfKind:                Readonly<Record<string, string>>;
  readonly notRelayableMutatingVerbs: readonly string[];
  readonly readOnlyVerbs:             readonly string[];
  readonly retiringVerbs:             readonly string[];
  readonly tableVerbs:                readonly string[];
}

function subcommandVerbsOf(command: string, subcommandNames: readonly string[]): string[] {
  return subcommandNames.map((subcommand) => `${command} ${subcommand}`);
}

/** Every verb `agent-progress` answers: a command, or a command and its subcommand where the command has several. */
function tableVerbsOf(commandNames: readonly string[]): string[] {
  return commandNames.flatMap((command) => {
    // `ticket deliver` answers only with --by-hand, the one record-only lifecycle verb.
    if (command === 'ticket') return subcommandVerbsOf(command, TICKET_SUBCOMMAND_NAMES).map((verb) => (verb === 'ticket deliver' ? 'ticket deliver --by-hand' : verb));
    if (command === 'epic') return subcommandVerbsOf(command, EPIC_SUBCOMMAND_NAMES);
    if (command === 'draft') return subcommandVerbsOf(command, DRAFT_SUBCOMMAND_NAMES);
    if (command === 'job') return subcommandVerbsOf(command, JOB_SUBCOMMAND_NAMES);
    if (command === 'incident') return subcommandVerbsOf(command, INCIDENT_SUBCOMMAND_NAMES);
    if (command === 'worktree') return subcommandVerbsOf(command, WORKTREE_SUBCOMMAND_NAMES);
    if (command === 'merge') return subcommandVerbsOf(command, MERGE_SUBCOMMAND_NAMES);
    if (command === 'gate') return subcommandVerbsOf(command, GATE_SUBCOMMAND_NAMES);
    if (command === 'intake') return [command, ...subcommandVerbsOf(command, INTAKE_SUBCOMMAND_NAMES)];
    if (command === 'question') return subcommandVerbsOf(command, QUESTION_SUBCOMMAND_NAMES);
    if (command === 'need') return subcommandVerbsOf(command, NEED_SUBCOMMAND_NAMES);
    if (command === 'document') return subcommandVerbsOf(command, DOCUMENT_SUBCOMMAND_NAMES);
    if (command === 'pipeline') return subcommandVerbsOf(command, PIPELINE_SUBCOMMAND_NAMES);
    if (command === 'machine') return subcommandVerbsOf(command, MACHINE_SUBCOMMAND_NAMES);
    // The measurement events retire as `hook`; the guards a Hephaestus renders into a job's settings stay.
    if (command === 'hook') return [command, 'hook bash-domains', 'hook session-start', 'hook stage-edits'];
    return [command];
  });
}

function contractViolationsOf(contract: ControlContract): string[] {
  const tableVerbs = new Set(contract.tableVerbs);
  const placements = [
    ...Object.values(contract.verbOfKind).map((verb) => ({ verb, place: 'a control kind' })),
    ...Object.values(OTHER_VERBS_OF_CONTROL_KIND).flat().map((verb) => ({ verb, place: 'a control kind' })),
    ...contract.notRelayableMutatingVerbs.map((verb) => ({ verb, place: 'the not-relayable list' })),
    ...contract.readOnlyVerbs.map((verb) => ({ verb, place: 'the read-only list' })),
    ...contract.retiringVerbs.map((verb) => ({ verb, place: 'the retiring list' })),
  ];
  const kindsWithoutAVerb = Object.entries(contract.verbOfKind)
    .filter(([, verb]) => !tableVerbs.has(verb))
    .map(([kind, verb]) => `kind ${kind} names ${verb}, which cli/CommandTable.ts does not answer`);
  const staleListEntries = placements
    .filter(({ verb, place }) => place !== 'a control kind' && !tableVerbs.has(verb))
    .map(({ verb, place }) => `${verb} is on ${place} but cli/CommandTable.ts does not answer it`);
  const placedVerbs = new Set(placements.map(({ verb }) => verb));
  const verbsWithoutAKind = contract.tableVerbs
    .filter((verb) => !placedVerbs.has(verb))
    .map((verb) => `${verb} is relayable but no control kind applies it`);
  const placesOfVerb = Map.groupBy(placements.filter(({ place }) => place !== 'a control kind'), ({ verb }) => verb);
  const kindVerbs = new Set(Object.values(contract.verbOfKind));
  const verbsPlacedTwice = [...placesOfVerb.entries()]
    .filter(([verb, places]) => places.length + (kindVerbs.has(verb) ? 1 : 0) > 1)
    .map(([verb]) => `${verb} is placed more than once`);
  return [...kindsWithoutAVerb, ...staleListEntries, ...verbsWithoutAKind, ...verbsPlacedTwice];
}

const CONTRACT: ControlContract = {
  verbOfKind:                VERB_OF_KIND,
  notRelayableMutatingVerbs: NOT_RELAYABLE_MUTATING_VERBS,
  readOnlyVerbs:             READ_ONLY_VERBS,
  retiringVerbs:             RETIRING_VERBS,
  tableVerbs:                tableVerbsOf(COMMAND_NAMES),
};

describe('the control contract', () => {
  // Hephaestus makes every lifecycle move, and User records only a ticket landed outside it, which no job relays.
  test('`ticket deliver --by-hand` is the only lifecycle verb, the verb of an unrelayed kind, and no lifecycle verb is on the not-relayable list', () => {
    const LIFECYCLE_VERB_PATTERN = /^(?:release|rework|review record|dispatcher|ticket (?:claim|start|finish|approve|deliver))\b/;
    expect(LIFECYCLE_VERB_PATTERN.test('ticket finish'), 'the pattern finds a lifecycle verb').toBe(true);
    expect(Object.values(VERB_OF_KIND).filter((verb) => LIFECYCLE_VERB_PATTERN.test(verb))).toEqual(['ticket deliver --by-hand']);
    expect(Object.values(UNRELAYED_VERB_OF_CONTROL_KIND)).toContain('ticket deliver --by-hand');
    expect(NOT_RELAYABLE_MUTATING_VERBS.filter((verb) => LIFECYCLE_VERB_PATTERN.test(verb))).toEqual([]);
  });

  test('forge\'s resume target is the contract\'s, member for member', () => {
    expect(RESUME_TARGET_IS_THE_CONTRACTS).toBe(true);
  });

  test('the scan saw the table: ticket, epic and draft verbs and the top-level commands are all there', () => {
    expect(CONTRACT.tableVerbs).toContain('ticket add');
    expect(CONTRACT.tableVerbs).toContain('epic add');
    expect(CONTRACT.tableVerbs).toContain('draft open');
    expect(CONTRACT.tableVerbs).toContain('concurrency');
    expect(CONTRACT.tableVerbs.length).toBeGreaterThan(Object.keys(VERB_OF_KIND).length);
  });

  test('every kind the service applies has a verb here but a client-only kind, and every verb here a kind the service applies', () => {
    const kindsWithAVerb = CONTROL_COMMAND_KINDS.filter((kind) => !(CLIENT_ONLY_CONTROL_KINDS as readonly string[]).includes(kind));
    expect([...kindsWithAVerb].sort() as string[]).toEqual(Object.keys(VERB_OF_KIND).sort());
    expect(CLIENT_ONLY_CONTROL_KINDS.filter((kind) => !CONTROL_COMMAND_KINDS.includes(kind))).toEqual([]);
  });

  test('no kind without a verb, no relayable verb without a kind, and every list exact both ways', () => {
    expect(contractViolationsOf(CONTRACT)).toEqual([]);
  });

  test('a kind whose verb the table does not answer is named', () => {
    expect(contractViolationsOf({ ...CONTRACT, verbOfKind: { ...VERB_OF_KIND, 'ticket-shelve': 'ticket shelve' } })).toEqual([
      'kind ticket-shelve names ticket shelve, which cli/CommandTable.ts does not answer',
    ]);
  });

  test('a mutating verb the table answers with no kind and on no list is named as relayable without a kind', () => {
    expect(contractViolationsOf({ ...CONTRACT, tableVerbs: [...CONTRACT.tableVerbs, 'ticket shelve'] })).toEqual([
      'ticket shelve is relayable but no control kind applies it',
    ]);
    const withoutTheHoldKind = Object.fromEntries(Object.entries(VERB_OF_KIND).filter(([kind]) => kind !== 'ticket-hold'));
    expect(contractViolationsOf({ ...CONTRACT, verbOfKind: withoutTheHoldKind })).toEqual(['ticket hold is relayable but no control kind applies it']);
  });

  test('a stale not-relayable entry and a verb placed twice are named', () => {
    expect(contractViolationsOf({ ...CONTRACT, notRelayableMutatingVerbs: [...NOT_RELAYABLE_MUTATING_VERBS, 'ticket waive'] })).toEqual([
      'ticket waive is on the not-relayable list but cli/CommandTable.ts does not answer it',
    ]);
    expect(contractViolationsOf({ ...CONTRACT, notRelayableMutatingVerbs: [...NOT_RELAYABLE_MUTATING_VERBS, 'ticket hold'] })).toEqual([
      'ticket hold is placed more than once',
    ]);
  });
});
