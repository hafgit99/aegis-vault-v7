import { Plus } from 'lucide-react';

import { ActiveTab } from '../types';

interface FloatingVaultActionProps {
  activeTab: ActiveTab;
  isDetailOpenOnMobile: boolean;
  onNewItem: () => void;
}

export default function FloatingVaultAction({
  activeTab,
  isDetailOpenOnMobile,
  onNewItem,
}: FloatingVaultActionProps) {
  if (activeTab !== 'vault' || isDetailOpenOnMobile) return null;

  return (
    <button
      onClick={onNewItem}
      className="lg:bottom-8 lg:right-8 bottom-6 right-6 fixed w-14 h-14 bg-brand-primary text-brand-on-primary rounded-full shadow-2xl flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all group z-40 hover:brightness-110"
      title="Yeni Şifre Ekle"
    >
      <Plus className="w-8 h-8 text-brand-on-primary transition-transform group-hover:rotate-90" />
    </button>
  );
}
