import { useMemo } from 'react';

import { calculatePasswordScore } from '../lib/security';
import type { VaultItem } from '../types';

export function useSelectedItemScore(selectedItem: VaultItem | null) {
  return useMemo(() => {
    return selectedItem ? calculatePasswordScore(selectedItem.password || '') : 0;
  }, [selectedItem]);
}
