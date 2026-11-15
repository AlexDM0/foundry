/**
 * The page build's plugin that resolves React, the design-system package's one peer, from Gaia's own `node_modules`. The package is linked
 * with `bun link`, so the build follows the link to the package's real folder and would bundle the React beside it: a second copy, whose
 * hooks find no renderer. Every `react` and `react-dom` import, Gaia's own and the package's, resolves to the one copy in Gaia's root.
 */
import type { BunPlugin } from 'bun';

const REACT_SPECIFIER = /^react(?:-dom)?(?:\/.*)?$/;

export function singleReactPlugin(gaiaRootFolder: string): BunPlugin {
  return {
    name: 'one React, Gaia\'s',
    setup(build) {
      build.onResolve({ filter: REACT_SPECIFIER }, (resolution) => ({ path: Bun.resolveSync(resolution.path, gaiaRootFolder) }));
    },
  };
}
