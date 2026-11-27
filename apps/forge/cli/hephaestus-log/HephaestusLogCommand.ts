/**
 * `hephaestus-log [--follow] [--json]`: prints `<data>/hephaestus.log` for a person, each record as its `at` and its details, as standard
 * error showed them. A line that is no record is skipped and named on standard error. `--follow` keeps printing what is appended until a
 * stop signal. It reads the file alone, so it works with the forge up or down, and takes no lock.
 */
import { dirname } from 'node:path';

import type { HephaestusLogLineReading } from '../../src/adapters/hephaestus-log/HephaestusLogIngestion.ts';
import { HephaestusLogIngestion }        from '../../src/adapters/hephaestus-log/HephaestusLogIngestion.ts';
import { HephaestusLogProblemWording }   from '../../src/adapters/hephaestus-log/HephaestusLogProblemWording.ts';
import { QuietWatch }                    from '../../src/lib/quiet-watch/QuietWatch.ts';
import { hephaestusFilesIn }             from '../../src/services/hephaestus/HephaestusFiles.ts';
import { requireWorkspace }              from '../../src/services/tracker/Workspace.ts';
import { OperationRefusal }              from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                 from '../../src/shared/constants/ProductNames.ts';
import { JsonTextUtil }                  from '../../src/shared/utils/JsonTextUtil.ts';
import type { CommandContext }           from '../CommandContext.ts';
import type { CommandHandler }           from '../CommandHandler.ts';
import type { ArgumentParser }           from '../arguments/ArgumentParser.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} hephaestus-log [--follow] [--json]`;

/** An append the folder watch misses, on a platform that cannot watch it, is still printed within this. */
const FOLLOW_SWEEP_MILLISECONDS = 1000;

type RecordReading = Extract<HephaestusLogLineReading, { verdict: 'record' }>;

interface LogPrinter {
  printRecord: (reading: RecordReading) => void;
  printEnd:    () => void;
}

function skippedLineTextOf(logFilePath: string, reading: Exclude<HephaestusLogLineReading, { verdict: 'record' }>): string {
  return `Line ${reading.lineNumber} of ${logFilePath} is no log record (${HephaestusLogProblemWording.sentenceOf(reading.problem)}); it is skipped.`;
}

function storedEntryOf({ lineNumber, line }: RecordReading): object {
  return {
    lineNumber, at: line.at, kind: line.kind, details: line.details
  };
}

/** Text prints each record as it is read; `--json` gathers them into one document, or, under `--follow`, prints one JSON line per record. */
function logPrinterOf(commandArguments: ArgumentParser, context: CommandContext, logFilePath: string, following: boolean): LogPrinter {
  if (!commandArguments.flag('json')) {
    return { printRecord: ({ line }) => context.standardOutput(`${line.at} ${line.details}`), printEnd: () => undefined };
  }
  if (following) return { printRecord: (reading) => context.standardOutput(JSON.stringify(storedEntryOf(reading))), printEnd: () => undefined };
  const records: object[] = [];
  return {
    printRecord: (reading) => { records.push(storedEntryOf(reading)); },
    printEnd:    () => context.standardOutput(JsonTextUtil.indentedTextOf({ logFilePath, records })),
  };
}

/** Prints what the log holds past the last read; an absent log has nothing to print yet. */
function printNewLines(ingestion: HephaestusLogIngestion, logFilePath: string, context: CommandContext, printer: LogPrinter): void {
  const reading = ingestion.read();
  if (reading.verdict === 'absent') return;
  if (reading.verdict === 'unreadable') {
    throw new OperationRefusal('unrepaired', `The Hephaestus log ${logFilePath} cannot be read: ${HephaestusLogProblemWording.sentenceOf(reading.problem)}.`);
  }
  for (const line of reading.lines) {
    if (line.verdict === 'record') printer.printRecord(line);
    else context.standardError(skippedLineTextOf(logFilePath, line));
  }
}

/** Resolves on a change in the log's folder, at the sweep, or at the stop. */
function changeSweepOrStop(folderPath: string, onStop: (wake: () => void) => void): Promise<void> {
  return new Promise((resolve) => {
    const folderWatch = QuietWatch.watchQuietly({ folderPath, recursive: false, onEvent: () => finish() });
    const sweep = setTimeout(() => finish(), FOLLOW_SWEEP_MILLISECONDS);
    onStop(() => finish());

    function finish(): void {
      folderWatch?.close();
      clearTimeout(sweep);
      resolve();
    }
  });
}

async function followTheLog(ingestion: HephaestusLogIngestion, logFilePath: string, context: CommandContext, printer: LogPrinter): Promise<void> {
  let stopped = false;
  let wakeTheWait: () => void = () => undefined;
  const forget = context.onStopSignal(() => {
    stopped = true;
    wakeTheWait();
  });
  try {
    while (!stopped) {
      printNewLines(ingestion, logFilePath, context, printer);
      await changeSweepOrStop(dirname(logFilePath), (wake) => {
        wakeTheWait = wake;
        if (stopped) wake();
      });
    }
  } finally {
    forget();
  }
}

export const hephaestusLogCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(['follow', 'json'], USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const { logFilePath } = hephaestusFilesIn(requireWorkspace(context.currentDirectory).trackerDirectory);
  const following = commandArguments.flag('follow');
  const ingestion = new HephaestusLogIngestion(logFilePath);
  const printer = logPrinterOf(commandArguments, context, logFilePath, following);
  if (following) await followTheLog(ingestion, logFilePath, context, printer);
  else printNewLines(ingestion, logFilePath, context, printer);
  printer.printEnd();
};
