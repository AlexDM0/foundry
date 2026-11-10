export interface AgentQuestion {
  readonly question:    string;
  readonly header:      string;
  readonly multiSelect: boolean;
  readonly options:     readonly { readonly label: string; readonly description: string }[];
}

export interface AgentTurnUsage {
  readonly inputTokens:              number;
  readonly outputTokens:             number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens:     number;
}

/** The session's totals so far, per model, subagents included where the vendor counts them. */
export interface AgentUsageTotals {
  readonly byModel: Readonly<Record<string, AgentTurnUsage>>;
}

/** Why a session's closing result failed, where the caller acts on the cause rather than treating it as the turn's end. */
export type AgentResultFailureKind = 'rate-limited' | 'authentication-failed' | 'budget-reached';

export interface AgentResultFailure {
  readonly kind:       AgentResultFailureKind;
  /** The HTTP status of the refused API call; `null` when no call was refused, as at a budget stop. */
  readonly httpStatus: number | null;
  /** The vendor's own text of the result, kept as a value for the decision that names it. */
  readonly text:       string;
}

export type AgentSessionEvent =
  | { readonly kind: 'started'; readonly sessionId: string; readonly vendorVersion: string; readonly model: string; readonly tools: readonly string[] }
  | {
    readonly kind:            'assistant-turn';
    readonly messageId:       string;
    readonly parentToolUseId: string | null;
    readonly model:           string;
    readonly usage:           AgentTurnUsage | null;
    /** The turn's text blocks, joined; empty for a turn of tool calls alone. */
    readonly text:            string;
  }
  | {
    readonly kind:            'tool-call';
    readonly toolUseId:       string;
    readonly toolName:        string;
    readonly inputSummary:    string;
    /** The call's own `description` input, whole: for a call that spawns a subagent, what the subagent was asked to do. `null` without one. */
    readonly description:     string | null;
    readonly parentToolUseId: string | null;
  }
  /** The answer to the tool call `toolUseId` names, so a reader knows that call is no longer running. */
  | { readonly kind: 'tool-result'; readonly toolUseId: string; readonly parentToolUseId: string | null; readonly isError: boolean }
  | { readonly kind: 'question'; readonly requestId: string; readonly questions: readonly AgentQuestion[] }
  | { readonly kind: 'permission-denied'; readonly toolName: string }
  | {
    readonly kind:            'usage-window';
    readonly window:          string;
    readonly utilization:     number;
    readonly resetsAt:        string;
    readonly status:          string;
    readonly requestsRefused: boolean;
  }
  | {
    readonly kind:             'result';
    readonly isError:          boolean;
    readonly structuredReport: unknown;
    readonly usageTotals:      AgentUsageTotals | null;
    readonly contextTokens:    number | null;
    /** What the session cost so far, as the vendor counts it; `null` when the result names no cost. */
    readonly costUsd:          number | null;
    readonly failure:          AgentResultFailure | null;
  };
