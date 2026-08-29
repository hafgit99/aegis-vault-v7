import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import {
  useTagLibrary,
  useVaultFolders,
  useSmartFolders,
} from './useOrganisation';
import type { VaultItem } from '../types';

/**
 * Aggregates the vault organisation surface: tag library, folder tree,
 * smart folders, bulk selection and the currently selected folder /
 * smart folder ids, including the create/delete confirmation handlers.
 */
export function useVaultOrganisation(items: VaultItem[]) {
  const { t } = useLanguage();

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [activeSmartFolderId, setActiveSmartFolderId] = useState<string | null>(null);

  const { tags, createTag, updateTag, deleteTag } = useTagLibrary();
  const { folders, createFolder, deleteFolder } = useVaultFolders();
  const { smartFolders, createSmartFolder, deleteSmartFolder, counts: smartFolderCounts } = useSmartFolders(items);
  const handleCreateFolder = (parentId: string | null) => {
    const name = window.prompt(t('folders.createPrompt') || 'New folder name:');
    if (name && name.trim()) {
      createFolder({ name: name.trim(), parentId });
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    if (window.confirm(t('confirm.defaultConfirm') || 'Are you sure?')) {
      deleteFolder(folderId);
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
    }
  };

  return {
    tags,
    createTag,
    updateTag,
    deleteTag,
    folders,
    smartFolders,
    smartFolderCounts,
    createSmartFolder,
    deleteSmartFolder,
    selectedFolderId,
    setSelectedFolderId,
    activeSmartFolderId,
    setActiveSmartFolderId,
    handleCreateFolder,
    handleDeleteFolder,
  };
}
