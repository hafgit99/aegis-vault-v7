/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

declare global {
  interface Window {
    AegisAndroidSecurity?: {
      getPosture(): string;
    };
  }
}

export type AndroidRuntimeSecuritySignal =
  | 'app_debuggable'
  | 'debugger_attached'
  | 'test_keys'
  | 'root_artifact'
  | 'instrumentation';

export interface AndroidRuntimeSecurityPosture {
  releaseBuild: boolean;
  appDebuggable: boolean;
  debuggerAttached: boolean;
  riskDetected: boolean;
  mode: 'warning-only';
  signals: AndroidRuntimeSecuritySignal[];
}

const supportedSignals = new Set<AndroidRuntimeSecuritySignal>([
  'app_debuggable',
  'debugger_attached',
  'test_keys',
  'root_artifact',
  'instrumentation',
]);

export function parseAndroidRuntimeSecurityPosture(payload: string | null): AndroidRuntimeSecurityPosture | null {
  if (!payload) return null;

  try {
    const value = JSON.parse(payload) as Partial<AndroidRuntimeSecurityPosture>;
    if (!value || typeof value !== 'object') return null;
    if (typeof value.releaseBuild !== 'boolean') return null;
    if (typeof value.appDebuggable !== 'boolean') return null;
    if (typeof value.debuggerAttached !== 'boolean') return null;
    if (typeof value.riskDetected !== 'boolean') return null;
    if (value.mode !== 'warning-only') return null;
    if (!Array.isArray(value.signals) || !value.signals.every((signal) => supportedSignals.has(signal))) return null;
    if (value.riskDetected && (!value.releaseBuild || value.signals.length === 0)) return null;

    return value as AndroidRuntimeSecurityPosture;
  } catch {
    return null;
  }
}

export function getAndroidRuntimeSecurityPosture(): AndroidRuntimeSecurityPosture | null {
  if (typeof window === 'undefined' || !window.AegisAndroidSecurity) return null;

  try {
    return parseAndroidRuntimeSecurityPosture(window.AegisAndroidSecurity.getPosture());
  } catch {
    return null;
  }
}