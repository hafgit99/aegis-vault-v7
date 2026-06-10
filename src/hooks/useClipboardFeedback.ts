import { useCallback, useRef, useState } from 'react';

export function useClipboardFeedback(resetDelayMs = 2000) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCopiedField = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setCopiedField(null);
  }, []);

  const copyText = useCallback(
    (text: string, fieldName: string) => {
      void navigator.clipboard.writeText(text);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setCopiedField(fieldName);
      timeoutRef.current = setTimeout(() => {
        setCopiedField(null);
        timeoutRef.current = null;
      }, resetDelayMs);
    },
    [resetDelayMs],
  );

  return {
    copiedField,
    copyText,
    clearCopiedField,
  };
}
