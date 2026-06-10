import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearClipboardIfUnchanged,
  DEFAULT_CLIPBOARD_CLEAR_DELAY_MS,
  writeClipboardText,
} from '../lib/clipboard';

export function useClipboardFeedback(
  resetDelayMs = 2000,
  clearDelayMs = DEFAULT_CLIPBOARD_CLEAR_DELAY_MS,
) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCopiedTextRef = useRef<string | null>(null);

  const clearFeedbackTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearClipboardTimer = useCallback(() => {
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }
  }, []);

  const clearLastClipboardValue = useCallback(() => {
    const lastCopiedText = lastCopiedTextRef.current;
    lastCopiedTextRef.current = null;
    if (lastCopiedText) {
      void clearClipboardIfUnchanged(lastCopiedText);
    }
  }, []);

  const clearCopiedField = useCallback(() => {
    clearFeedbackTimer();
    clearClipboardTimer();
    clearLastClipboardValue();
    setCopiedField(null);
  }, [clearClipboardTimer, clearFeedbackTimer, clearLastClipboardValue]);

  const copyText = useCallback(
    (text: string, fieldName: string) => {
      void writeClipboardText(text);
      clearFeedbackTimer();
      clearClipboardTimer();
      lastCopiedTextRef.current = text;
      setCopiedField(fieldName);
      timeoutRef.current = setTimeout(() => {
        setCopiedField(null);
        timeoutRef.current = null;
      }, resetDelayMs);

      clearTimeoutRef.current = setTimeout(() => {
        clearLastClipboardValue();
        clearTimeoutRef.current = null;
      }, clearDelayMs);
    },
    [clearClipboardTimer, clearDelayMs, clearFeedbackTimer, clearLastClipboardValue, resetDelayMs],
  );

  useEffect(
    () => () => {
      clearFeedbackTimer();
      clearClipboardTimer();
      clearLastClipboardValue();
    },
    [clearClipboardTimer, clearFeedbackTimer, clearLastClipboardValue],
  );

  return {
    copiedField,
    copyText,
    clearCopiedField,
  };
}
