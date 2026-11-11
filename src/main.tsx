import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { clearPersistedLayerSelections } from './gis/clearPersistedLayerSelections';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';

/** Every load / hard refresh starts with no saved layer picks (new-session behaviour). */
clearPersistedLayerSelections();

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 12,
            padding: 24,
            fontFamily: 'Inter, system-ui, sans-serif',
            background: '#f8f9ff',
            color: '#0b1c30',
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 18, margin: 0 }}>EAGLE UI failed to start</h1>
          <p style={{ fontSize: 13, color: '#43474d', maxWidth: 480, margin: 0 }}>
            {this.state.error.message || 'Unexpected render error'}
          </p>
          <button
            type="button"
            style={{
              marginTop: 8,
              padding: '8px 14px',
              background: '#001428',
              color: '#fff',
              border: 0,
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
            }}
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root element missing from index.html');
}

createRoot(rootEl).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
