import { StoredFileProblemWording }   from '../StoredFileProblemWording.ts';
import type { AssistantChatsProblem } from './@types/AssistantChatsProblem.ts';

function sentenceOf(problem: AssistantChatsProblem): string {
  switch (problem.code) {
    case 'chats-not-a-list':                  return `its ${problem.field} is not a list`;
    case 'chat-not-an-object':                return `its ${problem.field} is not an object`;
    case 'not-a-chat-sequence':               return `its ${problem.field} is not a whole number of at least 1`;
    case 'not-a-list-of-incident-ids':        return `its ${problem.field} is not a list of incident ids`;
    case 'neither-a-message-number-nor-null': return `its ${problem.field} is neither a whole number of at least 1 nor null`;
    default:                                  return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const AssistantChatsProblemWording = Object.freeze({ sentenceOf });
