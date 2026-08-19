/**
 * @file useSettingsVaultItems.ts
 * @description Owns the shared `items` state and the demo-data reseed / full
 * vault reset actions used across the settings panel. Keeps vault mutation
 * orchestration out of the SettingsPanel component body.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { getVaultItems, reseedDemoData, resetSystem } from '../lib/storage';
import type { VaultItem } from '../types';
import type { AppNotification } from '../types';

interface UseSettingsVaultItemsOptions {
  onDatabaseChanged: () => void | Promise<void>;
  onNotify?: (notification: AppNotification) => void;
}

export function useSettingsVaultItems({
  onDatabaseChanged,
  onNotify,
}: UseSettingsVaultItemsOptions) {
  const { t } = useLanguage();
  const [items, setItems] = useState<VaultItem[]>([]);

  useEffect(() => {
    let isMounted = true;
    getVaultItems().then((loaded) => {
      if (isMounted) {
        setItems(loaded);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const reloadItems = async (): Promise<VaultItem[]> => {
    const latestItems = await getVaultItems();
    setItems(latestItems);
    return latestItems;
  };

  const triggerReseed = () => {
    void (async () => {
      const reseeded = await reseedDemoData();
      setItems(reseeded);
      onDatabaseChanged();
      onNotify?.({
        title: t('settings.demo.loadedTitle'),
        message: t('settings.demo.loadedMessage'),
        type: 'success',
      });
    })();
  };

  const triggerResetAll = () => {
    const confirmation = window.confirm(t('settings.danger.confirm'));
    if (confirmation) {
      void (async () => {
        await resetSystem();
        window.location.reload();
      })();
    }
  };

  return {
    items,
    setItems,
    reloadItems,
    triggerReseed,
    triggerResetAll,
  };
}
