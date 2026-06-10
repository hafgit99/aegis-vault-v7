import { useCallback, useState } from 'react';

import { AppConfirmConfig, AppNotification } from '../types';

type OpenConfirmConfig = Omit<AppConfirmConfig, 'isOpen'>;

const initialConfirmConfig: AppConfirmConfig = {
  isOpen: false,
  title: '',
  message: '',
  type: 'info',
  onConfirm: () => {},
};

export function useConfirmModal() {
  const [confirmConfig, setConfirmConfig] = useState<AppConfirmConfig>(initialConfirmConfig);

  const openConfirm = useCallback((config: OpenConfirmConfig) => {
    setConfirmConfig({
      ...config,
      isOpen: true,
    });
  }, []);

  const showNotification = useCallback((notification: AppNotification) => {
    setConfirmConfig({
      isOpen: true,
      title: notification.title,
      message: notification.message,
      type: notification.type || 'info',
      isAlert: true,
      onConfirm: () => {},
    });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmConfig((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return {
    confirmConfig,
    openConfirm,
    showNotification,
    closeConfirm,
  };
}
