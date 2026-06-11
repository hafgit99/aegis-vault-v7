export const supportedLanguages = ['tr', 'en', 'zh'] as const;

export type LanguageCode = (typeof supportedLanguages)[number];

export const languageLabels: Record<LanguageCode, string> = {
  tr: 'Türkçe',
  en: 'English',
  zh: '中文',
};

export const defaultLanguage: LanguageCode = 'tr';

export const languageStorageKey = 'aegis-vault-language';

export const translations = {
  tr: {
    'nav.localFirst': 'Local-First Secure',
    'nav.vault': 'Kasa (Vault)',
    'nav.audit': 'Güvenlik Analizi',
    'nav.generator': 'Şifre Üretici',
    'nav.settings': 'Ayarlar',
    'nav.trash': 'Çöp Kutusu',
    'nav.systemHealth': 'System Health',
    'nav.lockVault': 'Kilitli (Lock Vault)',
    'top.searchPlaceholder': 'Vault içinde ara...',
    'settings.title': 'Kasa Ayarları',
    'settings.subtitle': 'Kilit sürelerinizi, askeri şifreli yedeklerinizi ve çoklu aktarımları bu panelden yönetin.',
    'settings.language.title': 'Dil ve Bölge',
    'settings.language.description': 'Uygulama arayüz dilini seçin. Tercihiniz bu cihazda kalıcı olarak saklanır.',
    'settings.language.label': 'Arayüz Dili',
    'settings.language.tr': 'Türkçe',
    'settings.language.en': 'İngilizce',
    'settings.language.zh': 'Çince',
  },
  en: {
    'nav.localFirst': 'Local-First Secure',
    'nav.vault': 'Vault',
    'nav.audit': 'Security Audit',
    'nav.generator': 'Password Generator',
    'nav.settings': 'Settings',
    'nav.trash': 'Trash',
    'nav.systemHealth': 'System Health',
    'nav.lockVault': 'Lock Vault',
    'top.searchPlaceholder': 'Search inside vault...',
    'settings.title': 'Vault Settings',
    'settings.subtitle': 'Manage lock timing, encrypted backups, and multi-format imports from this panel.',
    'settings.language.title': 'Language and Region',
    'settings.language.description': 'Choose the application interface language. Your preference is stored on this device.',
    'settings.language.label': 'Interface Language',
    'settings.language.tr': 'Turkish',
    'settings.language.en': 'English',
    'settings.language.zh': 'Chinese',
  },
  zh: {
    'nav.localFirst': '本地优先安全',
    'nav.vault': '保险库',
    'nav.audit': '安全审计',
    'nav.generator': '密码生成器',
    'nav.settings': '设置',
    'nav.trash': '回收站',
    'nav.systemHealth': '系统状态',
    'nav.lockVault': '锁定保险库',
    'top.searchPlaceholder': '在保险库中搜索...',
    'settings.title': '保险库设置',
    'settings.subtitle': '在此面板中管理锁定时间、加密备份和多格式导入。',
    'settings.language.title': '语言和地区',
    'settings.language.description': '选择应用界面语言。您的偏好会保存在此设备上。',
    'settings.language.label': '界面语言',
    'settings.language.tr': '土耳其语',
    'settings.language.en': '英语',
    'settings.language.zh': '中文',
  },
} as const;

export type TranslationKey = keyof typeof translations.tr;
