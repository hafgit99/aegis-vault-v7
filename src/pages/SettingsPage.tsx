import type { AppNotification } from '../types';
import SettingsPanel from '../components/SettingsPanel';
import { SyncSettingsProvider } from '../components/settings/SyncSettingsContext';

interface SettingsPageProps {
  autoLockDuration: number;
  onDatabaseChanged: () => void | Promise<void>;
  onAutoLockDurationChange: (duration: number) => void;
  onNotify: (notification: AppNotification) => void;
}

export function SettingsPage({
  autoLockDuration,
  onDatabaseChanged,
  onAutoLockDurationChange,
  onNotify,
}: SettingsPageProps) {
  return (
    <div data-testid="settings-workspace" className="flex-1 p-3 sm:p-6 lg:p-8 overflow-y-auto scrollbar-hide safe-bottom">
      <SyncSettingsProvider onDatabaseChanged={onDatabaseChanged}>
        <SettingsPanel
          onDatabaseChanged={onDatabaseChanged}
          autoLockDuration={autoLockDuration}
          onAutoLockDurationChange={onAutoLockDurationChange}
          onNotify={onNotify}
        />
      </SyncSettingsProvider>
    </div>
  );
}
