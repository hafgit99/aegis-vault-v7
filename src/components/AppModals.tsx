import { AppNotification, VaultItem } from '../types';
import ConfirmModal from './ConfirmModal';
import ProfileModal from './ProfileModal';
import VaultFormModal from './VaultFormModal';

export interface AppConfirmConfig {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  isAlert?: boolean;
  onConfirm: () => void;
}

interface AppModalsProps {
  isVaultFormOpen: boolean;
  editingItem: VaultItem | null;
  isProfileOpen: boolean;
  profileAvatar: string;
  profileName: string;
  confirmConfig: AppConfirmConfig;
  onCloseVaultForm: () => void;
  onSaveVaultItem: (item: VaultItem) => void;
  onNotify: (notification: AppNotification) => void;
  onCloseProfile: () => void;
  onSaveProfile: (name: string, avatar: string) => void;
  onCancelConfirm: () => void;
}

export default function AppModals({
  isVaultFormOpen,
  editingItem,
  isProfileOpen,
  profileAvatar,
  profileName,
  confirmConfig,
  onCloseVaultForm,
  onSaveVaultItem,
  onNotify,
  onCloseProfile,
  onSaveProfile,
  onCancelConfirm,
}: AppModalsProps) {
  return (
    <>
      <VaultFormModal
        isOpen={isVaultFormOpen}
        onClose={onCloseVaultForm}
        onSave={onSaveVaultItem}
        editingItem={editingItem}
        onNotify={onNotify}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={onCloseProfile}
        currentAvatar={profileAvatar}
        currentName={profileName}
        onSave={onSaveProfile}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        type={confirmConfig.type}
        confirmText={confirmConfig.confirmText}
        cancelText={confirmConfig.cancelText}
        isAlert={confirmConfig.isAlert}
        onConfirm={confirmConfig.onConfirm}
        onCancel={onCancelConfirm}
      />
    </>
  );
}
