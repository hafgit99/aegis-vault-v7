import { AppConfirmConfig, VaultItem } from '../types';
import { deletePermanently, emptyTrashComplete, moveToTrash, restoreFromTrash } from '../lib/storage';

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
  const deleteItem = (id: string) => {
    openConfirm({
      title: 'Çöp Kutusuna Taşı',
      message:
        'Bu şifre kaydını çöp kutusuna taşımak istediğinize emin misiniz? Çöp kutusundaki veriler 15 gün sonra otomatik olarak temizlenecektir.',
      type: 'warning',
      confirmText: 'Çöpe Taşı',
      cancelText: 'Vazgeç',
      onConfirm: () => {
        const updated = moveToTrash(id);
        setItems(updated);
        resetReveals();
        clearCopiedField();

        const activeRemaining = updated.filter((item) => !item.deleted);
        setSelectedItem(activeRemaining.length > 0 ? activeRemaining[0] : null);
      },
    });
  };

  const emptyTrash = () => {
    openConfirm({
      title: 'Çöp Kutusunu Boşalt',
      message:
        'Çöp kutusundaki TÜM şifreleri tamamen kalıcı olarak silmek istediğinize emin misiniz? Bu işlem asla geri alınamaz!',
      type: 'danger',
      confirmText: 'Sıfırla ve Kalıcı Sil',
      cancelText: 'Vazgeç',
      onConfirm: () => {
        const updated = emptyTrashComplete();
        setItems(updated);
        openConfirm({
          title: 'Çöp Kutusu Boşaltıldı',
          message: 'Çöp kutusundaki tüm şifreler kalıcı olarak silindi.',
          type: 'success',
          isAlert: true,
          onConfirm: () => {},
        });
      },
    });
  };

  const restoreTrashItem = (trashItem: VaultItem) => {
    const updated = restoreFromTrash(trashItem.id);
    setItems(updated);
    openConfirm({
      title: 'Geri Yüklendi',
      message: `"${trashItem.title}" şifre kaydı başarıyla kasaya geri yüklendi!`,
      type: 'success',
      isAlert: true,
      onConfirm: () => {},
    });
  };

  const deleteTrashItemPermanently = (trashItem: VaultItem) => {
    openConfirm({
      title: 'Kalıcı Olarak Sil',
      message: `"${trashItem.title}" kaydını tamamen kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri ALINAMAZ.`,
      type: 'danger',
      confirmText: 'Kalıcı Olarak Sil',
      cancelText: 'Vazgeç',
      onConfirm: () => {
        const updated = deletePermanently(trashItem.id);
        setItems(updated);
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
