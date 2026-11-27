/** A filesystem where hard links fail, as exFAT or an SMB share: the exclusive open that could leave a partial file still works. */
import type { FileReplace }         from '../lib/atomic-file/FileReplace.ts';
import { fileReplaceOfThisProcess } from '../lib/atomic-file/FileReplaceFor.ts';

export const EXAMPLE_LINK_REFUSAL_MESSAGE = 'EPERM: example link refusal';

export function fileReplaceWithoutLinks(): FileReplace {
  return {
    ...fileReplaceOfThisProcess(),
    createWholeExclusively: () => {
      throw Object.assign(new Error(EXAMPLE_LINK_REFUSAL_MESSAGE), { code: 'EPERM' });
    },
  };
}
