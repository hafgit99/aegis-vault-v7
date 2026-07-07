import { AppConfirmConfig, AppNotification, TagDefinition, VaultFolder, VaultItem } from '../types';
import ConfirmModal from './ConfirmModal';
import ProfileModal from './ProfileModal';
import VaultFormModal from './VaultFormModal';

interface AppModalsProps {
  isVaultFormOpen: boolean;
  editingItem: VaultItem | null;
  isProfileOpen: boolean;
  profileAvatar: string;
  profileName: string;
  confirmConfig: AppConfirmConfig;
  onCloseVaultForm: () => void;
  onSaveVaultItem: (item: VaultItem) => void | Promise<void>;
  onNotify: (notification: AppNotification) => void;
  onCloseProfile: () => void;
  onSaveProfile: (name: string, avatar: string) => void;
  onCancelConfirm: () => void;
  folders: VaultFolder[];
  tags: TagDefinition[];
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
  folders,
  tags,
}: AppModalsProps) {
  return (
    <>
      <VaultFormModal
        isOpen={isVaultFormOpen}
        onClose={onCloseVaultForm}
        onSave={onSaveVaultItem}
        editingItem={editingItem}
        onNotify={onNotify}
        folders={folders}
        tags={tags}
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
