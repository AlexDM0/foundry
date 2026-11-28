import type { CommittedContentProblem } from './CommittedContentProblem.ts';
import type { StoredFileProblem }       from './StoredFileProblem.ts';
import type { TicketFileProblem }       from './TicketFileProblem.ts';

/** Why the store lists a ticket as unreadable: its file, its file name against its `id`, an `id` two files hold, or its kept content. */
export type UnreadableTicketProblem =
  | TicketFileProblem
  | StoredFileProblem<'file-name-names-another-id'> & { readonly field: 'id'; readonly idInFileName: string; readonly storedId: string }
  | StoredFileProblem<'id-held-twice'> & { readonly field: 'id'; readonly storedId: string; readonly otherFileNames: readonly string[] }
  | StoredFileProblem<'committed-content-missing'> & { readonly contentProblem: CommittedContentProblem };
