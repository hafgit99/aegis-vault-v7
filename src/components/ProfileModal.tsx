import React, { useState, useRef } from 'react';
import { X, Upload, User, Image as ImageIcon, Check } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatar: string;
  currentName: string;
  onSave: (name: string, avatar: string) => void;
}

// Some beautiful default gradient presets
const PRESET_AVATARS = [
  'linear-gradient(135deg, #10b981 0%, #059669 100%)', // Brand Emerald
  'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', // Blue
  'linear-gradient(135deg, #ec4899 0%, #be185d 100%)', // Pink
  'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', // Amber
  'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', // Purple
  'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', // Red
];

// Helper to determine if an avatar string is a gradient or an image URL
export function isGradient(avatar: string): boolean {
  return avatar.startsWith('linear-gradient') || avatar.startsWith('gradient');
}

export default function ProfileModal({
  isOpen,
  onClose,
  currentAvatar,
  currentName,
  onSave,
}: ProfileModalProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(currentName);
  const [avatar, setAvatar] = useState(currentAvatar);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle local image file uploading and reading as base64 data URL
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError(t('profile.error.largeImage'));
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError(t('profile.error.invalidImage'));
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatar(reader.result);
      }
    };
    reader.onerror = () => {
      setError(t('profile.error.readImage'));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('profile.error.invalidName'));
      return;
    }
    onSave(name.trim(), avatar);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="w-full max-w-md bg-surface-lowest border border-outline-variant/15 rounded-2xl shadow-2xl relative overflow-hidden">
        {/* Top visual style */}
        <div className="h-2 bg-brand-primary w-full" />
        
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-on-surface-variant hover:text-on-surface p-1.5 hover:bg-surface-high rounded-lg transition-all cursor-pointer z-10"
          title={t('profile.close')}
        >
          <X className="w-5 h-5" />
        </button>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-1">
            <h3 className="font-display text-lg font-bold text-on-surface">{t('profile.title')}</h3>
            <p className="text-on-surface-variant text-[11px]">
              {t('profile.description')}
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Profile Picture Display and Selection */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              {isGradient(avatar) ? (
                <div
                  style={{ background: avatar }}
                  className="w-24 h-24 rounded-full border-2 border-brand-primary flex items-center justify-center text-white text-3xl font-bold font-display shadow-lg select-none"
                >
                  {name ? name.charAt(0).toUpperCase() : 'A'}
                </div>
              ) : (
                <img
                  src={avatar}
                  alt={t('profile.avatarAlt')}
                  referrerPolicy="no-referrer"
                  className="w-24 h-24 rounded-full border-2 border-brand-primary object-cover shadow-lg"
                />
              )}
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-1.5 bg-brand-primary text-brand-on-primary rounded-full hover:scale-110 active:scale-95 transition-all shadow-md cursor-pointer border border-surface-lowest"
                title={t('profile.uploadTitle')}
              >
                <Upload className="w-4 h-4" />
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-bold text-brand-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{t('profile.uploadDevice')}</span>
            </button>
          </div>

          {/* Preset Gradients */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">
              {t('profile.colorLabel')}
            </label>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {PRESET_AVATARS.map((gradient, idx) => {
                const isActive = avatar === gradient;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setError(null);
                      setAvatar(gradient);
                    }}
                    style={{ background: gradient }}
                    className={`w-10 h-10 rounded-full cursor-pointer hover:scale-110 transition-transform flex items-center justify-center border-2 ${
                      isActive ? 'border-brand-primary scale-110' : 'border-transparent'
                    }`}
                  >
                    {isActive && <Check className="w-4 h-4 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Display Name Input */}
          <div className="space-y-2">
            <label htmlFor="profile-name-input" className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">
              {t('profile.nameLabel')}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 w-4 h-4 text-on-surface-variant/50" />
              <input
                id="profile-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                placeholder={t('profile.namePlaceholder')}
                className="w-full bg-[#161816] hover:bg-[#1c1e1c] focus:bg-[#1e201e] border border-outline-variant/25 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface font-semibold"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-outline-variant/15 bg-surface-high hover:bg-[#202220] font-bold text-xs text-on-surface hover:text-brand-primary active:scale-95 transition-all cursor-pointer"
            >
              {t('profile.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-brand-primary hover:bg-brand-primary/90 text-brand-on-primary font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer shadow-md"
            >
              {t('profile.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
