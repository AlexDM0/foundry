/**
 * Preloaded by `bunfig.toml`: makes React, the design-system package's one peer, a single copy in a test run. The package is linked with
 * `bun link`, so Bun follows the link to the package's real folder and resolves React beside it, a second copy whose hooks find no
 * renderer. Bun's runtime plugins see only the requires inside such a copy, so each of them is sent to the same file of Gaia's own copy.
 * Its statement is its registration, the reason it may do work at load.
 */
import { join } from 'node:path';

import { plugin } from 'bun';

const RELATIVE_REQUIRE = /^\.\.?\//;

const FOREIGN_REACT_FOLDER = /^(?<folder>.*\/node_modules\/(?<packageName>react|react-dom))\//;

const GAIA_NODE_MODULES = join(import.meta.dir, '..', '..', 'node_modules');

void plugin({
  name: 'design-system peers from Gaia',
  setup(build) {
    build.onResolve({ filter: RELATIVE_REQUIRE }, (resolution) => {
      const reactFolder = FOREIGN_REACT_FOLDER.exec(resolution.importer)?.groups;
      if (reactFolder?.['folder'] === undefined || reactFolder['packageName'] === undefined) return undefined;
      const gaiaFolder = join(GAIA_NODE_MODULES, reactFolder['packageName']);
      if (reactFolder['folder'] === gaiaFolder) return undefined;
      return { path: join(gaiaFolder, resolution.importer.slice(reactFolder['folder'].length + 1), '..', resolution.path) };
    });
  },
});
