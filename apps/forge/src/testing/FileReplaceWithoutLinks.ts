/** A filesystem where hard links fail, as exFAT or an SMB share: a whole create is refused, an exclusive open still works. */
import type { FileReplace }             from '../lib/atomic-file/FileReplace.ts';
import { REAL_FILE_REPLACE_PRIMITIVES } from '../lib/atomic-file/FileReplaceFor.ts';
import { createPosixFileReplace }       from '../lib/atomic-file/PosixFileReplace.ts';

export const EXAMPLE_LINK_REFUSAL_MESSAGE = 'EPERM: example link refusal';

export function fileReplaceWithoutLinks(): FileReplace {
  return createPosixFileReplace({
    ...REAL_FILE_REPLACE_PRIMITIVES,
    link: () => {
      throw Object.assign(new Error(EXAMPLE_LINK_REFUSAL_MESSAGE), { code: 'EPERM' });
    },
  });
}
