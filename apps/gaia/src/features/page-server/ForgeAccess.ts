/**
 * From a tracker id to what reaches that forge's Hephaestus, or why nothing does: the registry's entry, the forge watch's reading at the same
 * address, a system version Gaia can talk to, and the token file read at each call. The token is never cached and travels only in the
 * access it answers, never into an answer or a log line.
 */
import type { SystemVersion } from 'system-versions/VersionsDocument';

import { HephaestusTokenFile }                      from '../../adapters/forge-api/HephaestusTokenFile.ts';
import type { PresenceReportReading }               from '../../adapters/forge-api/PresenceIngestion.ts';
import type { RegisteredHephaestus }                from '../../adapters/forge-registry/@types/RegisteredForge.ts';
import { registeredForgesOf, type RegistryReading } from '../../adapters/forge-registry/RegistryFile.ts';
import type { HephaestusAccess }                    from '../../lib/forge-client/@types/ForgeClientAnswer.ts';
import type { ForgeClient }                         from '../../lib/forge-client/ForgeClient.ts';
import type { RegistryRefusal }                     from '../../shared/@types/CommandVerdict.ts';
import type { ForgeReading }                        from '../../shared/@types/ForgeReading.ts';
import { HEPHAESTUS_ANSWERED_FIDELITIES }           from '../../shared/constants/ForgeFidelities.ts';
import { ForgeVersionsUtil }                        from '../../shared/utils/ForgeVersionsUtil.ts';

export interface ForgeAccessSources {
  /** Read at each request, so Hephaestus's address and token file are the ones the registry names now. */
  readonly readRegistry:            () => Promise<RegistryReading>;
  /** The forge watch's latest readings: whether a Hephaestus answers, at which address, and at which system version. */
  readonly readings:                () => readonly ForgeReading[];
  /** The forge's presence read after now through the forge watch's one presence reader, so a route never reads presence beside it. */
  readonly presenceReadingAfterNow: (trackerId: string) => Promise<PresenceReportReading | null>;
  readonly forgeClient:             ForgeClient;
}

/**
 * `forge-unreachable`: no Hephaestus of the forge answered the watch at the address the registry names now. `forge-version-unsupported`: its
 * system version is one Gaia cannot talk to. `token-unreadable`: Hephaestus's token file cannot be read, or the registry names none.
 */
export type ForgeAccessRefusal = 'forge-not-registered' | RegistryRefusal | 'forge-unreachable' | 'forge-version-unsupported' | 'token-unreadable';

/** The forge's Hephaestus as the watch read it, before its token is read. */
export type WatchedHephaestusVerdict =
  | { readonly verdict: 'watched'; readonly hephaestus: RegisteredHephaestus; readonly reading: ForgeReading; readonly forgeSystemVersion: SystemVersion }
  | { readonly verdict: 'refused'; readonly refusal: Exclude<ForgeAccessRefusal, 'token-unreadable'> };

export type ForgeAccessVerdict =
  | { readonly verdict: 'access'; readonly access: HephaestusAccess; readonly forgeSystemVersion: SystemVersion }
  | { readonly verdict: 'refused'; readonly refusal: ForgeAccessRefusal };

/**
 * The reading checked is the one the watch took at the address the registry names now, so a Hephaestus the registry names at another
 * address is not asked until the watch reads it. A version the watch could not talk to refuses before its fidelity is looked at.
 */
export async function watchedHephaestusVerdictFor(trackerId: string, sources: Omit<ForgeAccessSources, 'forgeClient'>): Promise<WatchedHephaestusVerdict> {
  const forges = registeredForgesOf(await sources.readRegistry());
  if (typeof forges === 'string') return { verdict: 'refused', refusal: forges };
  const forge = forges.find((registered) => registered.trackerId === trackerId);
  if (forge === undefined) return { verdict: 'refused', refusal: 'forge-not-registered' };
  const reading = sources.readings().find((watched) => watched.trackerId === trackerId);
  if (forge.hephaestus === null || reading === undefined || reading.url !== forge.hephaestus.url) return { verdict: 'refused', refusal: 'forge-unreachable' };
  if (reading.versions !== null && !ForgeVersionsUtil.canTalk(reading.versions)) return { verdict: 'refused', refusal: 'forge-version-unsupported' };
  const forgeSystemVersion = reading.versions?.current ?? null;
  if (!HEPHAESTUS_ANSWERED_FIDELITIES.has(reading.fidelity) || forgeSystemVersion === null) return { verdict: 'refused', refusal: 'forge-unreachable' };
  return {
    verdict: 'watched', hephaestus: forge.hephaestus, reading, forgeSystemVersion,
  };
}

/** The access to a watched Hephaestus, its token read now, since Hephaestus writes a fresh one at each start. */
export async function accessVerdictOf(hephaestus: RegisteredHephaestus, forgeSystemVersion: SystemVersion): Promise<ForgeAccessVerdict> {
  const bearerToken = hephaestus.tokenPath === null ? null : await new HephaestusTokenFile(hephaestus.tokenPath).read();
  if (bearerToken === null) return { verdict: 'refused', refusal: 'token-unreadable' };
  return { verdict: 'access', access: { hephaestusUrl: hephaestus.url, bearerToken }, forgeSystemVersion };
}

export async function forgeAccessVerdictFor(trackerId: string, sources: Omit<ForgeAccessSources, 'forgeClient'>): Promise<ForgeAccessVerdict> {
  const watched = await watchedHephaestusVerdictFor(trackerId, sources);
  return watched.verdict === 'refused' ? watched : accessVerdictOf(watched.hephaestus, watched.forgeSystemVersion);
}
