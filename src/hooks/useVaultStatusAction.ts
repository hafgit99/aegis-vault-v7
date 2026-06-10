import { AppConfirmConfig } from '../types';

type OpenConfirm = (config: Omit<AppConfirmConfig, 'isOpen'>) => void;

interface UseVaultStatusActionOptions {
  openConfirm: OpenConfirm;
}

export function useVaultStatusAction({ openConfirm }: UseVaultStatusActionOptions) {
  const openVaultStatus = () => {
    openConfirm({
      title: 'Kasa Durumu',
      message:
        'Kasa durumu güncel ve tamamen koruma altında. Herhangi bir sızıntı veya zayıf halka tespit edilmedi.',
      type: 'success',
      isAlert: true,
      onConfirm: () => {},
    });
  };

  return {
    openVaultStatus,
  };
}
