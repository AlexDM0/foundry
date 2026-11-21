/** A View laid out as a row: every View prop but `row`, with `centerY` the cross-axis centring that `between` still takes. */
import { View, type RowAlignment, type ViewContentProps } from '../atoms/View.tsx';

export type RowProps = ViewContentProps & RowAlignment;

export function Row(props: RowProps) {
  return <View {...props} row />;
}
