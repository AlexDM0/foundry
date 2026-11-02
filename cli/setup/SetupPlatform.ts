import { type SetupHost }   from './SetupHost.ts';
import { type SetupReport } from './SetupReport.ts';

export interface SearchPathOffer {
  readonly host:         SetupHost;
  readonly report:       SetupReport;
  readonly binFolder:    string;
  readonly instructOnly: boolean;
}

/** What machine setup does differently per operating system; everything else is the same Bun and Node calls everywhere. */
export interface SetupPlatform {
  readonly executableFileNameOf: (programName: string) => string;
  /** Offers to put `binFolder` on the user's search path for new terminals, and reports what happened. */
  readonly offerSearchPathEntry: (offer: SearchPathOffer) => void;
}
