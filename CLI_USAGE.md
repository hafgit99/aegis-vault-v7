# AegisVault v7 — Aegis CLI Kullanım Kılavuzu (`aegis-cli`)

`aegis-cli`, AegisVault v7 ekosisteminde geliştiriciler, sistem yöneticileri ve DevOps mühendisleri için tasarlanmış güvenli bir komut satırı aracıdır.

---

## 🚀 Hızlı Başlangıç

Proje dizininde `aegis-cli` aracını doğrudan `npm` üzerinden çalıştırabilirsiniz:

```bash
# Yardım menüsünü görüntüleme
npm run cli -- --help

# Versiyon bilgisi
npm run cli -- --version
```

Eğer paketi global veya npx ile kullanıyorsanız:

```bash
npx aegis-cli --help
```

---

## 🔑 1. Kriptografik Parola & Diceware Üretimi (`generate`)

Rastgele parola ve paratümle (passphrase) üretimi için `generate` komutu kullanılır.

### Standart Rastgele Parola
```bash
# 24 karakterli sembollü parola (Varsayılan)
npm run cli -- generate

# 32 karakterli sembollü özel parola
npm run cli -- generate --length 32 --symbols

# Sembolsüz alfanümerik parola
npm run cli -- generate --length 16
```

### Diceware Paratümle (Passphrase)
Teknik kullanıcılar için akılda kalıcı 4 kelimelik kriptografik diceware paratümlesi üretir:

```bash
npm run cli -- generate --diceware
# Çıktı Örneği: aegis-quantum-horizon-beacon
```

---

## 📦 2. Şifreli Kasa Yedeklerini Sorgulama (`vault`)

`vault` komutları, AegisVault yedek dosyalarını (`.json`) sıfır-bilgi ilkesiyle çözerek terminalde sorgulamanızı sağlar.

### Kasa Kayıtlarını Listeleme (`vault list`)
Kasa dosyasındaki tüm başlıkları, kategorileri ve kullanıcı adlarını Argon2id + AES-256-GCM ile çözerek listeler:

```bash
# Güvenli interaktif parola istemi (Kabuk geçmişine yazılmaz):
npm run cli -- vault list --vault-file ./my-vault-backup.json

# Ortam değişkeni ile (CI/CD ve Otomasyon için):
export AEGIS_PASSWORD="MasterPassword123!"
npm run cli -- vault list --vault-file ./my-vault-backup.json
```

**Çıktı Örneği:**
```text
Vault Items (3 total):
──────────────────────────────────────────────────
1. [login] GitHub (ID: github-1) - User: hafgit99
2. [login] AWS Console (ID: aws-prod) - User: devops-admin
3. [securenote] API Keys Backup (ID: note-99) - User: n/a
```

### Belirli Bir Kaydın Detaylarını Alma (`vault get`)
Belirli bir ID veya Başlığa (Title) sahip kaydın şifre ve detaylarını görüntüler:

```bash
# İnteraktif güvenli parola girişiyle:
npm run cli -- vault get --vault-file ./my-vault-backup.json --id "GitHub"
```

**Çıktı Örneği:**
```text
Item Details:
──────────────────────────────────────────────────
Title:    GitHub
Category: login
Username: hafgit99
Password: SuperSecretPassword!99
URL:      https://github.com
Notes:    Primary developer account
```

---

## 🛡️ Güvenlik & CI/CD İpuçları

1. **Gizli Parola İstemi (Masked TTY Prompt):** `--password` parametresi verilmediğinde CLI, terminal üzerinden parolanızı ekrana yansıtmadan (yıldızlı olarak) güvenle ister. Bu sayede parola shell geçmişinize (`.bash_history`, `.zsh_history`) veya `ps aux` işlem listesine asla sızmaz.
2. **Ortam Değişkeni:** Otomasyon ve betiklerde `AEGIS_PASSWORD` ortam değişkenini kullanabilirsiniz.
3. **Pipeling (Boru Hattı):** `aegis-cli generate` komutu çıktı olarak sadece üretilen parolayı döndürdüğü için betiklerde (Bash/Python/CI) doğrudan değişkene atanabilir:
   ```bash
   NEW_DB_PASS=$(npx aegis-cli generate --length 32 --symbols)
   ```
