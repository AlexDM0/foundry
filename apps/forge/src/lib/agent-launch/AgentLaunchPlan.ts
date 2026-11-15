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
