/** What an adapter answers from the transcripts its agent keeps: one session's subagents, and every subagent of a project as `usage` counts it. */

/** One subagent of a session as its transcript tallies it, keyed by the parent call that spawned it. */
export interface SubagentFacts {
  readonly parentToolUseId: string;
  readonly toolCalls:       number;
  readonly lastToolCall:    { readonly toolName: string; readonly startedAt: string | null; readonly running: boolean } | null;
  readonly tokens:          number;
  /** What the subagent was asked to do, as its agent recorded it; `null` without one. */
  readonly description:     string | null;
}

/** One subagent of the project as the `usage` verb counts it. */
export interface SubagentUsage {
  readonly sessionIdentifier:           string;
  readonly agentIdentifier:             string;
  /** Where the agent kept it; printed and carried by `--json` as `transcriptPath`. */
  readonly transcriptPath:              string;
  readonly startedAt:                   string | null;
  readonly model:                       string | null;
  readonly apiCallCount:                number;
  readonly inputTokens:                 number;
  readonly cacheReadInputTokens:        number;
  readonly cacheCreationInputTokens:    number;
  readonly outputTokens:                number;
  readonly totalInputTokens:            number;
  readonly endContextTokens:            number;
  readonly oversizedContextTokens:      number;
  readonly browserCallCount:            number;
  /** Edits made through a shell command rather than the agent's file-editing tools. */
  readonly shellEditScriptCount:        number;
  readonly verificationRunCount:        number;
  readonly nestedInstructionCharacters: number;
  readonly briefExcerpt:                string;
}

export interface SubagentUsageRequest {
  readonly projectRoot:                     string;
  readonly homeDirectory:                   string;
  /** The `--transcripts <folder>` option; `null` reads the agent's own folder for the project. */
  readonly transcriptFolder:                string | null;
  readonly oversizedContextThresholdTokens: number;
  readonly briefExcerptCharacters:          number;
  /** Told of each transcript that could not be read; it is left out of the answer. */
  readonly onUnreadableTranscript:          (transcriptPath: string) => void;
}

/** The folder read, the request's or the agent's own for the project, so a report can name it, and one row per subagent transcript in it. */
export interface SubagentUsageAnswer {
  readonly transcriptFolder: string;
  readonly usages:           readonly SubagentUsage[];
}
