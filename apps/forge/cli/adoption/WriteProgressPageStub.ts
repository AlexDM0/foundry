import { createProgressPageStubWriter } from '../../src/adapters/progress-page/ProgressPageStubWriter.ts';
import type { PlatformPorts }           from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import { Baton }                        from '../../src/services/overseer/Baton.ts';
import { overseerFilesIn }              from '../../src/services/overseer/OverseerFiles.ts';
import type { Workspace }               from '../../src/services/tracker/Workspace.ts';

/** For `init` and `update`: the stub names the live Baton's URL, or says the Overseer is down. */
export function writeProgressPageStub(ports: PlatformPorts, workspace: Workspace): void {
  const newest = Baton.newestBatonOf(ports, overseerFilesIn(workspace.trackerDirectory).overseerDirectory);
  createProgressPageStubWriter(workspace.htmlFilePath).write(newest.verdict === 'live' ? newest.record.url : null);
}
