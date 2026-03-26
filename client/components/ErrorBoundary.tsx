'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center">
            <h2 className="text-red-800 font-semibold mb-2">Something went wrong</h2>
            <p className="text-red-600 text-sm">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="btn-primary mt-4"
            >
              Try again
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
