/**
 * A crossing ticket's stage and seals on its row (strategy 4.2): the stage its next launch comes from, and the seal of each package that a
 * package review sealed. A ticket whose row stores no stage is in `build`, and a stage job never moves the ticket's status. Each stage
 * start, seal and package return is logged; a package return lifts the returned package's seal and counts on the row (E41, E65). The owner
 * agreed to one way back: a second return is not a move but the decision `second-return`, which the Board opens (E45).
 */
import type { Logged }            from './@types/BoardChanges.ts';
import type { LogRecord }         from './@types/LogRecord.ts';
import type { Task, TicketStage } from './@types/Task.ts';
import type { BoardRecords }      from './BoardRecords.ts';
import type { ReviewBars }        from './ReviewBars.ts';
import { TicketStageUtil }        from './utils/TicketStageUtil.ts';

/** The stage of a ticket whose row stores none: stage 1 of its own entity. */
const STAGE_OF_A_ROW_WITHOUT_ONE = 'build';

/** The package returns the owner agreed to (E45). */
const PACKAGE_RETURNS_AGREED = 1;

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

  /** Whether moving the ticket into `stage` is a package return past the one the owner agreed to. */
  stageMoveIsASecondPackageReturn(ticketId: string, stage: TicketStage): boolean {
    const row = this.rowOf(ticketId);
    const currentStageName = row?.stage?.name ?? STAGE_OF_A_ROW_WITHOUT_ONE;
    return TicketStageUtil.stageMoveIsAPackageReturn(currentStageName, stage.name) && (row?.packageReturns ?? 0) >= PACKAGE_RETURNS_AGREED;
  }

  /**
   * A move the stage table does not allow is a programming error: Hephaestus moves a ticket only along the table. A second package
   * return is one too: it goes through the Board's `returnTicketToThePackage`, which opens `second-return` instead.
   */
  moveTicketStage(ticketId: string, stage: TicketStage, at: string): Logged {
    const ticket = this.records.requireTicket(ticketId);
    const row = this.records.ensureTaskForTicket(ticket, at);
    const currentStageName = row.stage?.name ?? STAGE_OF_A_ROW_WITHOUT_ONE;
    if (!TicketStageUtil.stageMoveIsLegal(currentStageName, stage.name)) {
      throw new Error(`Ticket #${ticketId} cannot move from the stage ${currentStageName} to ${stage.name}.`);
    }
    if (this.stageMoveIsASecondPackageReturn(ticketId, stage)) {
      throw new Error(`Ticket #${ticketId} returned to a package once; a second return opens the decision second-return.`);
    }
    const logged: LogRecord[] = TicketStageUtil.stageMoveIsAPackageReturn(currentStageName, stage.name)
      ? this.returnToThePackage(row, ticketId, stage.entity, currentStageName, at)
      : [];
    row.stage = { ...stage };
    logged.push(this.records.logger.log({ kind: 'stage-started', ticketId, fields: { stage: stage.name, entity: stage.entity } }, at));
    return { logged };
  }

  /**
   * The package change of a crossing ticket is dropped or becomes a need (E19, E22): the package's seal is lifted, so stage 1 may take the
   * change out, and the ticket goes back to `build` of its home, where a ticket already back there stays. No package return is counted.
   */
  moveTicketBackToBuild(ticketId: string, homeEntity: string, packageEntity: string, at: string): Logged {
    const row = this.records.ensureTaskForTicket(this.records.requireTicket(ticketId), at);
    const logged: LogRecord[] = [];
    if (row.seals !== undefined && Object.hasOwn(row.seals, packageEntity)) {
      row.seals = Object.fromEntries(Object.entries(row.seals).filter(([sealedEntity]) => sealedEntity !== packageEntity));
      logged.push(this.records.logger.log({ kind: 'seal-lifted', ticketId, fields: { entity: packageEntity } }, at));
    }
    if ((row.stage?.name ?? STAGE_OF_A_ROW_WITHOUT_ONE) === STAGE_OF_A_ROW_WITHOUT_ONE) return { logged };
    return { logged: [...logged, ...this.moveTicketStage(ticketId, { name: 'build', entity: homeEntity }, at).logged] };
  }

  /**
   * The ticket starts afresh in another entity (E15): its row stores no stage, so its next build is stage 1 of its new entity, and the
   * seals of its old branch go, emptied rather than removed as a lifted seal leaves them.
   */
  clearTicketStage(ticketId: string): void {
    const ticket = this.records.requireTicket(ticketId);
    const row = this.records.linkedTaskRecordOf(ticket);
    if (row === undefined) return;
    delete row.stage;
    if (row.seals !== undefined) row.seals = {};
  }

  sealTicketPackage(ticketId: string, packageEntity: string, seal: string, at: string): Logged {
    const row = this.records.ensureTaskForTicket(this.records.requireTicket(ticketId), at);
    row.seals = { ...row.seals, [packageEntity]: seal };
    return { logged: [this.records.logger.log({ kind: 'seal-set', ticketId, fields: { entity: packageEntity, seal } }, at)] };
  }

  /** How many times the ticket returned to a package build; none before its first return. */
  ticketPackageReturnsOf(ticketId: string): number {
    return this.rowOf(ticketId)?.packageReturns ?? 0;
  }

  /** A package review that ends moves no ticket status, so its bar is closed here, as a move of the ticket closes the bar of a home review. */
  closeStageReviewBars(ticketId: string, at: string): Logged {
    return { logged: this.reviewBars.closeInProgressReviewBars([ticketId], at).logged };
  }

  /** The row keeps `seals` once set, also when the lifted seal was its last, so a row is never rewritten back to one that never crossed. */
  private returnToThePackage(row: Task, ticketId: string, packageEntity: string, fromStage: TicketStage['name'], at: string): LogRecord[] {
    const logged: LogRecord[] = [];
    if (row.seals !== undefined && Object.hasOwn(row.seals, packageEntity)) {
      row.seals = Object.fromEntries(Object.entries(row.seals).filter(([sealedEntity]) => sealedEntity !== packageEntity));
      logged.push(this.records.logger.log({ kind: 'seal-lifted', ticketId, fields: { entity: packageEntity } }, at));
    }
    const returns = (row.packageReturns ?? 0) + 1;
    row.packageReturns = returns;
    logged.push(this.records.logger.log({ kind: 'package-return', ticketId, fields: { entity: packageEntity, fromStage, returns } }, at));
    return logged;
  }

  private rowOf(ticketId: string): Readonly<Task> | undefined {
    const ticket = this.records.ticketRecordById(ticketId);
    return ticket === undefined ? undefined : this.records.linkedTaskRecordOf(ticket);
  }
}
