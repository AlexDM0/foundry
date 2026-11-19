/**
 * The launcher port: what a coding-agent vendor's adapter does for Talos, which knows no vendor. It renders a launch plan Talos executes,
 * maps each stdout line the session prints to events, and writes the lines Talos sends the session. The package depends on
 * `src/lib/executable-resolver`, whose port an adapter finds its program through.
 */
import type { ExecutableRefusalCause, ExecutableResolution, ExecutableResolver } from '../executable-resolver/ExecutableResolver.ts';
import type { AgentInstaller }                                                   from './AgentInstaller.ts';
import type { AgentLaunchPlan }                                                  from './AgentLaunchPlan.ts';
import type { AgentLaunchRequest }                                               from './AgentLaunchRequest.ts';
import type { AgentQuestion, AgentSessionEvent }                                 from './AgentSessionEvent.ts';
import type { AgentToolCall }                                                    from './AgentToolCall.ts';
import type { SubagentFacts, SubagentUsageAnswer, SubagentUsageRequest }         from './AgentTranscripts.ts';
import type { SandboxDenyShape }                                                 from './WorkerProfile.ts';

/** The names an adapter may give an ending in its plan's `endingPatterns`, each of which the Overseer maps to a cause. */
export const AGENT_ENDING_NAMES = ['network-outage'] as const;

export type AgentEndingName = typeof AGENT_ENDING_NAMES[number];

export interface AgentCapabilities {
  readonly chatTurns:                  boolean;
  readonly questions:                  boolean;
  readonly resume:                     boolean;
  readonly reportChannel:              'schema';
  readonly usage:                      'tokens' | 'none';
  /** Whether a chat line carries pictures beside its text. */
  readonly pictures:                   boolean;
  /** A live session takes an answer line; `false`: the Overseer stops it and resumes it with the answer. */
  readonly takesLiveAnswers:           boolean;
  /** A resumed session is found by the folder it began in. */
  readonly resumeFindsSessionByFolder: boolean;
  /** The agent's own sandbox applies the whole worker profile; `none`: forge's confinement wraps the session. */
  readonly ownConfinement:             'applies-the-profile' | 'none';
}

/** A picture a chat line carries: its media type and its bytes in base64. */
export interface AgentPicture {
  readonly mediaType:  string;
  readonly base64Data: string;
}

export interface AgentCredentials {
  /** The variable that moves the agent's own folder, read through `agentVariableOf`; `null` when there is none. */
  readonly configurationFolderVariableName: string | null;
  /** The variable API billing needs before any session starts. */
  readonly billingKeyVariableName:          string;
  /** What to check when the provider refuses the key, worded for the decision it opens. */
  readonly authenticationCheckSentence:     string;
}

/** The folders and files of a checkout that configure the agent, by name: no job may write them, and Customs refuses a change of them. */
export interface AgentConfigurationNames {
  readonly folderNames: readonly string[];
  readonly fileNames:   readonly string[];
}

/** The words a prompt names the agent's own tools and files by, each written `{{<name>}}` in the prompt and filled from the adapter. */
export type AgentPromptFillName = 'askUserTool' | 'webFetchTool' | 'webSearchTool' | 'instructionFile' | 'agentConfigurationPaths';

/** What a line written to a session said, read back from the line: the inverse of `chatLineOf`, `answerLineOf` and `interruptLineOf`. */
export type SentLine =
  | { readonly act: 'chat'; readonly text: string; readonly pictures: readonly AgentPicture[] }
  | { readonly act: 'answer'; readonly requestId: string; readonly answers: Readonly<Record<string, string>> }
  | { readonly act: 'interrupt' };

export interface AgentAdapter {
  readonly vendor:                 string;
  /** The agent's name as a person knows it, for help and next-step lines. */
  readonly displayName:            string;
  readonly capabilities:           AgentCapabilities;
  readonly credentials:            AgentCredentials;
  /** How this vendor's sandbox applies a profile's path denies on this host, which the profile is shaped for. */
  readonly sandboxDenyShape:       SandboxDenyShape;
  /**
   * The vendor's own variables a session inherits beside the platform's allowlist (`launchEnvironmentOf`): its login and its config
   * folder, so a host logged in by a variable starts a logged-in session. No other secret passes.
   */
  readonly inheritedVariableNames: readonly string[];
  readonly configurationNames:     AgentConfigurationNames;
  /** Each commit message trailer that marks a commit as the agent's work; Customs refuses a commit whose message matches one. */
  readonly attributionPatterns:    readonly RegExp[];
  readonly installer:              AgentInstaller;
  readonly promptFills:            Readonly<Record<AgentPromptFillName, string>>;
  /** The user's credential files and folders on this host, the vendor's own login among them, which every role is denied reading. */
  credentialPathsOf(homeDirectory: string): readonly string[];
  /** The absolute path `planOf` is then given as `programPath`, or why the job cannot launch. */
  programPathOf(resolver: ExecutableResolver, forbiddenRoots: readonly string[]): ExecutableResolution;
  /** The sentence that repairs a refused program, or `null`. */
  programRepairOf(cause: ExecutableRefusalCause): string | null;
  planOf(request: AgentLaunchRequest): AgentLaunchPlan;
  /** The session id a job keeps across every child instance and resume, derived from the board's scope and the job, never random. */
  sessionIdOf(scope: string, jobId: string): string;
  /** One stdout line, mapped; a line the adapter does not recognise maps to no event. */
  eventsOf(line: string): readonly AgentSessionEvent[];
  /** The pictures go before the text; an adapter whose `capabilities.pictures` is false is never given one. */
  chatLineOf(text: string, pictures?: readonly AgentPicture[]): string;
  /** `questions` are the ones the `question` event carried, which a vendor may need echoed beside the answers. */
  answerLineOf(requestId: string, questions: readonly AgentQuestion[], answers: Readonly<Record<string, string>>): string;
  interruptLineOf(): string;
  /** The first line that makes a session run the instruction bundle `bundleName` on `argumentsText`. */
  instructionBundleLineOf(bundleName: string, argumentsText: string): string;
  /** `null` for a line none of the three writers gives. */
  sentLineOf(line: string): SentLine | null;
  /**
   * The subagents the session `sessionId` kept transcripts of on the home `homeDirectory`, found in every folder the session worked in,
   * except those whose parent call `talliedParentToolUseIds` holds; none when the agent kept no transcript.
   */
  sessionSubagentsOf(homeDirectory: string, sessionId: string, talliedParentToolUseIds: ReadonlySet<string>): readonly SubagentFacts[];
  /** One row per subagent transcript of the project, in no particular order; none when the agent kept no transcript. */
  subagentUsagesOf(request: SubagentUsageRequest): SubagentUsageAnswer;
  /** The call a guard's hook input names; `null` for an input the adapter cannot read, which the guard then denies. */
  toolCallOf(hookInput: string): AgentToolCall | null;
  /** The line a guard prints to deny the call, carrying `reason` as forge worded it. */
  toolCallDenialLineOf(reason: string): string;
  /** The agent's own folders and files a session writes outside its profile, which forge's confinement lets it write. */
  sessionWritablePathsOf(homeDirectory: string): readonly string[];
}
