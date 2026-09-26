import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import {LanguageProvider} from './i18n/LanguageContext';
import {ThemeProvider} from './context/ThemeContext';
import {installAirgapNetworkPolicy} from './lib/airgapNetworkPolicy';
import {logSecurityEvent, securityEventCodes} from './lib/securityEvents';

function registerCspViolationTelemetry(): void {
  if (typeof document === 'undefined') return;

  document.addEventListener('securitypolicyviolation', (e: SecurityPolicyViolationEvent) => {
    logSecurityEvent(
      securityEventCodes.cspViolation,
      `CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || 'inline resource'}`,
      'warning',
      {
        violatedDirective: e.violatedDirective,
        blockedURI: e.blockedURI,
        sourceFile: e.sourceFile,
        lineNumber: e.lineNumber,
        columnNumber: e.columnNumber,
      },
    );
  });
}

registerCspViolationTelemetry();

function revealNativeWindowAfterFirstPaint(): void {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;

  requestAnimationFrame(() => {
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().show())
      .catch(() => {
        // Keep the web UI usable if the native window bridge is unavailable.
      });
  });
}

if (import.meta.env.PROD) {
  installAirgapNetworkPolicy();
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Fatal: #root mount element is missing from the document.');
}

const root = createRoot(rootElement);

requestAnimationFrame(() => {
  revealNativeWindowAfterFirstPaint();

  // O-32: a failed lazy-chunk load (corrupt deploy, stale cache, blocked
  // asset) must never leave the visitor on the splash forever — surface a
  // fatal-error screen with an explicit recovery path instead.
  import('./App.tsx')
    .then(({ default: App }) => {
      root.render(
        <StrictMode>
          <LanguageProvider>
            <ThemeProvider>
              <App />
            </ThemeProvider>
          </LanguageProvider>
        </StrictMode>,
      );
    })
    .catch((err: unknown) => {
      console.error('Fatal: failed to load the application bundle.', err);
      logSecurityEvent(
        securityEventCodes.appBundleLoadFailed,
        'Fatal: the lazily loaded application bundle failed to load.',
        'critical',
        { reason: err instanceof Error ? err.message : String(err) },
      );
      root.render(
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-200">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-2xl">
              ⚠
            </div>
            <h1 className="text-lg font-semibold text-slate-100">
              Application failed to load
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              A bundle integrity or network error prevented AegisVault from
              starting. Your vault data remains safely stored on this device.
            </p>
            <button
              type="button"
              className="mt-8 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
              onClick={() => window.location.reload()}
            >
              Reload application
            </button>
          </div>
        </div>,
      );
    });
});
