/**
 * The confined launch of one Flint brain run: a deny-all profile with no tool at all, the brain's model, effort, brief and answer schema,
 * and the place it runs in, which holds no instruction file and sits below none that reaches it.
 */
import { dirname } from 'node:path';

import type { AgentAdapter }                                 from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchRequest }                           from '../../lib/agent-launch/AgentLaunchRequest.ts';
import type { WorkerProfile }                                from '../../lib/agent-launch/WorkerProfile.ts';
import type { PlatformPorts }                                from '../../lib/platform-ports/PlatformPortsFor.ts';
import { FLINT_BRAIN_EFFORT, FLINT_BRAIN_MODEL }             from '../../shared/constants/OverseerLimits.ts';
import { FLINT_BRAIN_ANSWER_SCHEMA, FLINT_BRAIN_ROLE_BRIEF } from './utils/FlintBrainDigestUtil.ts';

/** Where one run's session works and keeps its launch files; the session host chooses it. */
export interface FlintBrainSessionPlace {
  readonly run:               number;
  readonly workingDirectory:  string;
  readonly jobFilesDirectory: string;
}

export interface FlintBrainLaunchFacts {
  readonly platformPorts:          Pick<PlatformPorts, 'executableResolver' | 'launchEnvironment' | 'gateConfinement'>;
  readonly inheritedEnvironment:   Readonly<Record<string, string | undefined>>;
  readonly repositoryRoot:         string;
  readonly trackerId:              string;
  readonly homeDirectory:          string;
  /** The no-flint test setting (`flintBrainIsWithheld` in `src/shared/Environment.ts`). */
  readonly brainIsWithheld:        boolean;
  readonly maximumRunMilliseconds: number;
}

/** Every folder above the working directory, so no instruction file or rule of the repository around it reaches the session. */
function foldersAboveOf(folder: string): string[] {
  const folders: string[] = [];
  for (let above = dirname(folder); !folders.includes(above); above = dirname(above)) folders.push(above);
  return folders;
}

/** The brain needs no tool, so it gets none; its sandbox still applies, since no forge session runs unconfined where one exists. */
function profileOf(place: FlintBrainSessionPlace, repositoryRoot: string, credentialPaths: readonly string[]): WorkerProfile {
  return {
    writableRoots:           [],
    deniedWritableRoots:     [repositoryRoot],
    deniedReadableRoots:     [...credentialPaths],
    bashNetworkDomains:      [],
    webNetworkDomains:       'none',
    extraWritableDirectory:  place.workingDirectory,
    allowedCommandPrefixes:  [],
    deniedCommandPrefixes:   [],
    askUser:                 false,
    skills:                  false,
    subagents:               [],
    attribution:             'none',
    instructionsRoot:        place.workingDirectory,
    nestedCheckoutAncestors: foldersAboveOf(place.workingDirectory),
    gitHooksDirectory:       place.workingDirectory,
    commitSigning:           { kind: 'unsigned' },
    networkDomainGuard:      null,
    availableTools:          'none',
  };
}

/** Only where a worker session runs confined, and not under the no-flint test setting. */
function brainCanRun(facts: Pick<FlintBrainLaunchFacts, 'platformPorts' | 'brainIsWithheld'>): boolean {
  return !facts.brainIsWithheld && facts.platformPorts.gateConfinement.workerConfinement() === 'confined';
}

/** A fresh session for each run, never resumed: its id comes from the run's start, which no other run of the board shares. */
function launchRequestOf(adapter: AgentAdapter, facts: FlintBrainLaunchFacts, place: FlintBrainSessionPlace, programPath: string, startedAt: string): AgentLaunchRequest {
  return {
    programPath,
    sessionId:         adapter.sessionIdOf(facts.trackerId, `flint-brain-${startedAt}`),
    resume:            false,
    workingDirectory:  place.workingDirectory,
    homeDirectory:     facts.homeDirectory,
    firstMessage:      '',
    roleBrief:         FLINT_BRAIN_ROLE_BRIEF,
    model:             FLINT_BRAIN_MODEL,
    effort:            FLINT_BRAIN_EFFORT,
    environment:       facts.platformPorts.launchEnvironment.launchEnvironmentOf(facts.inheritedEnvironment, {}, adapter.inheritedVariableNames),
    profile:           profileOf(place, facts.repositoryRoot, adapter.credentialPathsOf(facts.homeDirectory)),
    confinement:       'confined',
    jobFilesDirectory: place.jobFilesDirectory,
    reportSchema:      FLINT_BRAIN_ANSWER_SCHEMA,
  };
}

export const FlintBrainProfile = Object.freeze({
  profileOf,
  brainCanRun,
  launchRequestOf,
});
