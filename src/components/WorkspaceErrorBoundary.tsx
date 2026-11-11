import React from 'react';

interface WorkspaceErrorBoundaryProps {
  children: React.ReactNode;
  workspaceLabel?: string;
}

interface State {
  error: Error | null;
  /** Bump on recovery so Leaflet map mounts cleanly after a crash. */
  generation: number;
}

/** Keeps a single workspace crash from wiping the whole shell to a white page. */
export class WorkspaceErrorBoundary extends React.Component<
  WorkspaceErrorBoundaryProps,
  State
> {
  state: State = { error: null, generation: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[WorkspaceErrorBoundary] ${this.props.workspaceLabel ?? 'workspace'}`,
      error,
      info.componentStack
    );
  }

  componentDidUpdate(prevProps: WorkspaceErrorBoundaryProps) {
    if (prevProps.workspaceLabel !== this.props.workspaceLabel && this.state.error) {
      this.setState((s) => ({ error: null, generation: s.generation + 1 }));
    }
  }

  private recover = () => {
    this.setState((s) => ({ error: null, generation: s.generation + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 max-w-xl mx-auto space-y-3">
          <h2 className="text-lg font-bold text-primary">This workspace failed to load</h2>
          <p className="text-sm text-on-surface-variant">
            {this.state.error.message || 'Unexpected render error'}
          </p>
          <p className="text-xs text-on-surface-variant">
            If this followed Find Routes / Display Road Networks, zoom closer to your pins
            before turning dense road layers on again.
          </p>
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold cursor-pointer"
            onClick={this.recover}
          >
            Try again
          </button>
        </div>
      );
    }
    return (
      <div className="h-full min-h-0" key={this.state.generation}>
        {this.props.children}
      </div>
    );
  }
}
