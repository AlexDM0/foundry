/**
 * Catches whatever a view throws while rendering and shows a banner in its place. React offers error boundaries only as class components.
 */
import { Banner }                                    from 'design-system/Banner';
import { Component, type ErrorInfo, type ReactNode } from 'react';


export interface BoardErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onError?: (error: unknown, info: ErrorInfo) => void;
}

interface BoardErrorBoundaryState {
  readonly failure: string | null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class BoardErrorBoundary extends Component<BoardErrorBoundaryProps, BoardErrorBoundaryState> {
  override state: BoardErrorBoundaryState = { failure: null };

  static getDerivedStateFromError(error: unknown): BoardErrorBoundaryState {
    return { failure: messageOf(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override render(): ReactNode {
    if (this.state.failure === null) return this.props.children;
    return (
      <Banner tone="error" role="alert" text={`The board failed to render: ${this.state.failure}. Reload the page; the board itself is unaffected.`} />
    );
  }
}
