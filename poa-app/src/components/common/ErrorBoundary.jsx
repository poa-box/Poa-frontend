/**
 * Error Boundary Component
 * Catches React errors and displays a fallback UI
 */

import React from 'react';
import {
  Box,
  Button,
  Text,
} from '@chakra-ui/react';

// The global boundary surrounds ChakraProvider. Its fallback must also work when
// that provider (or its theme) is the child that failed.
const fallbackStyles = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(to right, #fed7aa, #fbcfe8)', padding: '1rem', boxSizing: 'border-box',
    fontFamily: 'system-ui, sans-serif', color: '#374151' },
  card: { width: '100%', maxWidth: '36rem', padding: '2rem', borderRadius: '0.75rem',
    background: '#fff', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', textAlign: 'center' },
  heading: { margin: '0 0 1.5rem', fontSize: '1.5rem', color: '#b91c1c' },
  details: { textAlign: 'left', marginTop: '1.5rem' },
  code: { display: 'block', padding: '1rem', borderRadius: '0.375rem', background: '#f3f4f6',
    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '200px', overflowY: 'auto', fontSize: '0.875rem' },
  actions: { display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' },
  button: { width: '100%', padding: '0.75rem 1rem', borderRadius: '0.375rem', font: 'inherit',
    fontWeight: 600, cursor: 'pointer', border: '1px solid #6b21a8', background: '#6b21a8', color: '#fff' },
  reload: { background: '#fff', borderColor: '#9ca3af', color: '#374151' },
  help: { marginTop: '1.5rem', fontSize: '0.875rem', color: '#6b7280' },
};

/**
 * Error Boundary - Catches JavaScript errors in child components
 * Must be a class component as React doesn't support error boundaries in hooks
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Store error info for display
    this.setState({ errorInfo });

    // Log error for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Here you could also send to an error tracking service
    // e.g., Sentry.captureException(error, { extra: errorInfo });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          reset: this.handleReset,
          reload: this.handleReload,
        });
      }

      // Native elements and literal CSS keep this independent of the failed provider tree.
      return (
        <main style={fallbackStyles.page}>
          <section style={fallbackStyles.card} aria-labelledby="application-error-heading">
            <h1 id="application-error-heading" style={fallbackStyles.heading}>Something went wrong</h1>
            <p>We're sorry, but something unexpected happened. Please try again or reload the page.</p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div style={fallbackStyles.details}>
                <hr />
                <p><strong>Error Details:</strong></p>
                <code style={fallbackStyles.code}>{this.state.error.toString()}</code>
                {this.state.errorInfo?.componentStack && (
                  <>
                    <p><strong>Component Stack:</strong></p>
                    <code style={fallbackStyles.code}>{this.state.errorInfo.componentStack}</code>
                  </>
                )}
              </div>
            )}
            <div style={fallbackStyles.actions}>
              <button type="button" style={fallbackStyles.button} onClick={this.handleReset}>Try Again</button>
              <button type="button" style={{ ...fallbackStyles.button, ...fallbackStyles.reload }} onClick={this.handleReload}>Reload Page</button>
            </div>
            <p style={fallbackStyles.help}>If this problem persists, please contact support.</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

/**
 * HOC to wrap a component with error boundary
 * @param {React.Component} Component - Component to wrap
 * @param {Function} [fallback] - Optional custom fallback renderer
 * @returns {React.Component} Wrapped component
 */
export function withErrorBoundary(Component, fallback = null) {
  const WrappedComponent = (props) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || 'Component'})`;

  return WrappedComponent;
}

/**
 * Feature-specific error boundary with simpler UI
 * Use this for sections that can fail independently
 */
export class FeatureErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`Error in ${this.props.featureName || 'feature'}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box
          p={6}
          bg="red.50"
          borderRadius="md"
          border="1px solid"
          borderColor="red.200"
          textAlign="center"
        >
          <Text color="red.600" fontWeight="medium">
            {this.props.featureName
              ? `Failed to load ${this.props.featureName}`
              : 'Something went wrong'}
          </Text>
          <Button
            size="sm"
            mt={3}
            colorScheme="red"
            variant="outline"
            onClick={() => this.setState({ hasError: false })}
          >
            Retry
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
