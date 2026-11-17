/**
 * A crossing ticket's stage and seals on its row (strategy 4.2): the stage its next launch comes from, and the seal of each package that a
 * package review sealed. A ticket whose row stores no stage is in `build`, and a stage job never moves the ticket's status.
 */
import type { Logged }            from './@types/BoardChanges.ts';
import type { Task, TicketStage } from './@types/Task.ts';
import type { BoardRecords }      from './BoardRecords.ts';
import type { ReviewBars }        from './ReviewBars.ts';
import { TicketStageUtil }        from './utils/TicketStageUtil.ts';

/** The stage of a ticket whose row stores none: stage 1 of its own entity. */
const STAGE_OF_A_ROW_WITHOUT_ONE = 'build';

export class TicketStageRows {
  constructor(private readonly records: BoardRecords, private readonly reviewBars: ReviewBars) {}

  /** `null` for a ticket that crosses into no package, and for a ticket with no row. */
  ticketStageOf(ticketId: string): TicketStage | null {
    const stage = this.rowOf(ticketId)?.stage;
    return stage === undefined ? null : { ...stage };
  }

  /** The seal of each crossed package that a package review sealed, by package key; none before the first seal. */
  ticketSealsOf(ticketId: string): Readonly<Record<string, string>> {
    return { ...this.rowOf(ticketId)?.seals ?? {} };
  }

  /** A move the stage table does not allow is a programming error: the Overseer moves a ticket only along the table. */
  moveTicketStage(ticketId: string, stage: TicketStage, at: string): Readonly<Task> {
    const ticket = this.records.requireTicket(ticketId);
    const row = this.records.ensureTaskForTicket(ticket, at);
    const currentStageName = row.stage?.name ?? STAGE_OF_A_ROW_WITHOUT_ONE;
    if (!TicketStageUtil.stageMoveIsLegal(currentStageName, stage.name)) {
      throw new Error(`Ticket #${ticketId} cannot move from the stage ${currentStageName} to ${stage.name}.`);
    }
    row.stage = { ...stage };
    return row;
  }

  sealTicketPackage(ticketId: string, packageEntity: string, seal: string, at: string): Readonly<Task> {
    const row = this.records.ensureTaskForTicket(this.records.requireTicket(ticketId), at);
    row.seals = { ...row.seals, [packageEntity]: seal };
    return row;
  }

  /** A package review that ends moves no ticket status, so its bar is closed here, as a move of the ticket closes the bar of a home review. */
  closeStageReviewBars(ticketId: string, at: string): Logged {
    return { logged: this.reviewBars.closeInProgressReviewBars([ticketId], at).logged };
  }

  private rowOf(ticketId: string): Readonly<Task> | undefined {
    const ticket = this.records.ticketRecordById(ticketId);
    return ticket === undefined ? undefined : this.records.linkedTaskRecordOf(ticket);
  }
}
