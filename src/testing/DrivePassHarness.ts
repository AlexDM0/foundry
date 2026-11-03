/**
 * The one way a spec makes a DrivePass on a scratch tracker: a Baton of this process and the example wording, every other request field the
 * spec's to set. A real-system spec pins the Watcher bundle; a default spec passes a `FakeWatcherWorld`, its bundle path never read, and runs
 * on the recorded git flow stages of `src/testing/RecordedGitFlow.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }            from 'node:path';

import type { AgentAdapter }                                      from '../lib/agent-launch/AgentAdapter.ts';
import { createDarwinSeatbelt }                                   from '../lib/gate-confinement/DarwinSeatbelt.ts';
import type { GateConfinement }                                   from '../lib/gate-confinement/GateConfinement.ts';
import type { PlatformPorts }                                     from '../lib/platform-ports/PlatformPortsFor.ts';
import { Baton }                                                  from '../services/overseer/Baton.ts';
import { createDrivePass, type DrivePass, type DrivePassRequest } from '../services/overseer/DrivePass.ts';
import { overseerFilesIn }                                        from '../services/overseer/OverseerFiles.ts';
import { WATCHER_ENTRY_PATH, WatcherBundle }                      from '../services/overseer/WatcherBundle.ts';
import type { Workspace }                                         from '../services/tracker/Workspace.ts';

export const FAKE_WATCHER_BUNDLE_PATH = '/no-bundle-is-read-by-the-fake-watcher-world';

interface ScratchDrivePassRequired {
  platformPorts:     PlatformPorts;
  workspace:         Workspace;
  agentAdapter:      AgentAdapter;
  monitorFolder:     string;
  mainLine:          string;
  watcherBundlePath: string;
  log:               (line: string) => void;
}

export type ScratchDrivePassRequest = ScratchDrivePassRequired & Partial<DrivePassRequest>;

/** Each call is an Overseer start: a newer generation than the last one's. */
export function createScratchDrivePass(request: ScratchDrivePassRequest): DrivePass {
  const { overseerDirectory } = overseerFilesIn(request.workspace.trackerDirectory);
  mkdirSync(overseerDirectory, { recursive: true });
  const acquisition = Baton.acquire(request.platformPorts, overseerDirectory, {
    processId:              process.pid,
    processStartStamp:      '1',
    bootIdentity:           'example-boot',
    port:                   1,
    url:                    'http://127.0.0.1:1/',
    tokenFile:              join(overseerDirectory, 'token'),
    codeVersion:            'code-example',
    installVersion:         1,
    watcherProtocolVersion: 1,
  });
  if (acquisition.verdict !== 'acquired') throw new Error('the scratch Baton was not acquired');
  const defaults: Omit<DrivePassRequest, keyof ScratchDrivePassRequired> = {
    now:                   () => new Date('2026-09-18T20:11:03Z'),
    formatStamp:           () => '2026-09-18T22:11:03+02:00',
    overseerDirectory,
    generation:            acquisition.generation,
    codeVersion:           'code-example',
    programCommand:        [process.execPath, join(import.meta.dir, '..', '..', 'agent-progress.ts')],
    inheritedEnvironment:  {},
    managedBlockMarker:    '<!-- example-managed-block -->',
    installVersionChanged: () => false,
    decisionWordingOf:     () => ({ questions: [], context: '' }),
    launchTextOf:          () => ({ firstMessage: 'Example first message', roleBrief: 'Example role' }),
    assistantChatTextOf:   (facts) => `Example chat ${facts.sequence}`,
    windDownMessage:       'Example wind-down message',
    resumeMessage:         'Example resume message',
    redHandoffMessageOf:   () => 'Example red handoff message',
    answerMessageOf:       (answer) => `Example answers ${JSON.stringify(answer)}`,
    homeDirectory:         request.monitorFolder,
    onBatonTakenOver:      () => request.log('taken over'),
  };
  // Property by property, since a spread would read once an accessor a spec hooks a pass with.
  return createDrivePass(Object.defineProperties(defaults, Object.getOwnPropertyDescriptors(request)) as DrivePassRequest);
}

/** The real Watcher's bundle, for a real-system spec; the build lands in the scratch tracker. */
export async function pinnedScratchWatcherBundle(workspace: Workspace): Promise<string> {
  const { overseerDirectory } = overseerFilesIn(workspace.trackerDirectory);
  mkdirSync(overseerDirectory, { recursive: true });
  return await WatcherBundle.pinWatcherBundle({ overseerDirectory, codeVersion: 'code-example', entryPath: WATCHER_ENTRY_PATH });
}

/** `createDarwinSeatbelt` answering that a sandbox applies, so the real profile is written with no probe of `sandbox-exec`, on any platform. */
export function seatbeltThatApplies(): GateConfinement {
  return createDarwinSeatbelt({
    fileExists:      () => true,
    programSucceeds: () => true,
    writeFile:       (path, text) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    },
  });
}
