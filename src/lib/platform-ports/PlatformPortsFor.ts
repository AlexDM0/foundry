/**
 * The composition root of the platform ports: one frozen record per process, which reaches every service as a parameter. It depends on
 * `src/lib/agent-launch`, `src/lib/data-folders`, `src/lib/executable-resolver`, `src/lib/gate-confinement`, `src/lib/owner-only-files`,
 * `src/lib/process-identity`, `src/lib/shell-line` and `src/lib/watcher`.
 */
import type { LaunchEnvironment }  from '../agent-launch/LaunchEnvironment.ts';
import { launchEnvironmentFor }    from '../agent-launch/LaunchEnvironmentFor.ts';
import type { DataFolders }        from '../data-folders/DataFolders.ts';
import { dataFoldersFor }          from '../data-folders/DataFoldersFor.ts';
import type { ExecutableResolver } from '../executable-resolver/ExecutableResolver.ts';
import { executableResolverFor }   from '../executable-resolver/ExecutableResolverFor.ts';
import type { GateConfinement }    from '../gate-confinement/GateConfinement.ts';
import { gateConfinementFor }      from '../gate-confinement/GateConfinementFor.ts';
import type { OwnerOnlyFiles }     from '../owner-only-files/OwnerOnlyFiles.ts';
import { ownerOnlyFilesFor }       from '../owner-only-files/OwnerOnlyFilesFor.ts';
import type { ProcessSupervision } from '../process-identity/ProcessSupervision.ts';
import { processSupervisionFor }   from '../process-identity/ProcessSupervisionFor.ts';
import type { ShellLine }          from '../shell-line/ShellLine.ts';
import { shellLineFor }            from '../shell-line/ShellLineFor.ts';
import type { LocalEndpoint }      from '../watcher/LocalEndpoint.ts';
import { localEndpointFor }        from '../watcher/LocalEndpointFor.ts';

export interface PlatformPorts {
  readonly processSupervision: ProcessSupervision;
  readonly localEndpoint:      LocalEndpoint;
  readonly gateConfinement:    GateConfinement;
  readonly shellLine:          ShellLine;
  readonly executableResolver: ExecutableResolver;
  readonly ownerOnlyFiles:     OwnerOnlyFiles;
  readonly dataFolders:        DataFolders;
  readonly launchEnvironment:  LaunchEnvironment;
}

/** What a lib package may not read for itself. */
export interface PlatformHostFacts {
  readonly userShell:         () => string | undefined;
  readonly monitorFolderName: string;
}

export function platformPortsFor(platform: string, hostFacts: PlatformHostFacts): PlatformPorts {
  return Object.freeze({
    processSupervision: processSupervisionFor(platform),
    localEndpoint:      localEndpointFor(platform),
    gateConfinement:    gateConfinementFor(platform),
    shellLine:          shellLineFor(platform, { userShell: hostFacts.userShell }),
    executableResolver: executableResolverFor(platform),
    ownerOnlyFiles:     ownerOnlyFilesFor(platform),
    dataFolders:        dataFoldersFor(platform, hostFacts.monitorFolderName),
    launchEnvironment:  launchEnvironmentFor(platform),
  });
}
