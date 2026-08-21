# BarkOS Orca/upstream envanteri

20 Ağustos 2026 tarihinde, `barkos/foundation` dalında (HEAD `7ae6aedc`) çıkarıldı.
Kapanış notundaki 1. maddeyi yerine getirir: görünen her Orca/upstream URL ve
komutunu **BarkOS hedefi**, **iç uyumluluk katmanı** veya **kaldırılacak özellik**
olarak sınıflandırır.

Sınıflar:

- **BARKOS-HEDEFI**: BarkOS'a ait çalışan bir hedefe bağlanacak ya da yerel
  kaynaktan karşılanacak.
- **DEVRE-DISI**: BarkOS sunucusu/endpoint'i hazır olana kadar dürüstçe
  kapatılacak; tamamlanmış gibi gösterilmeyecek.
- **KALDIRILACAK**: Upstream ürününe hizmet ettiği için özellik olarak sökülecek.
- **IC-UYUMLULUK**: Kullanıcıya görünmez; wire/disk/env sözleşmesi olarak korunur
  (bkz. `BARKOS_HANDOFF.md` "paket ve çalışma kimliği izolasyonu").

---

## 1. Beceri kurulum komutları — BARKOS-HEDEFI (en kritik)

Kaynak: `src/shared/agent-feature-install-commands.ts:3`

```ts
export const ORCA_SKILLS_REPOSITORY_URL = 'https://github.com/stablyai/orca'
```

Bu sabit bütün kurulum komutlarını üretir:
`npx skills add https://github.com/stablyai/orca --skill orca-cli --global`

Kullanıcıya bu komutları gösteren/pandıran yüzeyler:

