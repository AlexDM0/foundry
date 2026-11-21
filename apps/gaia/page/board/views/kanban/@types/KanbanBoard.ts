/** The parts of the board the Kanban and its entity filter read, exactly those, so a board document is one unchanged. */
import type { BoardDocument } from '../../../../@types/board/BoardDocument.ts';

export type KanbanBoard = Pick<BoardDocument, 'decisions' | 'openDecisionIds' | 'pipeline' | 'page' | 'mergeQueue' | 'concurrency' | 'limits'>;
