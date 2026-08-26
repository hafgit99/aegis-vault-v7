/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, type ReactNode } from 'react';
import { ShieldAlert, Lock } from 'lucide-react';
import { logSecurityEvent, securityEventCodes } from '../lib/securityEvents';

interface ErrorBoundaryProps {
  children: ReactNode;
  onLock?: () => void;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * P2-10: ErrorBoundary for the unlocked vault tree.
 * Prevents a React render/runtime crash from leaving the app in an undefined or
 * white-screen state while unlocked. Catches errors, logs a security event,
 * and securely triggers immediate vault lockout to purge decrypted memory.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[Aegis Vault ErrorBoundary] Caught render error in unlocked tree:', error, errorInfo);

    logSecurityEvent(
      securityEventCodes.securityLegacyCryptoWarning,
      `Unhandled UI runtime crash in unlocked tree: ${error.message || 'unknown error'}`,
      'critical',
      { componentStack: errorInfo.componentStack },
    );

    // Secure fail-closed: immediately lock the vault to clear decrypted state
    if (this.props.onLock) {
      try {
        this.props.onLock();
      } catch (lockErr) {
        console.error('[Aegis Vault ErrorBoundary] Failed to trigger auto-lock on crash:', lockErr);
      }
    }
  }

  handleManualLock = () => {
    if (this.props.onLock) {
      this.props.onLock();
    }
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          data-testid="unlocked-error-boundary-fallback"
          className="min-h-screen w-full bg-[#0a0c0a] text-on-surface flex items-center justify-center p-6 select-none"
        >
          <div className="max-w-md w-full bg-[#121512] border border-red-500/30 rounded-2xl p-6 shadow-2xl space-y-5 text-center">
            <div className="w-12 h-12 mx-auto rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h2 className="text-base font-bold text-on-surface">
                Unexpected Application Error
              </h2>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                A runtime exception occurred in the active view. For your security, decrypted vault memory has been protected and the application should be locked.
              </p>
            </div>

            <button
              type="button"
              onClick={this.handleManualLock}
              className="w-full py-2.5 px-4 bg-brand-primary text-brand-on-primary font-bold text-xs rounded-xl flex items-center justify-center gap-2 hover:brightness-110 active:scale-98 transition-all cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Lock Vault Immediately</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