| Yüzey | Dosya |
| --- | --- |
| Onboarding özellik kurulumu | `src/renderer/src/components/onboarding/onboarding-feature-setup.ts` |
| Ayarlar CLI & Skills bölümü | `src/renderer/src/components/settings/CliSection.tsx` |
| Orkestrasyon becerisi kartı | `src/renderer/src/components/settings/OrchestrationPane.tsx`, `OrchestrationSetupCard.tsx` |
| Browser Use kurulumu | `src/renderer/src/components/settings/BrowserUsePane.tsx`, `feature-wall/BrowserUseSkillSetupCard.tsx` |
| Computer Use kurulumu | `src/renderer/src/components/settings/ComputerUseSkillSetupPanel.tsx` |
| Linear beceri istemleri | `settings/use-linear-agent-skill-setup.ts`, `linear-agent-skill-install-cta.tsx`, `sidebar/LinearAgentSkillSetupPrompt.tsx` |
| Mobil emülatör rehberi | `emulator-pane/MobileEmulatorAgentSetupGuideSteps.tsx`, `settings/MobileEmulatorAgentControlRow.tsx` |
| Yüzen terminal orkestrasyon | `floating-terminal/FloatingTerminalOrchestrationDialog.tsx` |
| Beceri güncelleme diyalogları | `skills/SkillFreshnessUpdateDialog.test.tsx` üzerinden doğrulanan akış |
| CLI `barkos skills install` | `src/cli/handlers/skills.ts` (aynı URL'ye shelling out) |

Karar: Beceriler zaten repoda paketli (`skills/*.md` → `src/cli/bundled-skill-guides.ts`,
`skill-stubs/`). Kurulum dış `stablyai/orca` deposuna değil, uygulamanın kendi
paketli kaynağından yapılmalı. Dış `npx skills` CLI'sına bağımlılık son kullanıcı
kurulum bağımlılığı olmaktan çıkmalı.

## 2. Hesap / bulut kimlik doğrulama — DEVRE-DISI

Kaynak: `src/main/orca-profiles/profile-cloud-auth-config.ts`

- `PRODUCTION_API_BASE_URL = 'https://login.onorca.dev'`
- `PRODUCTION_RELAY_DIRECTOR_URL = 'https://relay.onorca.dev'`
- `PRODUCTION_CLIENT_ID = 'orca-desktop'`

Doğrulanan hata: BarkOS Hesap ekranı `Signing in...` durumunda takılıyor
(`tr.json` içinde hâlâ çevrilmemiş 6 adet `signingIn` girdisi var).

Karar: BarkOS hesap sunucusu (`muratkomurcu.com`) hazır olana kadar giriş akışı
zorunlu veya çalışıyor gibi sunulmayacak; düzgün Türkçe "henüz kullanılamıyor"
durumu gösterilecek.

## 3. Güncelleyici ve sürüm kanalları — IC-UYUMLULUK (kapalı olduğu doğrulanacak)

- `src/main/updater.ts:1441,2219` → `github.com/stablyai/orca/releases/latest/download`
- `src/main/updater-prerelease-feed.ts` → releases.atom + download base
- `src/main/updater-changelog.ts`, `updater-nudge.ts` → `onorca.dev/whats-new/...`
- `src/shared/release-channel.ts` → `stablyai/orca-hourly|-daily|-adhoc`

Handoff notu "production release updater kapalı, publish listesi boş" diyor;
bu kapının paketlenmiş build'de gerçekten devrede olduğu bir testle sabitlenecek.

## 4. Feedback, gizlilik ve yıldız istekleri — KALDIRILACAK / BARKOS-HEDEFI

- `src/main/ipc/feedback.ts:17` → `www.onorca.dev/v1/feedback` — DEVRE-DISI
  (BarkOS endpoint'i yok).
- `src/renderer/src/lib/telemetry.ts:11` → `PRIVACY_URL = www.onorca.dev/docs/telemetry`
  — BARKOS-HEDEFI (muratkomurcu.com gizlilik sayfası) veya kaldır.
- `src/renderer/src/components/sidebar/SidebarFeedbackDialog.tsx:27` →
  `github.com/stablyai/orca/issues` — KALDIRILACAK (upstream issue tracker'ına
  yönlendirme yasak).
- `StarNagToastHost.tsx`, `StarNagCard.tsx` → upstream yıldız isteme toast'u —
  KALDIRILACAK.
- `stats/ShareUsageButton.tsx`, `share-card-utils.tsx` → paylaşım kartındaki
  `github.com/stablyai/orca` filigranı — KALDIRILACAK veya BarkOS repo adıyla
  değiştirilecek.
- `src/main/github/client.ts:138` → `ORCA_REPO = 'stablyai/orca'`; yalnız
  yıldızlama özelliğinde kullanılıyor (`user/starred/...`) — yıldız istemeyle
  birlikte sökülecek.

## 5. Beceri paylaşım linkleri — DEVRE-DISI

- `src/shared/skill-share-link.ts:7` → production hostlar `app.orca.dev`,
  `share.onorca.dev`
- `SkillsPage.tsx:129` → `https://app.orca.dev/skills/share/<id>`
- `SkillInstallReviewContent.tsx:49` → örnek link metni
- Locale kataloglarındaki `66cff7a804` anahtarı aynı linki gösteriyor.

Karar: BarkOS artifact/share servisi yokken paylaşım akışı "henüz
kullanılamıyor" olacak; sessizce upstream bulutuna düşmeyecek.

## 6. Feature wall dokümantasyon linkleri — BARKOS-HEDEFI veya kaldır

- `src/shared/feature-wall-tiles.ts` (13 link) ve `feature-wall-workflows.ts`
  (5 link) → hepsi `www.onorca.dev/docs/...`

Kural gereği: gerçek `muratkomurcu.com` route'u hazırlanana kadar bağlantı
gösterilmeyecek (tile'lardan docs butonu sökülecek ya da link render edilmeyecek).

## 7. Artifact bulutu — DEVRE-DISI

- `src/main/artifacts/artifact-cloud-config.ts:3` → `share.onorca.dev`
  (yalnız first-party `onorca.dev` host kabul ediyor).

BarkOS endpoint'i yokken artifact bulut akışları açılmayacak.

## 8. Eklenti (plugin) altyapısı — kısmen IC-UYUMLULUK, kısmen DEVRE-DISI

- `src/shared/plugins/plugin-marketplace.ts:9,13,121` → resmi yayıncı `stablyai`,
  marketplace `github.com/stablyai/orca-plugins.git` — IC-UYUMLULUK (kimlik
  şeması) + DEVRE-DISI (upstream marketplace'e erişim).
- `plugin-install-trust.ts`, `plugin-marketplace-provenance.ts` → `stablyai`
  org zorunluluğu — IC-UYUMLULUK.
- `plugin-kill-list-service.ts:10` → `onorca.dev/plugins/kill-list.json` —
  DEVRE-DISI (upstream kill listesi BarkOS'u bağlamamalı).

## 9. GitHub/source-control varsayılanı — KALDIRILACAK

Kapanış notu kuralı: varsayılan kaynak kullanıcının kendi klasörü/repo'su;
`stablyai/orca` upstream'i yalnız ayrıca seçilen referans depo olabilir.

- Yukarıdaki 4. maddedeki yıldız/yıldız-nag zinciri bunun parçası.
- Test fixture'larındaki `github:stablyai/orca` proje kimlikleri (ör.
  `selectors.test.ts`, `repos*.test.ts`) yalnız test verisi — IC-UYUMLULUK,
  ürün davranışını yönlendirmiyor.

## 10. Onboarding ekranındaki görünür İngilizce/Orca kalıntıları — BARKOS-HEDEFI

- Hardcoded fallback metinler (locale anahtarı düşerse ekranda görünen):
  - `MobileEmulatorAgentControlRow.tsx:79` → `'Enable Orca CLI'`
  - `browser-use-search.ts:7` → `'Enable Orca CLI'`
  - `BrowserUseCliStep.tsx:30,42` → `'Enable Orca CLI'`
  - `MobileEmulatorAgentSetupGuideSteps.tsx:57` → `'Enable Orca CLI'`
- `tr.json` içinde çevrilmemiş kalanlar: 4 × `"Enable BarkOS CLI"` (İngilizce
  bırakılmış), 6 × `"Signing in..."`.
- `onboarding-feature-setup.ts` içi uyarı mesajları İngilizce üretiliyor
  ("Orca CLI registration needs attention." vb.) — kullanıcıya görünüyor.

## 11. CLI yardım metinleri — doğrulanacak

- `src/cli/specs/core.ts`, `project.ts`, `skills.ts` örnekleri `orca ...` ve
  `--project github:stablyai/orca` içeriyor. Paketli CLI yardım metninin
  `barkos` gösterdiği iddia ediliyor (handoff); spec metinlerindeki `orca`
  kelimesinin runtime'da `barkos` ile değiştirildiği bir testle sabitlenecek,
  örneklerdeki upstream proje kimliği BarkOS nötr örnekle değiştirilecek.

## 12. Görünür marka normalizasyonu — mevcut altyapı

- `src/shared/barkos-visible-brand.ts` → `brandBarkosVisibleCopy()` "Orca"yı
  "BarkOS"a çeviriyor. Bu fonksiyonun kapsamadığı yüzeyler (yukarıdaki
  hardcoded fallback'ler, locale URL'leri) envanterin kalan maddeleridir.

## 13. Locale kataloglarındaki URL'ler — BARKOS-HEDEFI

- Tüm dillerde `19f4b4dc75` → `github.com/stablyai/orca`
- `en.json`/`tr.json` `66cff7a804` → `app.orca.dev/skills/share/…`

## 14. Dokunulmayacaklar (IC-UYUMLULUK, bilinçli)

- `ORCA_*` environment anahtarları (`ORCA_CLI_COMMAND` dahil)
- `orca-plugin.json`, `orca-marketplace.json`, `engines.orca`
- `out/shared/orca-*` modül adları, wire protokol alanları
- Kaynak kod yorumlarındaki upstream PR/issue referansları (#829, #926)
- Test fixture'ları ve test harness URL'leri
- `mobile-relay-pairing-fixtures.ts` içindeki relay URL'leri (yalnız fixture)

---

## Uygulama sırası (kapanış notunun 3. maddesine hazırlık)

1. `agent-feature-install-commands.ts`'i yerel/paketli beceri kaynağına
   bağla; `npx skills add <upstream>` komutunu üretme.
2. Onboarding + Settings kurulum kartlarını yeni yerel kurulum yoluna geçir,
   gerçek health-check (`command -v barkos`, beceri dizini kontrolü) ekle.
3. Hesap/feedback/skill-share/kill-list gibi upstream bulut çağrılarını
   feature-flag arkasına al ve kapalı başlat.
4. Feature wall docs linklerini kaldır veya muratkomurcu.com route'larına bağla.
5. Yıldız isteme, upstream issue yönlendirme ve paylaşım kartı filigranını sök.
6. Kalan hardcoded fallback'leri locale anahtarlarına taşı ve Türkçeleştir.
