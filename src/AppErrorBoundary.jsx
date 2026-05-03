import { Component } from 'react';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // Keep stack details in console for debugging without crashing full UI.
    console.error('Admin UI runtime error:', error);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            background: '#0f172a',
            color: '#e2e8f0',
            padding: 24,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              borderRadius: 20,
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(15, 23, 42, 0.75)',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>App Temporarily Unavailable</h2>
            <p style={{ marginTop: 0, marginBottom: 18, color: '#94a3b8' }}>
              A temporary UI error occurred. Please reload and try again.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                border: 'none',
                borderRadius: 10,
                background: '#14b8a6',
                color: '#0f172a',
                fontWeight: 800,
                padding: '10px 16px',
                cursor: 'pointer',
              }}
            >
              Reload Panel
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
