/**
 * The real gpgconf, asked for a scratch home. What matters: the read never throws, and a host with gpgconf answers for the home it is given,
 * the same as gpgconf run by hand with that `HOME`, so a profile built for a scratch home never reaches the user's own keys; a host without
 * gpgconf answers `null`, which commits unsigned. The file takes the run's gpgconf trap off for its own cases.
 */
import { realpathSync } from 'node:fs';
import { join }         from 'node:path';

import { expect, test } from 'bun:test';

import { hostExecutableResolver }                         from '../../lib/executable-resolver/ExecutableResolverFor.ts';
import { environmentCopy }                                from '../../shared/Environment.ts';
import { releaseTrappedProgramForThisSpecFile }           from '../../testing/ProgramTraps.ts';
import { GPGCONF_RECORDING }                              from '../../testing/RecordedBoundaryCommands.ts';
import { realCommandAnswerOf, recordCommandAnswer }       from '../../testing/RecordedCommand.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { GpgDirectories }                                 from './GpgDirectories.ts';
import { WorkerProfiles }                                 from './WorkerProfiles.ts';

releaseTrappedProgramForThisSpecFile('gpgconf', import.meta.path);

function listingByHand(gpgconfPath: string, home: string): string {
  const finished = Bun.spawnSync({
    cmd: [gpgconfPath, '--list-dirs'], env: { ...environmentCopy(), HOME: home }, stdout: 'pipe', stderr: 'ignore', windowsHide: true
  });
  return finished.stdout.toString();
}

test('the real gpgconf answers for the scratch home it is given, or with null where it is missing, and the profile commits unsigned', () => {
  const scratchHome = realpathSync(createScratchDirectory('gpg-home'));
  try {
    const directories = GpgDirectories.read(scratchHome);
    const gpgconf = hostExecutableResolver().absolutePathOf('gpgconf', []);
    if (gpgconf.verdict === 'found') expect(directories).toEqual(GpgDirectories.gpgDirectoriesOf(listingByHand(gpgconf.path, scratchHome)));
    else expect(directories).toBeNull();
    const missingGpgconf = join(scratchHome, 'missing', 'gpgconf');
    const placeholders = {
      [GPGCONF_RECORDING.HOME_PLACEHOLDER]:    scratchHome,
      [GPGCONF_RECORDING.PROGRAM_PLACEHOLDER]: gpgconf.verdict === 'found' ? gpgconf.path : missingGpgconf,
    };
    if (gpgconf.verdict === 'found') {
      recordCommandAnswer(
        { argv: [gpgconf.path, '--list-dirs'] },
        placeholders,
        realCommandAnswerOf([gpgconf.path, '--list-dirs'], { env: { ...environmentCopy(), HOME: scratchHome } }),
      );
    }
    recordCommandAnswer(
      { argv: [missingGpgconf, '--list-dirs'], situation: GPGCONF_RECORDING.MISSING_SITUATION },
      placeholders,
      realCommandAnswerOf([missingGpgconf, '--list-dirs']),
    );
    expect(WorkerProfiles.commitSigningOf(directories)).toEqual({ kind: 'unsigned' });
  } finally {
    removeScratchDirectory(scratchHome);
  }
});
