export interface AvatarGradientPreset {
  value: string;
  className: string;
}

export const AVATAR_GRADIENT_PRESETS: AvatarGradientPreset[] = [
  {
    value: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    className: 'avatar-gradient-emerald',
  },
  {
    value: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    className: 'avatar-gradient-blue',
  },
  {
    value: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
    className: 'avatar-gradient-pink',
  },
  {
    value: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    className: 'avatar-gradient-amber',
  },
  {
    value: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    className: 'avatar-gradient-purple',
  },
  {
    value: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
    className: 'avatar-gradient-red',
  },
];

const DEFAULT_AVATAR_CLASS = AVATAR_GRADIENT_PRESETS[0].className;

export function isAvatarGradient(value: string): boolean {
  return value.startsWith('linear-gradient') || value.startsWith('gradient');
}

export function avatarClassNameForValue(value: string): string {
  return AVATAR_GRADIENT_PRESETS.find((preset) => preset.value === value)?.className ?? DEFAULT_AVATAR_CLASS;
}
