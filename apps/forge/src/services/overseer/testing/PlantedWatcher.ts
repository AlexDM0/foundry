/**
 * A job folder whose Watcher reads as live, this test process standing in for it, and a socket that answers in its place: a spec sends to
 * it before it listens to see a refused connection, then listens to see which frames arrive.
 */
import { writeFileSync } from 'node:fs';

import { EVENT_LOG_FORMAT_VERSION }                from '../../../lib/talos/constants/TalosProtocol.ts';
import { watcherFilesOf }                          from '../../../lib/watcher/WatcherFiles.ts';
import { readWatcherLaunch }                       from '../../../lib/watcher/WatcherLaunch.ts';
import { type WatcherRecord, watcherRecordTextOf } from '../../../lib/watcher/WatcherRecord.ts';
import { WATCHER_PROTOCOL_VERSION }                from '../../../lib/watcher/constants/WatcherProtocol.ts';
import { nativePlatformPorts }                     from '../../../testing/NativePlatformPorts.ts';
import { jobFolderIn }                             from '../OverseerFiles.ts';
import { WatcherFleet }                            from '../WatcherFleet.ts';

export interface PlantedWatcherRequest {
  trackerDirectory: string;
  monitorFolder:    string;
  jobId:            string;
  instance:         number;
}

/** Writes the instance's launch file and a Watcher record naming this process, answering the socket path the launch file names. */
function plantLiveWatcher(request: PlantedWatcherRequest): string {
  const ports     = nativePlatformPorts();
  const jobFolder = jobFolderIn(request.trackerDirectory, request.jobId);
  WatcherFleet.writeLaunchFiles(ports, {
    jobFolder,
    instance:           request.instance,
    jobId:              request.jobId,
    trackerId:          'example-tracker',
    monitorFolder:      request.monitorFolder,
    watcherCodeVersion: 'code-example',
    workingDirectory:   request.trackerDirectory,
    plan:               {
      argv: ['true'], environment: {}, files: [], standingReplies: [], closingLine: null, endingPatterns: [], quitAtTurnEnd: null
    },
  });
  const record: WatcherRecord = {
    protocolVersion:       WATCHER_PROTOCOL_VERSION,
    eventLogFormatVersion: EVENT_LOG_FORMAT_VERSION,
    watcherInstance:       request.instance,
    state:                 'running',
    watcher:               ports.processSupervision.identityOf(process.pid),
  };
  writeFileSync(watcherFilesOf(jobFolder, request.instance).watcherRecordPath, watcherRecordTextOf(record));
  const reading = readWatcherLaunch(watcherFilesOf(jobFolder, request.instance).launchPath, ports.localEndpoint);
  if (reading.verdict !== 'read') throw new Error('the planted launch file is unreadable');
  return reading.launch.socketPath;
}

/** Listens on the socket while `during` runs, answering every frame line it received, the hello included. */
async function framesReceivedWhile(socketPath: string, during: () => Promise<void>): Promise<readonly string[]> {
  const received: string[] = [];
  const { localEndpoint } = nativePlatformPorts();
  const watcher = localEndpoint.serverOf((socket) => socket.on('data', (chunk) => received.push(chunk.toString())));
  localEndpoint.prepareEndpoint(socketPath);
  await new Promise<void>((resolve) => watcher.listen(socketPath, resolve));
  try {
    await during();
  } finally {
    await new Promise<void>((resolve) => watcher.close(() => resolve()));
  }
  return received.join('').split('\n').filter((line) => line !== '');
}

export const PlantedWatcher = Object.freeze({ plantLiveWatcher, framesReceivedWhile });
