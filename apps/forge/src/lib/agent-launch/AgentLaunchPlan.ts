export interface AgentLaunchPlan {
  /** Spawned directly, with no shell. */
  readonly argv:                    readonly string[];
  readonly environment:             Readonly<Record<string, string>>;
  /**
   * Child variable to the name of the Watcher's own variable whose value it gets at spawn, for a secret: the plan, and so every file
   * written from it, names the variable and never holds the value.
   */
  readonly environmentFromWatcher?: Readonly<Record<string, string>>;
  readonly files:                   readonly LaunchFile[];
  readonly standingReplies:         readonly StandingReply[];
  /** Which stdout line ends a turn, on which the ending patterns are tried; `null` when the vendor has none. */
  readonly closingLine:             PlanLineConditions | null;
  /** Tried in order on each closing line; the first that holds names how the session ended. */
  readonly endingPatterns:          readonly PlanEndingPattern[];
  /** How a session is asked to stop at the end of its turn; `null` when it cannot be. */
  readonly quitAtTurnEnd:           QuitAtTurnEnd | null;
}

export interface LaunchFile {
  readonly path: string;
  readonly text: string;
}

/**
 * How a Watcher answers a session while nobody is there: a stdout line whose every `whenAllEqual` dotted path holds its value, and none of whose
 * `whenNoneEqual` paths does, is answered with `replyTemplate`, its `{{request_id}}` filled from the line's `request_id`.
 */
export interface StandingReply {
  readonly whenAllEqual:  Readonly<Record<string, string | boolean>>;
  readonly whenNoneEqual: Readonly<Record<string, string | boolean>>;
  readonly replyTemplate: string;
}

/** A test on one field of a stdout line, read by its dotted path through the line's own properties. */
export type PlanFieldCondition =
  | { readonly test: 'equals'; readonly path: string; readonly value: string | number | boolean | null }
  | { readonly test: 'one-of'; readonly path: string; readonly values: readonly (string | number | boolean)[] }
  | { readonly test: 'number-between'; readonly path: string; readonly least: number; readonly most: number };

export interface PlanLineConditions {
  readonly allOf:  readonly PlanFieldCondition[];
  /** Empty holds. */
  readonly anyOf:  readonly PlanFieldCondition[];
  readonly noneOf: readonly PlanFieldCondition[];
}

/**
 * A named ending: a closing line that meets `closingLineMatches`, after at least `minimumCountedLines` lines meeting `countedLineMatches`
 * since the previous closing line.
 */
export interface PlanEndingPattern {
  readonly name:                string;
  readonly closingLineMatches:  PlanLineConditions;
  readonly countedLineMatches:  PlanLineConditions | null;
  readonly minimumCountedLines: number;
}

export type QuitAtTurnEnd = { readonly act: 'close-input' } | { readonly act: 'write-line'; readonly line: string };
