/** A program's path of this machine in mono, from `~` under the home folder, the whole path in its tooltip. */
import { Text }                 from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useMachinePathTextOf } from '../../../shell/HomeFolder.ts';

export function ProgramPathText({ path, subtle = false }: { readonly path: string; readonly subtle?: boolean }) {
  const machinePathTextOf = useMachinePathTextOf();
  return (
    <span title={path}>
      <Text mono {...(subtle ? { subtle: true } : {})}>{machinePathTextOf(path)}</Text>
    </span>
  );
}
