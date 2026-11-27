/**
 * The composition root of the platform ports: one frozen record per process, which reaches every service as a parameter. It depends on
 * `src/lib/agent-launch`, `src/lib/data-folders`, `src/lib/executable-resolver`, `src/lib/gate-confinement`, `src/lib/local-endpoint`,
 * `src/lib/owner-only-files`, `src/lib/process-identity`, `src/lib/program-folders` and `src/lib/shell-line`.
 */
import type { LaunchEnvironment }  from '../agent-launch/LaunchEnvironment.ts';
import { launchEnvironmentFor }    from '../agent-launch/LaunchEnvironmentFor.ts';
import type { DataFolders }        from '../data-folders/DataFolders.ts';
import { dataFoldersFor }          from '../data-folders/DataFoldersFor.ts';
import type { ExecutableResolver } from '../executable-resolver/ExecutableResolver.ts';
import { executableResolverFor }   from '../executable-resolver/ExecutableResolverFor.ts';
import type { GateConfinement }    from '../gate-confinement/GateConfinement.ts';
import { gateConfinementFor }      from '../gate-confinement/GateConfinementFor.ts';
import type { LocalEndpoint }      from '../local-endpoint/LocalEndpoint.ts';
import { localEndpointFor }        from '../local-endpoint/LocalEndpointFor.ts';
import type { OwnerOnlyFiles }     from '../owner-only-files/OwnerOnlyFiles.ts';
import { ownerOnlyFilesFor }       from '../owner-only-files/OwnerOnlyFilesFor.ts';
import type { ProcessSupervision } from '../process-identity/ProcessSupervision.ts';
import { processSupervisionFor }   from '../process-identity/ProcessSupervisionFor.ts';
import type { ProgramFolders }     from '../program-folders/ProgramFolders.ts';
import { programFoldersFor }       from '../program-folders/ProgramFoldersFor.ts';
import type { ShellLine }          from '../shell-line/ShellLine.ts';
import { shellLineFor }            from '../shell-line/ShellLineFor.ts';

export interface PlatformPorts {
  readonly processSupervision: ProcessSupervision;
  readonly localEndpoint:      LocalEndpoint;
  readonly gateConfinement:    GateConfinement;
  readonly shellLine:          ShellLine;
  readonly executableResolver: ExecutableResolver;
  readonly ownerOnlyFiles:     OwnerOnlyFiles;
  readonly dataFolders:        DataFolders;
  readonly programFolders:     ProgramFolders;
  readonly launchEnvironment:  LaunchEnvironment;
}

/** What a lib package may not read for itself. */
export interface PlatformHostFacts {
  readonly userShell:                    () => string | undefined;
  readonly commandInterpreter:           () => string | undefined;
  readonly systemRoot:                   () => string | undefined;
  /** Windows' `LOCALAPPDATA`, `APPDATA` and `ProgramFiles`, under which programs are installed there. */
  readonly localApplicationDataFolder:   () => string | undefined;
  readonly roamingApplicationDataFolder: () => string | undefined;
  readonly programFilesFolder:           () => string | undefined;
  /** Windows' `PATHEXT`, the extensions a program is found by there. */
  readonly programExtensions:            () => string | undefined;
  readonly monitorFolderName:            string;
  readonly pipeNamePrefix:               string;
}

export function platformPortsFor(platform: string, hostFacts: PlatformHostFacts): PlatformPorts {
  const programFolders = programFoldersFor(platform, hostFacts);
  return Object.freeze({
    processSupervision: processSupervisionFor(platform, hostFacts.systemRoot()),
    localEndpoint:      localEndpointFor(platform, hostFacts.pipeNamePrefix),
    gateConfinement:    gateConfinementFor(platform),
    shellLine:          shellLineFor(platform, hostFacts),
    executableResolver: executableResolverFor(platform),
    ownerOnlyFiles:     ownerOnlyFilesFor(platform),
    dataFolders:        dataFoldersFor(platform, hostFacts.monitorFolderName, hostFacts.systemRoot),
    programFolders,
    launchEnvironment:  launchEnvironmentFor(platform, programFolders.baseFolders),
  });
}
