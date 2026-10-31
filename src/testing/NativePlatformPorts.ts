/** The ports of the machine a spec runs on, so a spec that drives real processes passes the record a process context would. */
import { platformPortsFor, type PlatformPorts } from '../lib/platform-ports/PlatformPortsFor.ts';
import { PLATFORM_HOST_FACTS }                  from '../shared/PlatformHostFacts.ts';

export function nativePlatformPorts(): PlatformPorts {
  return platformPortsFor(process.platform, PLATFORM_HOST_FACTS);
}
