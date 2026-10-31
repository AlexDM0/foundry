/**
 * The composition root of the platform ports: one frozen record per process, which reaches every service as a parameter. It depends on
 * `src/lib/process-identity` and `src/lib/watcher`.
 */
import type { ProcessSupervision } from '../process-identity/ProcessSupervision.ts';
import { processSupervisionFor }   from '../process-identity/ProcessSupervisionFor.ts';
import type { LocalEndpoint }      from '../watcher/LocalEndpoint.ts';
import { localEndpointFor }        from '../watcher/LocalEndpointFor.ts';

export interface PlatformPorts {
  readonly processSupervision: ProcessSupervision;
  readonly localEndpoint:      LocalEndpoint;
}

export function platformPortsFor(platform: string): PlatformPorts {
  return Object.freeze({ processSupervision: processSupervisionFor(platform), localEndpoint: localEndpointFor(platform) });
}
