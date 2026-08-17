import React from 'react';
import { Box, Text } from 'ink';

const e = React.createElement;

/**
 * React Error Boundary for the Ink app.
 * Catches rendering errors and shows a friendly error message
 * instead of crashing the terminal.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log to stderr for debugging
    if (process.env.DEBUG) {
      console.error('[ErrorBoundary]', error.message, errorInfo.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message || 'Unknown error';
      return e(Box, { flexDirection: 'column', marginTop: 1, padding: 1 },
        e(Text, { color: 'red', bold: true }, '  ✗ Render Error'),
        e(Text, { color: 'red' }, `  ${msg.slice(0, 200)}`),
        e(Text, { dimColor: true }, '  Restart the app or run /help for support.'),
        e(Box, { marginTop: 1 },
          e(Text, { dimColor: true }, '  Press any key to continue...')
        )
      );
    }

    return this.props.children;
  }
}
