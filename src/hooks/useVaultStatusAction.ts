import { AppConfirmConfig } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

type OpenConfirm = (config: Omit<AppConfirmConfig, 'isOpen'>) => void;

interface UseVaultStatusActionOptions {
  openConfirm: OpenConfirm;
}

export function useVaultStatusAction({ openConfirm }: UseVaultStatusActionOptions) {
  const { t } = useLanguage();

  const openVaultStatus = () => {
    openConfirm({
      title: t('vaultStatus.title'),
      message: t('vaultStatus.message'),
      type: 'success',
      isAlert: true,
      onConfirm: () => {},
    });
  };

  return {
    openVaultStatus,
  };
}
