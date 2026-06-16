export const extensionTranslations = {
  tr: {
    'locked.title': 'Aegis Vault Kilitli',
    'locked.description': 'Kasanızın kilidini açmak için lütfen masaüstü uygulamasını kullanın.',
    'btn.openApp': 'Masaüstü Uygulamasını Aç',
    'search.placeholder': 'Kasa içinde ara...',
    'copied.feedback': 'Kopyalandı!',
    'no.matching': 'Eşleşen kayıt bulunamadı.',
    'dev.localhost': 'Geliştirici ortamı aktif.',
    'item.totp': 'TOTP Kodu',
    'item.username': 'Kullanıcı Adı',
    'item.password': 'Şifre',
    'item.cardNumber': 'Kart Numarası',
    'phishing.warning': '⚠️ Dikkat: Oltalama (Phishing) Şüphesi! Alan adını kontrol edin.',
  },
  en: {
    'locked.title': 'Aegis Vault Locked',
    'locked.description': 'Please use the desktop application to unlock your vault.',
    'btn.openApp': 'Open Desktop App',
    'search.placeholder': 'Search vault...',
    'copied.feedback': 'Copied!',
    'no.matching': 'No matching records found.',
    'dev.localhost': 'Developer environment active.',
    'item.totp': 'TOTP Code',
    'item.username': 'Username',
    'item.password': 'Password',
    'item.cardNumber': 'Card Number',
    'phishing.warning': '⚠️ Warning: Suspected Phishing! Check the domain name.',
  },
  zh: {
    'locked.title': 'Aegis Vault 已锁定',
    'locked.description': '请使用桌面应用解锁您的保险库。',
    'btn.openApp': '打开桌面客户端',
    'search.placeholder': '在保管库中搜索...',
    'copied.feedback': '已复制！',
    'no.matching': '未找到匹配的记录。',
    'dev.localhost': '开发环境已激活。',
    'item.totp': '双重认证码',
    'item.username': '用户名',
    'item.password': '密码',
    'item.cardNumber': '卡号',
    'phishing.warning': '⚠️ 警告：疑似钓鱼网站！请核对域名。',
  }
};

export type ExtensionLanguage = 'tr' | 'en' | 'zh';

export function getPreferredLanguage(): ExtensionLanguage {
  const saved = localStorage.getItem('aegis-extension-language') as ExtensionLanguage;
  if (saved && ['tr', 'en', 'zh'].includes(saved)) {
    return saved;
  }
  
  const browserLang = navigator.language.substring(0, 2);
  if (browserLang === 'zh') return 'zh';
  if (browserLang === 'tr') return 'tr';
  return 'en';
}

export function savePreferredLanguage(lang: ExtensionLanguage): void {
  localStorage.setItem('aegis-extension-language', lang);
}

export function translate(key: keyof typeof extensionTranslations['en'], lang?: ExtensionLanguage): string {
  const currentLang = lang || getPreferredLanguage();
  return extensionTranslations[currentLang][key] || extensionTranslations['en'][key] || key;
}
