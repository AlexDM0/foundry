/**
 * Preloaded into a Talos a spec spawns, so it serves the protocol version after this checkout's, as a Talos started from another program
 * would: the loader plugin rewrites the one constant as the module loads, and nothing of Talos changes. Test-only.
 */
import { readFileSync } from 'node:fs';
import { plugin }       from 'bun';

const PROTOCOL_VERSION_LINE = /^export const TALOS_PROTOCOL_VERSION = (?<version>\d+);/m;

await plugin({
  name:  'talos-of-the-next-protocol',
  setup: (build) => {
    build.onLoad({ filter: /[\\/]talos[\\/]constants[\\/]TalosProtocol\.ts$/ }, ({ path }) => ({
      loader:   'ts',
      contents: readFileSync(path, 'utf8').replace(PROTOCOL_VERSION_LINE, (_line, version: string) => `export const TALOS_PROTOCOL_VERSION = ${Number(version) + 1};`),
    }));
  },
});
