import { useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';

const DEFAULT_PROFILE_AVATAR =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48Y2lyY2xlIGN4PSIzMiIgY3k9IjMyIiByPSIzMCIgZmlsbD0iIzRmNDZlNSIvPjxjaXJjbGUgY3g9IjMyIiBjeT0iMjIiIHI9IjEwIiBmaWxsPSIjZmZmZmZmIi8+PHBhdGggZD0iTTE0IDUwYzAtMTAgOC0xOCAxOC0xOHMxOCA4IDE4IDE4SDE0eiIgZmlsbD0iI2ZmZmZmZiIvPjwvc3ZnPg==';

interface UseProfileSettingsOptions {
  onSaved?: () => void;
}

export function useProfileSettings({ onSaved }: UseProfileSettingsOptions = {}) {
  const { t } = useLanguage();
  const [profileName, setProfileName] = useState(() => {
    return localStorage.getItem('profile_name') || '';
  });
  const [profileAvatar, setProfileAvatar] = useState(() => {
    return localStorage.getItem('profile_avatar') || DEFAULT_PROFILE_AVATAR;
  });
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const openProfile = () => {
    setIsProfileModalOpen(true);
  };

  const closeProfile = () => {
    setIsProfileModalOpen(false);
  };

  const saveProfile = (name: string, avatar: string) => {
    localStorage.setItem('profile_name', name);
    localStorage.setItem('profile_avatar', avatar);
    setProfileName(name);
    setProfileAvatar(avatar);
    onSaved?.();
  };

  return {
    profileName: profileName || t('profile.defaultName'),
    profileAvatar,
    isProfileModalOpen,
    openProfile,
    closeProfile,
    saveProfile,
  };
}
