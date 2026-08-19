import type { AppConfirmConfig, VaultItem } from '../types';
import { deletePermanently, emptyTrashComplete, moveToTrash, restoreFromTrash } from '../lib/storage';
import { useLanguage } from '../i18n/LanguageContext';

type OpenConfirm = (config: Omit<AppConfirmConfig, 'isOpen'>) => void;

interface UseTrashActionsOptions {
  openConfirm: OpenConfirm;
  setItems: (items: VaultItem[]) => void;
  setSelectedItem: (item: VaultItem | null) => void;
  resetReveals: () => void;
  clearCopiedField: () => void;
}

export function useTrashActions({
  openConfirm,
  setItems,
  setSelectedItem,
  resetReveals,
  clearCopiedField,
}: UseTrashActionsOptions) {
  const { t } = useLanguage();

  const deleteItem = (id: string) => {
    openConfirm({
      title: t('trash.action.moveTitle'),
      message: t('trash.action.moveMessage'),
      type: 'warning',
      confirmText: t('trash.action.moveConfirm'),
      cancelText: t('confirm.defaultCancel'),
      onConfirm: () => {
        void (async () => {
          const updated = await moveToTrash(id);
          setItems(updated);
          resetReveals();
          clearCopiedField();

          const activeRemaining = updated.filter((item) => !item.deleted);
          setSelectedItem(activeRemaining.length > 0 ? activeRemaining[0]! : null);
        })();
      },
    });
  };

  const emptyTrash = () => {
    openConfirm({
      title: t('trash.action.emptyTitle'),
      message: t('trash.action.emptyMessage'),
      type: 'danger',
      confirmText: t('trash.action.emptyConfirm'),
      cancelText: t('confirm.defaultCancel'),
      onConfirm: () => {
        void (async () => {
          const updated = await emptyTrashComplete();
          setItems(updated);
          openConfirm({
            title: t('trash.action.emptySuccessTitle'),
            message: t('trash.action.emptySuccessMessage'),
            type: 'success',
            isAlert: true,
            onConfirm: () => {},
          });
        })();
      },
    });
  };

  const restoreTrashItem = (trashItem: VaultItem) => {
    void (async () => {
      const updated = await restoreFromTrash(trashItem.id);
      setItems(updated);
      openConfirm({
        title: t('trash.action.restoreSuccessTitle'),
        message: `${t('trash.action.restoreSuccessPrefix')}${trashItem.title}${t('trash.action.restoreSuccessSuffix')}`,
        type: 'success',
        isAlert: true,
        onConfirm: () => {},
      });
    })();
  };

  const deleteTrashItemPermanently = (trashItem: VaultItem) => {
    openConfirm({
      title: t('trash.action.permanentTitle'),
      message: `${t('trash.action.permanentMessagePrefix')}${trashItem.title}${t('trash.action.permanentMessageSuffix')}`,
      type: 'danger',
      confirmText: t('trash.action.permanentConfirm'),
      cancelText: t('confirm.defaultCancel'),
      onConfirm: () => {
        void (async () => {
          const updated = await deletePermanently(trashItem.id);
          setItems(updated);
        })();
      },
    });
  };

  return {
    deleteItem,
    emptyTrash,
    restoreTrashItem,
    deleteTrashItemPermanently,
  };
}
