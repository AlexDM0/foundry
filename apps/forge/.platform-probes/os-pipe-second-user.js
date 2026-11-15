// Whether a second local user can connect to a pipe. A run records the pipe's ACL. To try it for real, one account runs
// this with `--hold-seconds 300`, and the second runs it with `--connect <the path the first printed to stderr>`.
import { closeServer, connectTo, listenOn, pipePathOf } from './support/pipes.js';
import { optionValue, probe } from './support/probe.js';
import { elevationOf, runPowershell, sleepMilliseconds } from './support/programs.js';

async function connectionFromThisAccount(path) {
  const { socket, connectError } = await connectTo(path);
  socket.destroy();
  return { path, connectError, elevation: await elevationOf() };
}

async function ownPipeAcl() {
  const path = pipePathOf('second-user');
  const { server, listenError } = await listenOn(path);
  console.error(path);
  const accessControlList = await runPowershell(`(Get-Acl '${path}') | Format-List Owner, Sddl, AccessToString`);
  await sleepMilliseconds(Number(optionValue('--hold-seconds') ?? 0) * 1000);
  await closeServer(server);
  return { path, listenError, accessControlList, elevation: await elevationOf() };
}

await probe({
  unknown: 'pipe-second-user',
  appliesTo: ['win32'],
  observe: () => {
    const pathToConnect = optionValue('--connect');
    return pathToConnect === null ? ownPipeAcl() : connectionFromThisAccount(pathToConnect);
  },
});
