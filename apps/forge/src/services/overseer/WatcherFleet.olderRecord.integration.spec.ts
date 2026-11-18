/**
 * A Baton pass across the rename of a process start: a live Watcher and a live Overseer keep the files their older code wrote, with the number
 * `startEpochSeconds`. What matters is that both still read live, because a read of lost would relaunch a job beside its running agent, and that
 * an attached Watcher of the older protocol is greeted in its own version, because it refuses any other.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { join }                                   from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { type ProcessIdentity, sameProcess, storedIdentityOf } from '../../lib/process-identity/ProcessIdentity.ts';
import { EVENT_LOG_FORMAT_VERSION }                            from '../../lib/talos/constants/TalosProtocol.ts';
import { watcherFilesOf }                                      from '../../lib/watcher/WatcherFiles.ts';
import { readWatcherLaunch }                                   from '../../lib/watcher/WatcherLaunch.ts';
import { nativePlatformPorts }                                 from '../../testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory }      from '../../testing/ScratchWorkspace.ts';
import { Baton }                                               from './Baton.ts';
import { WatcherFleet }                                        from './WatcherFleet.ts';

const ports = nativePlatformPorts();

const INSTANCE = 1;
const OLDER_PROTOCOL = 1;

let scratchDirectory = '';

function ownIdentity(): ProcessIdentity {
  const identity = ports.processSupervision.identityOf(process.pid);
  if (identity === null) throw new Error('this process has no readable identity');
  return identity;
}

function olderIdentityOf({ processId, startStamp, bootIdentity }: ProcessIdentity): object {
  return { processId, startEpochSeconds: Number(startStamp), bootIdentity };
}

function jobFolderWithRecord(watcher: object): string {
  const jobFolder = join(scratchDirectory, 'J1');
  mkdirSync(jobFolder, { recursive: true });
  writeFileSync(watcherFilesOf(jobFolder, INSTANCE).watcherRecordPath, `${JSON.stringify({
    protocolVersion:       OLDER_PROTOCOL,
    eventLogFormatVersion: EVENT_LOG_FORMAT_VERSION,
    watcherInstance:       INSTANCE,
    state:                 'running',
    watcher,
    childProcess:          watcher,
    childProcessGroupId:   process.pid,
  })}\n`);
  return jobFolder;
}

function batonText(startFields: object): string {
  return JSON.stringify({
    processId:              process.pid,
    ...startFields,
    bootIdentity:           ownIdentity().bootIdentity,
    port:                   4930,
    url:                    'http://127.0.0.1:4930/',
    tokenFile:              join(scratchDirectory, 'token'),
    codeVersion:            'code-example',
    installVersion:         19,
    watcherProtocolVersion: OLDER_PROTOCOL,
  });
}

beforeEach(() => {
  scratchDirectory = createScratchDirectory('older-record');
});

afterEach(() => {
  removeScratchDirectory(scratchDirectory);
});

describe('a live Watcher across the rename', () => {
  test('its record of the new field reads live', () => {
    expect(WatcherFleet.livenessOf(ports, jobFolderWithRecord(ownIdentity()), INSTANCE)).toEqual({ verdict: 'live' });
  });

  test('its record of the older number reads live, and its stamp is that number\'s decimal text', () => {
    const jobFolder = jobFolderWithRecord(olderIdentityOf(ownIdentity()));
    expect(WatcherFleet.livenessOf(ports, jobFolder, INSTANCE)).toEqual({ verdict: 'live' });
    expect(WatcherFleet.watcherRecordOf(jobFolder, INSTANCE)?.childProcess).toEqual(ownIdentity());
  });

  test('another start under the older field still reads lost', () => {
    const jobFolder = jobFolderWithRecord({ ...olderIdentityOf(ownIdentity()), startEpochSeconds: 1 });
    expect(WatcherFleet.livenessOf(ports, jobFolder, INSTANCE)).toEqual({ verdict: 'lost' });
  });

  test('a stored identity of either field is the same process as the one read now', () => {
    const current = ownIdentity();
    for (const stored of [current, olderIdentityOf(current)]) {
      const read = storedIdentityOf(stored);
      expect(read !== null && sameProcess(current, read)).toBe(true);
    }
  });
});

describe('a live Overseer across the rename', () => {
  test.each([
    ['the new field', () => ({ processStartStamp: ownIdentity().startStamp })],
    ['the older number', () => ({ processStartEpochSeconds: Number(ownIdentity().startStamp) })],
  ])('a Baton holding %s reads live', (_case, startFields) => {
    writeFileSync(Baton.batonFilePathFor(scratchDirectory, 1), batonText(startFields()));
    expect(Baton.newestBatonOf(ports, scratchDirectory)).toMatchObject({ verdict: 'live', generation: 1, record: { processStartStamp: ownIdentity().startStamp } });
  });

  test('a Baton holding an older number of another start reads dead', () => {
    writeFileSync(Baton.batonFilePathFor(scratchDirectory, 1), batonText({ processStartEpochSeconds: 1 }));
    expect(Baton.newestBatonOf(ports, scratchDirectory).verdict).toBe('dead');
  });
});

describe('greeting a Watcher of the older protocol', () => {
  let server: Server | null = null;
  const monitorFolders: string[] = [];

  afterEach(() => {
    server?.close();
    server = null;
    for (const monitorFolder of monitorFolders.splice(0)) removeScratchDirectory(monitorFolder);
  });

  test('its hello names the protocol of its record', async () => {
    const jobFolder     = jobFolderWithRecord(ownIdentity());
    const monitorFolder = createScratchDirectory('h');
    monitorFolders.push(monitorFolder);
    WatcherFleet.writeProcessLaunchFile(ports, {
      watcherFolder:      jobFolder,
      instance:           INSTANCE,
      jobId:              'J1',
      socketName:         'older',
      trackerId:          'example-tracker',
      monitorFolder,
      watcherCodeVersion: 'code-example',
      workingDirectory:   scratchDirectory,
      argv:               ['/bin/true'],
      environment:        {},
    });
    const { launchPath } = watcherFilesOf(jobFolder, INSTANCE);
    writeFileSync(launchPath, JSON.stringify({ ...JSON.parse(readFileSync(launchPath, 'utf8')) as object, protocolVersion: OLDER_PROTOCOL }));
    const reading = readWatcherLaunch(launchPath, ports.localEndpoint);
    if (reading.verdict !== 'read') throw new Error(`the launch file reads ${reading.verdict}: ${reading.reason}`);
    const { socketPath } = reading.launch;
    ports.localEndpoint.prepareEndpoint(socketPath);
    const receivedText = new Promise<string>((resolve) => {
      server = createServer((socket: Socket) => {
        let text = '';
        socket.on('data', (chunk) => {
          text += chunk.toString('utf8');
        });
        socket.once('end', () => resolve(text));
      }).listen(socketPath);
    });
    await WatcherFleet.sendFrames(ports, jobFolder, INSTANCE, [{ kind: 'stop', graceMilliseconds: 0 }]);
    const [hello] = (await receivedText).split('\n');
    expect(JSON.parse(hello ?? '')).toMatchObject({ kind: 'hello', protocolVersion: OLDER_PROTOCOL });
  });
});
