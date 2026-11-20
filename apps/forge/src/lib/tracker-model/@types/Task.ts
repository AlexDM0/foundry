/**
 * The tracker-model building block: the records of a board and their vocabularies and rules. It imports nothing outside its own
 * folder and no Node builtin, because it is also compiled under DOM-only options.
 */
import type { GatePhase } from './GatePhase.ts';

export type TaskStatus = 'committed' | 'in-progress' | 'paused' | 'in-review' | 're-review' | 'reviewed' | 'delivered' | 'abandoned';

/**
 * What a row, or a ticket through its row, shows: its status, except that an in-review row of an in-review ticket is being reviewed. A
 * draft ticket has no row and shows `draft`, and a ticket ready for review shows `ready-for-review`.
 */
export type DisplayState = TaskStatus | 'reviewing' | 'draft' | 'ready-for-review';

/** The stages of a ticket that crosses into a whitelisted package, in the order a crossing first runs them. */
export type TicketStageName = 'build' | 'package-build' | 'package-review' | 'adapt' | 'review';

export interface TicketStage {
  name:   TicketStageName;
  /** The key of the entity whose agent runs the stage: the ticket's home entity, or the crossed package for a package stage. */
  entity: string;
}

/** One status a row actually reached, and when. A correction never files one: a correction is not something that happened. */
export interface TaskPhase {
  status: TaskStatus;
  at:     string;
}

export interface Task {
  id:              number;
  name:            string;
  status:          TaskStatus;
  start:           string | null;
  end:             string | null;
  owner:           string;
  note:            string;
  /** The padded id (`"003"`) of the ticket this row belongs to, or `null` for a free-standing task. */
  ticket:          string | null;
  /** `null` means nobody reported a figure; `0` is an answer. */
  tokens:          number | null;
  /** When the row first reached `reviewed`; kept through delivery, so a delivered row says whether it was reviewed. */
  reviewed?:       string;
  /** Which review pass the row is in, counted from the second; absent while the first pass is the only one there has been. */
  reviewRound?:    number;
  /** The phases this row went through, oldest first; absent on a row filed before the field existed, which a reader says rather than guesses. */
  history?:        TaskPhase[];
  /**
   * The agent this row belongs to: every row one claim started carries the claimed ids joined (`"003,004,005"`), so a bundle's
   * in-progress rows count as one agent. Absent on a row no claim started, which counts as an agent of its own.
   */
  agent?:          string;
  /**
   * The padded id of the ticket this row reviews, stored when the bar is filed; a reader draws the row directly above that ticket's own row.
   * Absent on every other row; a free-standing row filed before the field existed is given it from its `Review <N> #<id>` name at ingestion.
   */
  reviewOf?:       string;
  /** Which review of the `reviewOf` ticket this bar is, from 1, fixed when the bar is filed; unlike `reviewRound`, no transition moves it. */
  reviewBarRound?: number;
  /**
   * The phase hash of the gates the row's ticket was last gated by, in `greenPhase`; absent before its first gate run, or when no pipeline
   * was stored then.
   */
  pipelineHash?:   string;
  /**
   * On a forge with entities: the phase hash of each entity whose gates that run ran, by entity key, beside `pipelineHash`. Never written on
   * a forge without entities.
   */
  pipelineHashes?: Record<string, string>;
  /** The phase of that gate run; written with `pipelineHash`. A row with `pipelineHash` and no `greenPhase` has no current green. */
  greenPhase?:     GatePhase;
  /**
   * The tree OID the Overseer's last gate run on the row's ticket passed, judged by `pipelineHash` in `greenPhase`; absent before a green
   * run, and removed by a run that was not green.
   */
  greenTree?:      string;
  /** On a ticket's row once its review passed, until it lands or leaves in-review; absent on every other row. */
  mergeQueued?:    true;
  /** With merge approval on: User accepted the queued ticket for its Airlock. Cleared with `mergeQueued`, and by a conflicting merge-in. */
  mergeAccepted?:  true;
  /**
   * On a forge with entities, once the ticket crosses into a whitelisted package: the stage it is in, which its next launch comes from. On a
   * review bar of a forge with entities: the stage its reviewer runs. Absent on a ticket that stays in one entity and on every row of a forge
   * without entities.
   */
  stage?:          TicketStage;
  /** The seal of each crossed package whose change a package review sealed, by package entity key: a hash of the ticket's own change to it. */
  seals?:          Record<string, string>;
  /** How many times the ticket returned to a package build from `adapt` or `review`; written at the first return. */
  packageReturns?: number;
}
