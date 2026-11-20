/** The filing cabinet's kinds of the control contract, `epic-add` and the mutating `draft-*` kinds, each applied in a `writeTracker` hold. */
import type { ControlCommandOf as CommandOf } from '../../shared/@types/ControlCommand.ts';
import type { BoardTransaction }              from '../tracker/BoardTransaction.ts';

function addEpic(command: CommandOf<'epic-add'>, change: BoardTransaction) {
  const filePath = change.records.newEpicLocation(command.key);
  return change.board.addEpic({
    key: command.key, title: command.title, body: command.bodyText, filePath
  }, change.at);
}

function openDraft(command: CommandOf<'draft-open'>, change: BoardTransaction) {
  const result = change.board.openDraft({ title: command.title, request: command.request, owner: command.owner }, change.at);
  // The refusal leaves before the hold writes, so the draft the Board just opened is dropped with it.
  change.records.requireDraftKeyIsFree(result.draft.id);
  return result;
}

export const FILING_CONTROLS = {
  'epic-add':    addEpic,
  'draft-open':  openDraft,
  'draft-claim': (command: CommandOf<'draft-claim'>, change: BoardTransaction) => change.board.claimDraft(
    command.draftId,
    { owner: command.owner, forces: command.forces },
    change.at,
  ),
  'draft-release': (command: CommandOf<'draft-release'>, change: BoardTransaction) => change.board.releaseDraft(command.draftId, change.at),
  'draft-note':    (command: CommandOf<'draft-note'>, change: BoardTransaction) => change.board.addDraftNote(
    command.draftId,
    { text: command.text, kind: command.noteKind },
    change.at,
  ),
  'draft-ask':    (command: CommandOf<'draft-ask'>, change: BoardTransaction) => change.board.askDraftQuestion(command.draftId, command.asking, change.at),
  'draft-answer': (command: CommandOf<'draft-answer'>, change: BoardTransaction) => change.board.answerDraftQuestion(
    command.draftId,
    command.questionId,
    command.answer,
    change.at,
  ),
  'draft-drop':    (command: CommandOf<'draft-drop'>, change: BoardTransaction) => change.board.dropDraftItem(command.draftId, command.itemId, change.at),
  'draft-close':   (command: CommandOf<'draft-close'>, change: BoardTransaction) => change.board.closeDraft(command.draftId, command.ticketReferences, change.at),
  'draft-abandon': (command: CommandOf<'draft-abandon'>, change: BoardTransaction) => change.board.abandonDraft(command.draftId, command.reason, change.at),
} as const;
