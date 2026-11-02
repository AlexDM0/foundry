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
}

export interface AgentAdapter {
  readonly vendor:           string;
  readonly capabilities:     AgentCapabilities;
  /** How this vendor's sandbox applies a profile's path denies on this host, which the profile is shaped for. */
  readonly sandboxDenyShape: SandboxDenyShape;
  /** The absolute path `planOf` is then given as `programPath`, or why the job cannot launch. */
  programPathOf(resolver: ExecutableResolver, forbiddenRoots: readonly string[]): ExecutableResolution;
  planOf(request: AgentLaunchRequest): AgentLaunchPlan;
  /** The session id a job keeps across every Watcher instance and resume, derived from the board's scope and the job, never random. */
  sessionIdOf(scope: string, jobId: string): string;
  /** One stdout line, mapped; a line the adapter does not recognise maps to no event. */
  eventsOf(line: string): readonly AgentSessionEvent[];
  chatLineOf(text: string): string;
  /** `questions` are the ones the `question` event carried, which a vendor may need echoed beside the answers. */
  answerLineOf(requestId: string, questions: readonly AgentQuestion[], answers: Readonly<Record<string, string>>): string;
  interruptLineOf(): string;
}
