const TRASH_RETENTION_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

const PLATFORM_LOGOS = {
  github:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDfVLUjhqYP7nUa4eCqDYzKwPibJiJkTQnZwGERtZEt0kOneuAOYNW78pzFWXziZJG0HF_vmXJDRQn8KfbWA7G0_Uj6V4nvR215U6cG_L1rLzncemyFWMjTGG89aZxZt3VuIjMKsmtMpnvqc5iyyXQkg_R9Ecxhwd60FcpiFpeOM2wXD0rOYMfTz3_CoYbLxFSNxiucs5HYXIaNZB2EsA46Jo69MrjtHM7HUG0OeBrJXb-DKHADGTrTr28Iv81Jnpdtwg9IVI18XuKq',
  google:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCKWnh8NuDTiB8vbPvoaLePQzjGtDZ6OWa3AwuoekNwym1hE_Txm_xvigIWWouJctKjWezcRM_lLNmzV4-v628GM_0QuwtmIeM5251TE7ihLroSxezm7bXlt7Y93zqGEmn-NuXf8TezDqtyGp-yelcD1qKVqQaBQf2132Yberh5jT4ZbCULapQCQ5ycTy9buEeCJ9DA7ahTpg0bl7ku6qzkdTup36ty9XBgsFeT5-QpvaEnbR4GjXf6_P5RtP7CC17SZBL97gI7mD3-',
  chase:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuD6Q53OHpe_lUiwoVm9J9BYnvc2l24B2lquFtwp2aEDyJpSmfTbP3TCwoSHEtbjyuxirj4zlzN5y1vm1ONZ2IC3G0Gc7uI7a0nQYo2gBFFVH9xwE9w27TQpWHyiFTe4Ct54c6HYuUl3SAzQwPm4kA3mn69IkLbc76JPX0VwjWk7-3_xHYwejj-sOTt0I7gkJ6UxVkRZLWMjmk14OeRaxZaTDWKiysbF7PW-xyK6fSXhgHCeiJv5dwMal_VKLQamGEIMa9RU2GqW7ZJz',
  spotify:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDun4IlYsiiHy7wgY5-1el8XAF_aiTuom2CObk-n4-vdMDBMECh7Rg2kEeQeWcyZREveF_LhkGxApCcKY934v9Qqq1VO3UwktV2R7cunAtkY_zNUNw95OqUKqoUDmg6j4DceJWwHUKGSgnxNp0JMSP90tYeXSjdGqPpkWAIoB3Dvq0AxpDgyWONeV_WVqcIz-BPmyiR9G_dFcY4K2RMXVotX0P2rxrW3N0gjoxWmTwnWFSd7VdK0R6hx3IZoR6osfURmTw9hfip35U6',
} as const;

export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';

  const unit = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(unit)), sizes.length - 1);
  const value = bytes / Math.pow(unit, index);

  return `${parseFloat(value.toFixed(2))} ${sizes[index]}`;
}

export function getTrashRemainingDays(deletedAt?: string, nowMs = Date.now()): number {
  if (!deletedAt) return TRASH_RETENTION_DAYS;

  const deletedTime = new Date(deletedAt).getTime();
  if (Number.isNaN(deletedTime)) return TRASH_RETENTION_DAYS;

  const elapsedDays = (nowMs - deletedTime) / DAY_MS;
  const remainingDays = Math.ceil(TRASH_RETENTION_DAYS - elapsedDays);

  return Math.max(0, Math.min(TRASH_RETENTION_DAYS, remainingDays));
}

export function getLogoForPlatform(title: string, url: string): string | null {
  const normTitle = title.toLowerCase();
  const normUrl = url.toLowerCase();

  if (normTitle.includes('github') || normUrl.includes('github')) {
    return PLATFORM_LOGOS.github;
  }
  if (normTitle.includes('google') || normUrl.includes('google') || normUrl.includes('workspace')) {
    return PLATFORM_LOGOS.google;
  }
  if (normTitle.includes('chase') || normUrl.includes('chase')) {
    return PLATFORM_LOGOS.chase;
  }
  if (normTitle.includes('spotify') || normUrl.includes('spotify')) {
    return PLATFORM_LOGOS.spotify;
  }

  return null;
}
