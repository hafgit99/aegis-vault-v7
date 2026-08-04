# AegisVault v7 — Safari Extension Integration Kılavuzu

> **Hedef:** macOS Safari 15.4+ için Safari App Extension derlemesi ve Xcode paketlemesi.  
> **Standart:** WebExtension Manifest V3.  

---

## 1. Safari Eklentisi Derleme

AegisVault Safari WebExtension paketini derlemek için terminalde şu komutu çalıştırın:

```bash
npm run extension:safari
```

Derleme çıktısı `dist-extension-safari/` klasörüne aktarılacaktır.

---

## 2. Xcode İle Safari App Extension Projesi Oluşturma (macOS)

Safari eklentisini Mac App Store veya lokal uygulamanızla paketlemek için macOS ortamında şu adımları izleyin:

```bash
xcrun safari-web-extension-converter dist-extension-safari --project-name "AegisVaultSafari"
```

1. Oluşan Xcode projesini (`AegisVaultSafari.xcodeproj`) açın.
2. Target ayarlarında Geliştirici Sertifikanızı (Apple Developer Team) seçin.
3. `Cmd + R` ile projeyi derleyip çalıştırın.
4. **Safari > Ayarlar > Uzantılar** menüsüne gidin ve **AegisVault Safari Extension** kutucuğunu işaretleyerek aktif edin.

---

## 3. Güvenlik ve İzolasyon Garantileri

- **Closed Shadow DOM:** İçerik betiği (content script) web sayfalarında DOM erişimlerini kapalı shadow root ile izole eder.
- **Native Messaging:** Masaüstü AegisVault uygulaması ile şifreli yerel IPC kanalı (`tauri://ipc`) üzerinden güvenle iletişim kurar.
