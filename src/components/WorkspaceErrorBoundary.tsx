import React from 'react';

interface WorkspaceErrorBoundaryProps {
  children: React.ReactNode;
  workspaceLabel?: string;
}

interface State {
  error: Error | null;
}

/** Keeps a single workspace crash from wiping the whole shell to a white page. */
export class WorkspaceErrorBoundary extends React.Component<
  WorkspaceErrorBoundaryProps,
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: WorkspaceErrorBoundaryProps) {
    if (prevProps.workspaceLabel !== this.props.workspaceLabel && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 max-w-xl mx-auto space-y-3">
          <h2 className="text-lg font-bold text-primary">This workspace failed to load</h2>
          <p className="text-sm text-on-surface-variant">
            {this.state.error.message || 'Unexpected render error'}
          </p>
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold cursor-pointer"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return <div className="h-full min-h-0">{this.props.children}</div>;
  }
}
