import type { BaseStoredFileProblem, StoredFileProblem } from '../../../shared/@types/StoredFileProblem.ts';

/** Why `assistant-chats.json` could not be read; `field` is the chat's path in the document (`chats[1].sequence`). */
export type AssistantChatsProblem =
  | BaseStoredFileProblem
  | StoredFileProblem<'chats-not-a-list'> & { readonly field: 'chats' }
  | StoredFileProblem<'chat-not-an-object'> & { readonly field: string }
  | StoredFileProblem<'not-a-chat-sequence'> & { readonly field: string }
  | StoredFileProblem<'not-a-list-of-incident-ids'> & { readonly field: string }
  | StoredFileProblem<'neither-a-message-number-nor-null'> & { readonly field: string };
