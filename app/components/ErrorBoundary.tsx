"use client";

import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  name?: string;
}

interface State {
  error: Error | null;
  retryCount: number;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[ErrorBoundary${this.props.name ? `: ${this.props.name}` : ""}]`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="flex flex-col items-center justify-center gap-3 h-full px-6"
          style={{ color: "var(--text-muted)" }}
        >
          <p className="text-sm">Something went wrong{this.props.name ? ` in ${this.props.name}` : ""}.</p>
          <button
            onClick={() => this.setState(s => ({ error: null, retryCount: s.retryCount + 1 }))}
            className="text-xs px-3 py-1.5 rounded-lg cursor-pointer"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          >
            Try again
          </button>
        </div>
      );
    }
    return <React.Fragment key={this.state.retryCount}>{this.props.children}</React.Fragment>;
  }
}
