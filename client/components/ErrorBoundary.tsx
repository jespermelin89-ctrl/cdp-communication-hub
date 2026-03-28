'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
          <div className="min-h-[200px] flex items-center justify-center p-8">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 text-center max-w-sm w-full">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={22} className="text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-red-800 dark:text-red-200 font-semibold mb-1">Något gick fel</h2>
              {this.state.error?.message && (
                <p className="text-red-600 dark:text-red-300 text-sm mb-4 break-words">
                  {this.state.error.message}
                </p>
              )}
              <button
                onClick={() => this.setState({ hasError: false })}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <RefreshCw size={14} />
                Försök igen
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
