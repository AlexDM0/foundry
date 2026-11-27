/**
 * How a session is confined, as its agent adapter declares: by the agent's own sandbox when it applies the worker profile, else by forge's
 * `GateConfinement` wrapped round the session's argv, as a line is wrapped. Never both: on macOS a child under a Seatbelt profile with any deny
 * rule cannot apply one of its own (`sandbox-exec` exits 71), and an agent with its own sandbox starts it for every shell call.
 */
import { mkdirSync } from 'node:fs';
import { join }      from 'node:path';

import type { AgentAdapter, AgentCapabilities }                      from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentLaunchPlan }                                      from '../../lib/agent-launch/AgentLaunchPlan.ts';
import type { AgentConfinement, AgentLaunchRequest }                 from '../../lib/agent-launch/AgentLaunchRequest.ts';
import type { WorkerProfile }                                        from '../../lib/agent-launch/WorkerProfile.ts';
import { confinedLineOf }                                            from '../../lib/gate-confinement/ConfinedLine.ts';
import type { ConfinementPlan, ConfinementVerdict, GateConfinement } from '../../lib/gate-confinement/GateConfinement.ts';
import type { ConfinementRefusal }                                   from '../../shared/@types/ConfinementRefusal.ts';

/** In the session's job files folder, where an adapter that describes its confinement in a file keeps it. */
const SESSION_CONFINEMENT_FILE_NAME = 'session-confinement';


export type SessionLaunch =
  | { readonly verdict: 'runs'; readonly plan: AgentLaunchPlan }
  | { readonly verdict: 'refused'; readonly refusal: ConfinementRefusal };

type SessionPlanRequest = Pick<AgentLaunchRequest, 'profile' | 'workingDirectory' | 'jobFilesDirectory'>;

/** What a session of an agent with these capabilities runs under on this platform. */
function confinementVerdictOf(capabilities: Pick<AgentCapabilities, 'ownConfinement'>, gateConfinement: GateConfinement): ConfinementVerdict {
  return capabilities.ownConfinement === 'applies-the-profile' ? gateConfinement.workerConfinement() : gateConfinement.availability().verdict;
}

/** An `unavailable` answer still asks for confinement, so the session is refused rather than run unconfined. */
function launchConfinementOf(capabilities: Pick<AgentCapabilities, 'ownConfinement'>, gateConfinement: GateConfinement): AgentConfinement {
  return confinementVerdictOf(capabilities, gateConfinement) === 'unconfined-by-design' ? 'unconfined-by-design' : 'confined';
}

function hasNetworkDomains(profile: Pick<WorkerProfile, 'shellNetworkDomains' | 'webNetworkDomains'>): boolean {
  return profile.shellNetworkDomains.length > 0 || Array.isArray(profile.webNetworkDomains);
}

/** Why forge's confinement refuses a session of this profile; `null` when the agent confines it itself or forge's can. */
function refusalOf(capabilities: Pick<AgentCapabilities, 'ownConfinement'>, gateConfinement: GateConfinement, profile: WorkerProfile): ConfinementRefusal | null {
  if (capabilities.ownConfinement === 'applies-the-profile') return null;
  const availability = gateConfinement.availability();
  if (availability.verdict === 'unavailable') return { cause: 'confinement-unavailable', unavailability: availability.unavailability };
  if (availability.verdict === 'unconfined-by-design') return null;
  return hasNetworkDomains(profile) ? { cause: 'network-domains-unconfinable' } : null;
}

/**
 * The plan forge's confinement wraps a session in: its checkout, the profile's other writable roots, its one extra folder and the agent's own
 * folders written, the profile's denies winning over them; the network whole, since the agent reaches its provider.
 */
function planOf(request: SessionPlanRequest, agentWritablePaths: readonly string[]): ConfinementPlan {
  const { profile } = request;
  return {
    worktree:            profile.writeRoot ?? request.workingDirectory,
    writableRoots:       [...profile.writableRoots, profile.extraWritableDirectory, ...agentWritablePaths],
    worktreeAdminFolder: null,
    temporaryDirectory:  null,
    writableCachePaths:  [],
    deniedWritableRoots: profile.deniedWritableRoots,
    deniedReadableRoots: profile.deniedReadableRoots,
    network:             true,
    confinementFilePath: join(request.jobFilesDirectory, SESSION_CONFINEMENT_FILE_NAME),
  };
}

/** The adapter's plan, its argv wrapped in forge's confinement when the agent brings none; refused when that confinement cannot hold it. */
function sessionLaunchOf(adapter: AgentAdapter, gateConfinement: GateConfinement, request: AgentLaunchRequest): SessionLaunch {
  const refusal = refusalOf(adapter.capabilities, gateConfinement, request.profile);
  if (refusal !== null) return { verdict: 'refused', refusal };
  const plan = adapter.planOf(request);
  if (adapter.capabilities.ownConfinement === 'applies-the-profile' || request.confinement === 'unconfined-by-design') return { verdict: 'runs', plan };
  const sessionPlanOf = (): ConfinementPlan => {
    mkdirSync(request.jobFilesDirectory, { recursive: true });
    return planOf(request, adapter.sessionWritablePathsOf(request.homeDirectory));
  };
  const line = confinedLineOf(gateConfinement, sessionPlanOf, plan.argv);
  return line.verdict === 'refused'
    ? { verdict: 'refused', refusal: { cause: 'confinement-unavailable', unavailability: line.unavailability } }
    : { verdict: 'runs', plan: { ...plan, argv: line.argv } };
}

export const SessionConfinement = Object.freeze({
  confinementVerdictOf,
  launchConfinementOf,
  refusalOf,
  planOf,
  sessionLaunchOf,
});
