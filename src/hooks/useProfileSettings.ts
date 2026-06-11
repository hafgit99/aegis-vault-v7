import { useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';

const DEFAULT_PROFILE_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCH67zv7w_c2Gt3Yi8tRFwGe5bb7gJZYlMCHpd55hfAikMyKhRLMtmZTlLWl678ehHejkJGx6MqpODYIBZua1auVdcHjT8vVlOiB0MPntKW2JQY4zFA_AzO8WJNfo1LML8kIr6t1YRAjbi4Y6uFpdk-C5fT4KUYAP_OtMbO1qFJoVDdIJ5p6VgH-7vQiiqT51yHfwKBOgGFA1tyoib-DmocRb4Rabo1ZRHBLIDouFbA7votkCi_xxvrHSVHOj11xZHDnTpBaauKm7Ui';

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
