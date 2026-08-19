import { Palette, Check } from 'lucide-react';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';

export function SettingsThemeCard() {
  const { themePalette, setThemePalette } = useTheme();
  const { t } = useLanguage();

  const palettes: { key: ThemePalette; colorClass: string; nameKey: string }[] = [
    { key: 'emerald', colorClass: 'bg-emerald-500 border-emerald-400', nameKey: 'settings.theme.paletteEmerald' },
    { key: 'blue', colorClass: 'bg-sky-500 border-sky-400', nameKey: 'settings.theme.paletteBlue' },
    { key: 'purple', colorClass: 'bg-purple-500 border-purple-400', nameKey: 'settings.theme.palettePurple' },
    { key: 'orange', colorClass: 'bg-orange-500 border-orange-400', nameKey: 'settings.theme.paletteOrange' },
    { key: 'red', colorClass: 'bg-red-500 border-red-400', nameKey: 'settings.theme.paletteRed' },
  ];

  return (
    <section
      data-testid="theme-settings-card"
      className="glass-panel p-4 sm:p-6 rounded-2xl border border-outline-variant/10 space-y-4 sm:space-y-6"
    >
      <div className="space-y-1.5">
        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
          <Palette className="w-4 h-4 text-brand-primary" />
          <span>{t('settings.theme.title')}</span>
        </h3>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          {t('settings.theme.description')}
        </p>
      </div>

      <div className="space-y-2">
        <span className="block text-[10px] font-bold text-on-surface-variant/85 uppercase tracking-wide">
          {t('settings.theme.paletteLabel')}
        </span>
        <div className="flex flex-wrap items-center gap-3 py-1.5">
          {palettes.map((palette) => {
            const isActive = themePalette === palette.key;
            return (
              <button
                key={palette.key}
                type="button"
                data-testid={`theme-palette-${palette.key}`}
                onClick={() => setThemePalette(palette.key)}
                title={t(palette.nameKey as any)}
                className={`w-8 h-8 rounded-full cursor-pointer flex items-center justify-center border-2 transition-all relative hover:scale-110 active:scale-95 ${palette.colorClass} ${
                  isActive
                    ? 'ring-2 ring-brand-primary ring-offset-2 ring-offset-surface-low scale-105 border-white'
                    : 'border-transparent opacity-80 hover:opacity-100'
                }`}
              >
                {isActive && <Check className="w-4 h-4 text-white drop-shadow-md" />}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
