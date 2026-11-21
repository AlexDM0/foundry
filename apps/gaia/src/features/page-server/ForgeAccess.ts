/**
 * From a tracker id to what reaches that forge's Overseer, or why nothing does: the registry's entry, the forge watch's reading at the same
 * address, a system version Gaia can talk to, and the token file read at each call. The token is never cached and travels only in the
 * access it answers, never into an answer or a log line.
 */
import type { SystemVersion } from 'system-versions/VersionsDocument';

import { OverseerTokenFile }                        from '../../adapters/forge-api/OverseerTokenFile.ts';
import type { RegisteredOverseer }                  from '../../adapters/forge-registry/@types/RegisteredForge.ts';
import { registeredForgesOf, type RegistryReading } from '../../adapters/forge-registry/RegistryFile.ts';
import type { OverseerAccess }                      from '../../lib/forge-client/@types/ForgeClientAnswer.ts';
import type { ForgeClient }                         from '../../lib/forge-client/ForgeClient.ts';
import type { RegistryRefusal }                     from '../../shared/@types/CommandVerdict.ts';
import type { ForgeReading }                        from '../../shared/@types/ForgeReading.ts';
import { OVERSEER_ANSWERED_FIDELITIES }             from '../../shared/constants/ForgeFidelities.ts';
import { ForgeVersionsUtil }                        from '../../shared/utils/ForgeVersionsUtil.ts';

export interface ForgeAccessSources {
  /** Read at each request, so the Overseer's address and token file are the ones the registry names now. */
  readonly readRegistry: () => Promise<RegistryReading>;
  /** The forge watch's latest readings: whether an Overseer answers, at which address, and at which system version. */
  readonly readings:     () => readonly ForgeReading[];
  readonly forgeClient:  ForgeClient;
}

/**
 * `forge-unreachable`: no Overseer of the forge answered the watch at the address the registry names now. `forge-version-unsupported`: its
 * system version is one Gaia cannot talk to. `token-unreadable`: the Overseer's token file cannot be read, or the registry names none.
 */
export type ForgeAccessRefusal = 'forge-not-registered' | RegistryRefusal | 'forge-unreachable' | 'forge-version-unsupported' | 'token-unreadable';

/** The forge's Overseer as the watch read it, before its token is read. */
export type WatchedOverseerVerdict =
  | { readonly verdict: 'watched'; readonly overseer: RegisteredOverseer; readonly reading: ForgeReading; readonly forgeSystemVersion: SystemVersion }
  | { readonly verdict: 'refused'; readonly refusal: Exclude<ForgeAccessRefusal, 'token-unreadable'> };

export type ForgeAccessVerdict =
  | { readonly verdict: 'access'; readonly access: OverseerAccess; readonly forgeSystemVersion: SystemVersion }
  | { readonly verdict: 'refused'; readonly refusal: ForgeAccessRefusal };

/**
 * The reading checked is the one the watch took at the address the registry names now, so an Overseer the registry names at another
 * address is not asked until the watch reads it. A version the watch could not talk to refuses before its fidelity is looked at.
 */
export async function watchedOverseerVerdictFor(trackerId: string, sources: Omit<ForgeAccessSources, 'forgeClient'>): Promise<WatchedOverseerVerdict> {
  const forges = registeredForgesOf(await sources.readRegistry());
  if (typeof forges === 'string') return { verdict: 'refused', refusal: forges };
  const forge = forges.find((registered) => registered.trackerId === trackerId);
  if (forge === undefined) return { verdict: 'refused', refusal: 'forge-not-registered' };
  const reading = sources.readings().find((watched) => watched.trackerId === trackerId);
  if (forge.overseer === null || reading === undefined || reading.url !== forge.overseer.url) return { verdict: 'refused', refusal: 'forge-unreachable' };
  if (reading.versions !== null && !ForgeVersionsUtil.canTalk(reading.versions)) return { verdict: 'refused', refusal: 'forge-version-unsupported' };
  const forgeSystemVersion = reading.versions?.current ?? null;
  if (!OVERSEER_ANSWERED_FIDELITIES.has(reading.fidelity) || forgeSystemVersion === null) return { verdict: 'refused', refusal: 'forge-unreachable' };
  return {
    verdict: 'watched', overseer: forge.overseer, reading, forgeSystemVersion,
  };
}

/** The access to a watched Overseer, its token read now, since the Overseer writes a fresh one at each start. */
export async function accessVerdictOf(overseer: RegisteredOverseer, forgeSystemVersion: SystemVersion): Promise<ForgeAccessVerdict> {
  const bearerToken = overseer.tokenPath === null ? null : await new OverseerTokenFile(overseer.tokenPath).read();
  if (bearerToken === null) return { verdict: 'refused', refusal: 'token-unreadable' };
  return { verdict: 'access', access: { overseerUrl: overseer.url, bearerToken }, forgeSystemVersion };
}

export async function forgeAccessVerdictFor(trackerId: string, sources: Omit<ForgeAccessSources, 'forgeClient'>): Promise<ForgeAccessVerdict> {
  const watched = await watchedOverseerVerdictFor(trackerId, sources);
  return watched.verdict === 'refused' ? watched : accessVerdictOf(watched.overseer, watched.forgeSystemVersion);
}
