/** The marks setup prints each line with, so every step reports in one style. */
export interface SetupReport {
  readonly done:    (line: string) => void;
  readonly notice:  (line: string) => void;
  readonly failure: (line: string) => void;
  readonly heading: (line: string) => void;
}

export function setupReportOver(write: (text: string) => void): SetupReport {
  return {
    done:    (line) => write(`  \u001b[32m✔\u001b[0m ${line}\n`),
    notice:  (line) => write(`  \u001b[33m•\u001b[0m ${line}\n`),
    failure: (line) => write(`  \u001b[31m✘\u001b[0m ${line}\n`),
    heading: (line) => write(`\n\u001b[1m${line}\u001b[0m\n`),
  };
}
