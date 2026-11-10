/**
 * The launcher port: what a coding-agent vendor's adapter does for a Watcher that knows no vendor. It renders a launch plan the Watcher executes,
 * maps each stdout line the session prints to events, and writes the lines a Watcher sends the session. The package depends on
 * `src/lib/executable-resolver`, whose port an adapter finds its program through.
 */
import type { ExecutableResolution, ExecutableResolver } from '../executable-resolver/ExecutableResolver.ts';
import type { AgentLaunchPlan }                          from './AgentLaunchPlan.ts';
import type { AgentLaunchRequest }                       from './AgentLaunchRequest.ts';
import type { AgentQuestion, AgentSessionEvent }         from './AgentSessionEvent.ts';
import type { SandboxDenyShape }                         from './WorkerProfile.ts';

export interface AgentCapabilities {
  readonly chatTurns:     boolean;
  readonly questions:     boolean;
  readonly resume:        boolean;
  readonly reportChannel: 'schema';
  readonly usage:         'tokens' | 'none';
  /** Whether a chat line carries pictures beside its text. */
  readonly pictures:      boolean;
}

/** A picture a chat line carries: its media type and its bytes in base64. */
export interface AgentPicture {
  readonly mediaType:  string;
  readonly base64Data: string;
}

/** What a line written to a session said, read back from the line: the inverse of `chatLineOf`, `answerLineOf` and `interruptLineOf`. */
export type SentLine =
  | { readonly act: 'chat'; readonly text: string; readonly pictures: readonly AgentPicture[] }
  | { readonly act: 'answer'; readonly requestId: string; readonly answers: Readonly<Record<string, string>> }
  | { readonly act: 'interrupt' };

export interface AgentAdapter {
  readonly vendor:                 string;
  readonly capabilities:           AgentCapabilities;
  /** How this vendor's sandbox applies a profile's path denies on this host, which the profile is shaped for. */
  readonly sandboxDenyShape:       SandboxDenyShape;
  /**
   * The vendor's own variables a session inherits beside the platform's allowlist (`launchEnvironmentOf`): its login and its config
   * folder, so a host logged in by a variable starts a logged-in session. No other secret passes.
   */
  readonly inheritedVariableNames: readonly string[];
  /** The user's credential files and folders on this host, the vendor's own login among them, which every role is denied reading. */
  credentialPathsOf(homeDirectory: string): readonly string[];
  /** The absolute path `planOf` is then given as `programPath`, or why the job cannot launch. */
  programPathOf(resolver: ExecutableResolver, forbiddenRoots: readonly string[]): ExecutableResolution;
  planOf(request: AgentLaunchRequest): AgentLaunchPlan;
  /** The session id a job keeps across every Watcher instance and resume, derived from the board's scope and the job, never random. */
  sessionIdOf(scope: string, jobId: string): string;
  /** One stdout line, mapped; a line the adapter does not recognise maps to no event. */
  eventsOf(line: string): readonly AgentSessionEvent[];
  /** The pictures go before the text; an adapter whose `capabilities.pictures` is false is never given one. */
  chatLineOf(text: string, pictures?: readonly AgentPicture[]): string;
  /** `questions` are the ones the `question` event carried, which a vendor may need echoed beside the answers. */
  answerLineOf(requestId: string, questions: readonly AgentQuestion[], answers: Readonly<Record<string, string>>): string;
  interruptLineOf(): string;
  /** `null` for a line none of the three writers gives. */
  sentLineOf(line: string): SentLine | null;
}
