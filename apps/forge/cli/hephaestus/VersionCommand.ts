import { TALOS_PROTOCOL_VERSION }   from '../../src/lib/talos/constants/TalosProtocol.ts';
import { CodeVersion }              from '../../src/services/hephaestus/CodeVersion.ts';
import { SERVED_CONTRACT_VERSIONS } from '../../src/shared/constants/HephaestusApiContracts.ts';
import { PRODUCT_NAMES }            from '../../src/shared/constants/ProductNames.ts';
import type { CommandHandler }      from '../CommandHandler.ts';
import { INSTALL_VERSION }          from '../constants/InstallVersion.ts';
import { ProgramAnswerUtil }        from '../utils/ProgramAnswerUtil.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} version [--json]`;

/**
 * Read-only and needing no tracker: the live Hephaestus runs the binary on disk with `--json` to learn whether new code landed, and a monitor
 * reads which contracts this program serves, the Talos protocol version it starts Talos at, and where its monitor folder is.
 */
export const versionCommand: CommandHandler = (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(['json'], USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);
  const versions = {
    codeVersion:          CodeVersion.onDisk(),
    installVersion:       INSTALL_VERSION,
    contracts:            SERVED_CONTRACT_VERSIONS,
    talosProtocolVersion: TALOS_PROTOCOL_VERSION,
    monitorFolder:        context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory),
  };
  ProgramAnswerUtil.printAnswer(commandArguments, context, versions, `code ${versions.codeVersion}, install version ${versions.installVersion}`);
  return Promise.resolve();
};
