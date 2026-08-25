# BarkOS çalışma devri

Bu dosya, BarkOS geliştirmesine ara verilen noktayı kaydeder. Eve geçince
çalışmaya buradan devam edilebilir.

## Oturum bilgisi

- Tarih: 25 Ağustos 2026
- Saat dilimi: Europe/Istanbul
- Çalışma alanı: `/Users/muratkomurcu/Desktop/orca`
- Git dalı: `barkos/main`
- Başlangıç HEAD'i: `b25860c4f`
- Paket adı ve sürümü: `barkos@1.4.178-rc.2`
- Gerekli çalışma zamanı: Node.js 24, pnpm 10.24
- Durum: Munder incelemesinden uyarlanan BarkOS koordinasyon ve canlı ofis
  değişiklikleri çalışma ağacında doğrulanmış, henüz commitlenmemiş durumda.

> Önemli: BarkOS'a ait değiştirilmiş ve yeni dosyaları `reset`, `checkout`,
> `clean` veya benzeri işlemlerle silme.

## Ürün hedefi

BarkOS, Orca'nın terminal, çalışma alanı, worktree, Git, SSH, eşlenmiş çalışma
zamanı ve ajan oturumu altyapısını yürütme çekirdeği olarak kullanan yerel bir
"AI şirket işletim sistemi"dir. Kullanıcı şirketini, rollerini ve kalıcı işçi
kimliklerini oluşturur; hedefi planlar; işi uygun ajana verir; gerçek çalışmayı
izler ve kanıt üzerinden kabul ya da ret kararı verir.

Temel yaklaşım:

- Orca'nın yürütme çekirdeğini yeniden yazmamak.
- BarkOS şirket, rol, işçi, plan, yetki, kanıt ve karar katmanını eklemek.
- Sağlayıcı kimlik bilgilerini BarkOS kayıtlarına koymamak.
- Yıkıcı, haricî veya yüksek riskli eylemleri denetlenebilir yetki sınırlarıyla
  yönetmek.
- Normal sistem kullanımında arka planda kaynak veya sağlayıcı kotası
  tüketmemek.

## Tamamlanan aşamalar

### M0 — Fork temeli

- BarkOS ürün kimliği ve `barkos@1.4.178-rc.2` paket adı oluşturuldu.
- Kullanıcının seçtiği BarkOS amblemi şeffaf, yüksek çözünürlüklü kalıcı kaynak
  olarak eklendi. macOS `.icns`, Windows `.ico`, Linux/build PNG ve runtime PNG
  hedefleri tek deterministik script ile bu kaynaktan üretiliyor.
- Node 24 için `.node-version` eklendi; kullanıcının global Node 26 kurulumu
  değiştirilmedi.
- Geliştirme örneği kimliği ve başlangıç izolasyonu eklendi.
- Lisans/ürün sınırı `NOTICE-BARKOS.md` içinde belgelendi.
- Yol haritası ve mimari belgeleri oluşturuldu.

### M1 — Şirket çekirdeği

- Sürümlü ve katı `Company`, `Role` ve `Worker` sözleşmeleri eklendi.
- Yerel snapshot saklama, doğrulama, migrasyon ve sınırlı yedekleme eklendi.
- Şirket oluşturma, düzenleme, arşivleme, içe/dışa aktarma tamamlandı.
- Rol ve işçi kadrosu düzenlenebiliyor.
- İşçiler local, folder, worktree, SSH ve paired-runtime hedeflerine
  bağlanabiliyor.
- İsimli bir işçi, şirket/rol brifingiyle gerçek Orca ajan oturumuna
  başlatılabiliyor.
- İşçinin kesin workspace, workspace türü, local/SSH/runtime host ve terminal
  kimliği ayrı, sürümlü ve özel bir snapshot içinde kalıcılaştırılıyor.
- Uygulama yeniden açıldığında bağlar güncel şirket nesli, işçi, ajan, tab,
  workspace ve host kimliğiyle doğrulanıyor.

## Son tamamlanan davranış: kalıcı ajan oturumu ve güvenli recovery

1. Worker-session sözleşmesi v1, şirket snapshot'ından ayrı tutuluyor ve yalnızca
   yürütme kimliklerini saklıyor; credential, prompt, konuşma veya terminal
   çıktısı saklamıyor.
2. Ana süreç snapshot'ı boyut sınırıyla ve yalnızca kullanıcı erişimli dosya
   izinleriyle yazıyor. Şirket kimliğine ek olarak `companyCreatedAt` kontrolü,
   arşivlenen bir şirketin oturumlarının aynı kimliği kullanan yeni şirkete
   taşınmasını engelliyor.
3. Kadrodan kaldırılan veya ajan tipi değişen işçi bağları yüklemede ayıklanıyor.
4. Oturumlar `ready`, `starting`, `relaunch-required`, `requested` ve `unbound`
   olarak görünür biçimde ayrılıyor.
5. Dispatch yalnızca aynı tab, workspace ve local/SSH/runtime host üzerinde
   tanınmış canlı ajan terminali `ready` olduğunda çalışıyor.
6. Terminal kapanmışsa BarkOS güncel hedef uygunluğunu yeniden denetliyor ve
   yalnızca daha önce kaydedilmiş kesin hedefte ajanı başlatıyor; başka workspace
   veya host'u kendiliğinden seçmiyor.
7. Başlatma sonrası tanınmış terminal kimliği için en fazla 30 saniye bekleniyor.
   Belirsiz remote `requested` kaydı körlemesine tekrar başlatılmıyor; olası çift
   ajan yan etkisi yerine kullanıcı doğrulaması isteniyor.
8. Company ve Objective Board ekranları bekleme, yeniden başlatma gereksinimi,
   kalıcılık hatası ve retry durumlarını açıkça gösteriyor.
9. Ajan oluşturulduktan sonraki snapshot yazma hatası launch hatası gibi
   gösterilmiyor; kalıcılık uyarısı korunurken ikinci ajan başlatmaya davet eden
   yanlış retry engelleniyor.

İlgili ana dosyalar:

- `src/shared/barkos/worker-session.ts`
- `src/main/barkos/worker-session-store.ts`
- `src/main/ipc/barkos-worker-sessions.ts`
- `src/renderer/src/lib/barkos-worker-session-state.ts`
- `src/renderer/src/lib/ensure-barkos-worker-session.ts`
- `src/renderer/src/lib/launch-barkos-worker-session.ts`
- `src/renderer/src/components/barkos-company/use-barkos-company-snapshots.ts`
- `src/renderer/src/components/barkos-company/use-barkos-orchestration-actions.ts`

## Son tamamlanan davranış: denetlenebilir karar gelen kutusu

1. Orca `question`, `decision_gate`, `escalation` mesajları ve gerçek Gate
   kayıtları ayrı, katı ve sürümlü BarkOS decision-inbox v1 snapshot'ına
   alınıyor.
2. Her kayıt yerel Task/Assignment/Dispatch, kaynak işçi, risk ve execution host
   ile tam Orca Run/Task/Dispatch/Message/Gate kimliğini birlikte taşıyor.
   Eşleşmeyen, malformed, aşırı büyük veya başka Run'a ait satırlar içeri
   alınmıyor.
3. BarkOS yalnızca lider terminalinin hâlihazırda bağlı olduğu `runCurrent`
   kutusunu okuyor. Poll sırasında `runUse` çağırmıyor ve başka terminalden
   consumer authority devralmıyor.
4. Gerçek Gate kaydı bulunan aynı `decision_gate` mesajı çift kart üretmiyor;
   authoritative Gate tercih ediliyor.
5. Decisions sekmesi bekleyen soruyu, kaynağı, görev/işçi bağını, riski,
   seçenekleri ve geçmiş yanıtı gösteriyor. Kullanıcı seçenek, onay, ret veya
   serbest metin yanıtı verebiliyor.
6. Yanıt önce `resolving` olarak kalıcılaştırılıyor, sonra tam bir
   `gateResolve` veya `reply` çağrısı yapılıyor ve doğrulanmış receipt
   `resolved` olarak kaydediliyor.
7. RPC veya son kayıt sonucu belirsizse istek `resolution-uncertain` oluyor ve
   tekrar gönderilebilir duruma dönmüyor. Uygulama `resolving` sırasında
   kapanırsa yeni süreç bunu bir kez belirsiz duruma çeviriyor; Orca'ya hiçbir
   otomatik tekrar yapmıyor.
8. Karar kutusu Company sayfası açıldığında bir kez yenileniyor. Yalnızca sayfa
   açık ve aktif dispatch varken on saniyelik read-only poll çalışıyor; sayfa ya
   da uygulama kapanınca timer kalmıyor ve sağlayıcı kotası tüketilmiyor.
9. Karar gelen kutusu için yeni remote opcode, RPC alanı veya yayınlanan host
   verisi eklenmedi; mevcut `runCurrent`, `gateList`, `check`, `gateResolve` ve
   `reply` sözleşmeleri kullanıldı.

İlgili ana dosyalar:

- `src/shared/barkos/decision-inbox.ts`
- `src/main/barkos/decision-inbox-store.ts`
- `src/main/ipc/barkos-decision-inbox.ts`
- `src/renderer/src/lib/barkos-decision-inbox-discovery.ts`
- `src/renderer/src/lib/barkos-decision-inbox-runtime.ts`
- `src/renderer/src/components/barkos-company/use-barkos-decision-inbox.ts`
- `src/renderer/src/components/barkos-company/BarkosDecisionInbox.tsx`
- `src/renderer/src/components/barkos-company/BarkosDecisionRequestCard.tsx`

## Son tamamlanan davranış: M3 hafıza sistemi

1. Ayrı memory-vault v1 snapshot'ı company, role, worker, project ve task
   scope'larını; source, capture time, confidence, expiry, revocation ve
   contradiction lineage alanlarını katı doğruluyor.
2. Kullanıcının kabul ettiği kanıt aktif hafızaya sessizce yazılmıyor. Exact
   Evidence/Task/Assignment/Dispatch/worker/role/workspace kimlikleriyle tek,
   idempotent project-scope promotion adayı oluşuyor.
3. Credential-benzeri diff, risk ve task-title metni adaya kopyalanmıyor;
   kaynak kimliğiyle birlikte omission notu tutuluyor. Briefing seçimi aynı
   filtreyi yeniden uyguluyor.
4. Memory sekmesi pending adayları gösteriyor. Kullanıcı promotion öncesi
   provenance ile izin verilen company/role/worker/project/task scope'unu,
   confidence değerini, gelecekteki expiry'yi ve aynı scope'taki açık
   contradiction kayıtlarını seçebiliyor. Promote aktif memory oluşturuyor,
   Reject audit'i koruyor; aktif kayıt Revoke ile bağlamdan çıkarılabiliyor.
5. Vault ana süreçte 4 MiB sınırı, owner-only dosya, durable write, optimistic
   revision ve company generation isolation ile saklanıyor. Web adaptörü aynı
   sözleşmeyi sürümlü localStorage anahtarında uyguluyor.
6. Worker açıkça başlatılırken yalnızca aynı company/role/worker/workspace'e
   uyan aktif ve süresi dolmamış hafıza 4.000 karakter bütçesine sığan tam
   kayıtlar hâlinde briefing'e ekleniyor. Başka proje hafızası taşınmıyor.
7. Task dispatch anında exact Company generation, Task, Assignment, Dispatch,
   worker, role ve workspace zinciri için yeniden seçim yapılıyor. İlgili tam
   kayıtlar ayrı 8.000 karakter bütçesine paketleniyor.
8. Orca yan etkisinden önce work-ledger v4'e deterministik receipt ID, seçilen
   memory ID'leri, SHA-256 context hash'i, karakter sayısı ve `prepared` durumu
   kalıcılaştırılıyor. Güncel host aynı değerleri echo ederse `delivered`;
   optional alanları bilmeyen eski host veya belirsiz sonuçta `unconfirmed`
   gösteriliyor. Uygulama teslimatı doğrulanmadan başarı iddiasında bulunmuyor.
9. Remote uyumluluk için yalnız additive optional `supplementalContext` ve
   `contextReceiptId` alanları eklendi. Yeni stream opcode/protokol bump yok;
   eski host alanları atıp görevi çalıştırabilir ve BarkOS bunu dürüstçe
   `unconfirmed` kaydeder.
10. Backup bundle v1 şirket ile bağımsız sürümlü memory vault'u aynı generation
    kontrolü altında dışa/içe aktarıyor. 5 MiB sınırı ve credential-benzeri
    içerik filtresi var; eski company-only JSON boş vault ile içe alınabiliyor.
    Dosya seçimi aktif şirketi değiştirmiyor, replacement açık onaydan sonra
    uygulanıyor.
11. Uygulama kapalıyken memory timer, daemon, watcher veya provider çağrısı yok.

İlgili ana dosyalar:

- `src/shared/barkos/memory-vault.ts`
- `src/shared/barkos/memory-promotion.ts`
- `src/shared/barkos/memory-context.ts`
- `src/shared/barkos/memory-delivery.ts`
- `src/shared/barkos/backup-bundle.ts`
- `src/main/barkos/memory-vault-store.ts`
- `src/main/ipc/barkos-memory-vault.ts`
- `src/main/ipc/barkos-company.ts`
- `src/renderer/src/components/barkos-company/use-barkos-memory-vault.ts`
- `src/renderer/src/components/barkos-company/BarkosMemoryVault.tsx`
- `src/renderer/src/components/barkos-company/BarkosMemoryCandidateCard.tsx`
- `src/renderer/src/lib/barkos-dispatch-memory-context.ts`
- `src/renderer/src/lib/launch-barkos-worker-session.ts`

## Son tamamlanan davranış: M4 manuel local Codex failover

1. Ayrı provider-capacity ledger v1; provider, opaque account ID/system default,
   exact execution host, host/WSL lane, normalize durum/reason, usage yüzdesi,
   reset/retry ve gözlem zamanlarını katı ve sınırlı doğruluyor.
2. Token, cookie, account email, credential provenance veya provider konuşma
   içeriği BarkOS kapasite kaydına alınmıyor. Credential-benzeri account ID
   sözleşme tarafından reddediliyor.
3. Orca'nın mevcut Claude/Codex roster'ı ile sekiz provider'ın mevcut usage
   snapshot'ı normalize ediliyor. Missing, fetching, stale, partial veya
   belirsiz kaynak `unknown` oluyor; yalnız fresh `available` kayıt seçilebilir.
4. Her gözlem provider + execution host + host/WSL lane kapsamında. Paired
   runtime usage taşımıyorsa local desktop usage o runtime'a aitmiş gibi
   etiketlenmiyor. SSH ve WSL sınırlarını kendiliğinden aşan fallback yok.
5. Ortak failover seçicisi aktif hesap, düşük usage ve stable key sırasıyla
   deterministik; aynı hesabı iki kez denemiyor, azami üç attempt uyguluyor,
   bütün hesaplar cooldown'daysa en erken wake time veriyor, belirsiz veride
   tahmin etmeyip kesin stop reason dönüyor.
6. Failover audit state machine outcome/reason eşleşmesini doğruluyor. Başarı
   tamamlanıyor; olası yan etkisi belirsiz bir deneme `uncertain` olarak donuyor
   ve başka hesaba ilerleyemiyor.
7. Desktop store 2 MiB, owner-only durable file, company generation ve
   optimistic revision ile çalışıyor. Trusted renderer IPC sınırı var. Web
   adaptörü aynı sözleşmeyi sürümlü localStorage anahtarında uygular.
8. Company içindeki Capacity sekmesi mevcut kayıtları provider/account/host/lane
   bilgisiyle gösteriyor. `Sync Orca snapshot` yalnız kullanıcı basınca çalışır;
   provider refresh etmez, account değiştirmez ve görev başlatmaz.
9. Desktop Capacity ekranı yalnız exact running BarkOS Task/Assignment/Dispatch,
   aynı local-host Codex worker binding ve workspace, `done` fakat session
   boundary olmayan turn, eşleşen Orca Task/Dispatch kimlikleri
   `dispatchStatus: dispatched` ve typed `providerFailure.kind:
usage-limit-exceeded` durumundayken recovery satırını gösteriyor.
   Typed neden yalnız exact rollout `task_complete.turn_id` içindeki
   `error.codex_error_info` alanından geliyor; terminal, assistant veya error
   metni sınıflandırılmıyor.
10. `Check recovery` mevcut Orca roster'ı ve daha önce gözlenmiş usage durumunu
    provider refresh yapmadan yeniden okuyor. Aktif hesap limited/cooldown ve
    denenmemiş inactive hesap fresh available ise `Recover Dispatch` açılıyor;
    eksik veya belirsiz inactive usage fail-closed kalıyor.
11. Recovery tıklaması roster/usage ve bütün execution koşullarını mutation'dan
    hemen önce tekrar doğruluyor. Seçim önce audit'e `selected` olarak yazılıyor.
    Main process exact managed host hesabını seçtikten sonra ayrı bir
    `codexAccounts.list` çağrısıyla authoritative read-back alıyor; mutation
    yanıtı tek başına Dispatch veya PTY değişikliğini yetkilendirmiyor. Eksik ya
    da tutarsız read-back audit'i `uncertain` olarak donduruyor. Uygulama seçim
    sırasında kapanırsa sonraki açılış kaydı bir kez `uncertain` yapıyor; kör
    tekrar yok.
12. Güvenilir aynı-conversation resume yalnız trusted Codex home altındaki exact
    rollout regular file'ını hedef managed home'a hard-link ederek hazırlanıyor.
    Divergent mevcut hedef reddediliyor; system default veya doğrulanamayan
    provenance yeni session olarak açıkça kaydediliyor. Gerçek `~/.codex`
    yazılmıyor.
13. Account mutation doğrulandıktan sonra exact eski Orca Dispatch durduruluyor
    ve `terminal.close` yanıtında aynı handle için `ptyKilled: true` kanıtı
    gelmeden ikinci Codex writer başlatılmıyor.
14. Replacement session hazır olunca lead gerekiyorsa Run authority ona
    bağlanıyor, aynı Task ready yapılıyor, yeni Orca Dispatch inject ediliyor ve
    yeni Dispatch kimliği work-ledger'a kalıcılaştırılıyor.
15. Mutation sonrası herhangi bir RPC veya persistence sonucu belirsizse audit
    `ambiguous-side-effect` ile donuyor; başka hesaba veya ikinci writer'a
    otomatik ilerlemiyor.
16. Kurtarma desktop-only ve manuel. Web istemcisi mutation eylemini göstermiyor.
    Capacity sayfasını açmak hesap değiştirmiyor veya provider quota çağrısı
    yapmıyor; yalnız Orca'nın mevcut in-memory agent status durumunu izliyor.
17. Codex `Stop` hook'u provider hatasında çalışmadığı için aktif root turn exact
    `turn_id` ile bounded incremental rollout cursor üzerinden izleniyor.
    `task_complete.error.codex_error_info: usage_limit_exceeded` optional typed
    `providerFailure` olarak taşınıyor; eski peer alanı yok sayıyor, yeni recovery
    alan yoksa fail-closed kalıyor. Otomatik recovery ve provider/local-host dışı
    capability yok.
18. Disposable hesaplı Electron test düzeneği gerçek renderer → preload IPC →
    main process → durable ledger zincirini doğruluyor. Başarılı same-conversation
    devretmenin yanında read-back yokluğu, Dispatch stop belirsizliği, PTY kill
    kanıtı yokluğu ve work-ledger persistence hatası ayrı ayrı enjekte ediliyor.
    Ayrı bir gerçek süreç yeniden başlatma testi, diskte `selected` kalan attempt'i
    tekrar oynatmadan `uncertain` durumuna geçiriyor.

İlgili ana dosyalar:

- `src/shared/barkos/provider-capacity.ts`
- `src/shared/barkos/provider-capacity-observation.ts`
- `src/shared/barkos/provider-capacity-account-snapshot.ts`
- `src/shared/barkos/provider-failover-policy.ts`
- `src/shared/barkos/provider-failover-execution.ts`
- `src/shared/barkos/provider-failover-dispatch.ts`
- `src/shared/barkos/provider-account-failover-executor.ts`
- `src/main/codex/codex-account-failover-resume.ts`
- `src/main/codex/codex-account-session-bridge.ts`
- `src/main/barkos/provider-capacity-store.ts`
- `src/main/ipc/barkos-provider-capacity.ts`
- `src/main/ipc/codex-accounts.ts`
- `src/renderer/src/store/slices/barkos-provider-capacity.ts`
- `src/renderer/src/lib/barkos-codex-failover.ts`
- `src/renderer/src/lib/barkos-codex-recovery-checks.ts`
- `src/renderer/src/lib/barkos-provider-capacity-snapshot.ts`
- `src/renderer/src/lib/launch-barkos-codex-failover-session.ts`
- `src/renderer/src/components/barkos-company/use-barkos-provider-capacity.ts`
- `src/renderer/src/components/barkos-company/BarkosProviderCapacity.tsx`
- `src/renderer/src/components/barkos-company/BarkosProviderFailover.tsx`

## Son tamamlanan davranış: M5 istemci yürütme kontrolü

1. Ayrı `control-policy` v1 sözleşmesi Company kimliği ve `createdAt`
   generation'ına bağlı. `running/paused`, eşzamanlı Dispatch, işçi başına aktif
   Assignment ve Objective başına Dispatch sınırlarını katı ve bounded doğrular.
2. Varsayılanlar running, 4 aktif Dispatch, işçi başına 2 aktif Assignment ve
   Objective başına 100 Dispatch'tir. Son değer parasal/token maliyet iddiası
   değil, açık bir yürütme birimi bütçesidir.
3. Desktop store 64 KiB, owner-only durable dosya ve optimistic revision ile
   çalışır. Trusted renderer IPC sınırı vardır. Web adaptörü aynı sözleşmeyi
   Company generation'ına bağlı sürümlü localStorage anahtarında uygular.
4. Politika client/host-local'dır ve BarkOS backup'a girmez. Başka makinenin
   concurrency veya yürütme yetkisi Company importuyla taşınmaz.
5. Control sekmesi yürütme durumunu, aktif Dispatch sayısını, üç sınırı ve
   revision'ı gösterir. Ayarlar reload sonrasında gerçek ana-süreç deposundan
   geri gelir.
6. Yeni Task Assignment ve onaylanmış protected-work geçişi güncel durable
   politikayı mutasyondan önce okur. İşçi seçimi aktif Assignment sınırına uyar.
7. Gerçek Dispatch adaptörü politikayı hemen önce tekrar okur; pause, aktif
   concurrency, Objective bütçesi veya scope uyuşmazlığını `prepared` kayıt ve
   Orca RPC yan etkisinden önce reddeder.
8. Manuel local Codex recovery politikayı ilk adımda okur. Pause durumunda worker
   session, account, Dispatch veya terminal değişikliğine başlamaz.
9. Pause yalnız bu istemciden başlatılan yeni Assignment, Dispatch ve Codex
   recovery'yi engeller. Çalışan ajanı, terminali veya Dispatch'i durdurduğu
   iddia edilmez. Doğrudan worker launch da Task Dispatch olmadığı için bu
   gate'in dışında kalır.
10. Gerçek Electron testi limit kaydı, revision artışı, pause ve aynı user-data
    içindeki renderer reload sonrası durable read-back zincirini doğrular.
11. Running Dispatch satırındaki açık destructive stop eylemi, kullanıcının
    onayından sonra önce exact Orca Dispatch ID ve canlı worker terminal handle
    içeren `requested` kaydını kalıcılaştırır; politika paused olsa da stop
    kullanılabilir.
12. Exact `orchestration.workerStop` receipt'i gelmeden terminal kapatılmaz.
    Receipt kalıcılaştırıldıktan sonra yalnız aynı handle için `terminal.close`
    ve `ptyKilled: true` kabul edilir. Eksik canlı terminal yeniden başlatılmaz.
13. İki kanıt tamamlanınca Dispatch ve Task `cancelled`, Assignment `rejected`
    olur. Böylece aktif concurrency/load azalır; plan veya Objective sahte
    tamamlanmış sayılmaz.
14. RPC, receipt veya persistence belirsizliği work-ledger v5'te son kesin
    `requested`, `dispatch-stopped` ya da `uncertain` sınırıyla kalır. BarkOS
    durdu iddiası yapmaz ve aynı Dispatch için tekrar stop sunmaz.
15. Gerçek Electron fault matrisi intent persistence, Dispatch stop
    belirsizliği, authority-proof persistence, PTY kill kanıtsızlığı ve final
    cancellation persistence hatalarını enjekte eder; her aşamada son durable
    sınırı ve yasaklanan sonraki yan etkiyi doğrular.
16. Reassignment yalnız `stop.state=completed`, cancelled Dispatch ve cancelled
    Task sınırından yapılır. Durdurulan işçi seçimden çıkarılır; eski Assignment
    `reassigned` denetim izi olur ve farklı işçinin yeni Assignment'ı runtime
    yan etkisinden önce tek revision olarak kalıcılaşır.
17. Execution paused ise reassignment ledger mutasyonundan önce reddedilir.
    Korumalı iş yeni bir dispatch approval gate alır; onay gelmeden worker
    session veya Orca Dispatch başlatılmaz. Runtime başlatma başarısız olursa
    kalıcı approved Assignment açık retry için görünür kalır.
18. Live Office sekmesi durable Task/Assignment/Dispatch kayıtlarını exact
    tab/workspace/agent/host eşleşmeli mevcut in-memory hook durumuyla birleştirir.
    Provider quota çağrısı, terminal okuması, polling veya arka plan işi yoktur;
    live kanıt eksikse `Runtime unconfirmed` gösterilir.
19. Ayrı `usage-cost-ledger` v1 sözleşmesi Company generation'ına bağlıdır ve
    yürütme birimi bütçesini hiçbir şekilde değiştirmez. Desktop store owner-only,
    4 MiB bounded ve durable'dır; host-local kanıt olduğu için Company backup'a
    girmez.
20. Usage & cost senkronizasyonu yalnız açık kullanıcı tıklamasıyla başlar.
    Local Dispatch desktop Claude/Codex usage store'unu; uygun paired-runtime
    Dispatch ise yalnız işi çalıştıran hostun store'unu tarar. Provider'a istek
    atmaz, ajan başlatmaz, polling veya sürekli arka plan işi kurmaz.
21. Local muhasebe exact worker/provider session binding, aynı workspace ve
    tamamen Dispatch zaman aralığında kalan provider kaydını gerektirir.
    Paired runtime ayrıca additive capability, authenticated owner, bitmiş host
    Dispatch'i, canlı PTY/process/launch-token ve host-derived provider session
    kanıtını gerektirir. Birden fazla Dispatch'in kullandığı session, eski host,
    direct SSH/WSL, paired host içindeki nested SSH/WSL veya eksik/belirsiz kanıt
    tahmin edilmez; `unavailable` saklanır.
22. Token kovaları işi yürüten hostun exact transcript/rollout kaydından
    provider-derived gelir. Wire yalnız bounded aggregate taşır; ham log, path,
    credential veya renderer'ın provider-session iddiasını taşımaz.
    Dolar değeri Orca pricing tablosundan API-equivalent tahmindir; provider
    faturası veya gerçek tahsilat diye sunulmaz. UI fiyatı bulunan Dispatch
    sayısını attribution sayısından ayrıca gösterir.
23. BarkOS açılışında yalnız küçük durable ledger okunur. Local veya paired-host
    provider log taraması manuel sync'e kadar başlamadığı için bu dilim normal
    gezinmeye veya uygulama kapalıyken sisteme yeni yük getirmez.
24. Live Office görünüm tercihi strict client-local v1 kayıttır. Comfortable veya
    compact density ile system veya off motion seçimini versioned localStorage'da
    tutar; Company tanımına, runtime yetkisine veya backup'a girmez.
25. Compact görünüm yalnız padding ve dikey aralığı azaltır. Worker status, active
    work, Dispatch/Assignment kimliği, tool bilgisi ve attention kanıtını
    saklamaz.
26. Motion `system` iken işletim sisteminin `prefers-reduced-motion` tercihi
    uygulanır; `off` Office alt ağacındaki ve portal menüdeki animasyonu CSS
    seviyesinde kapatır. Sistem reduced-motion tercihi hiçbir zaman aşılmaz.
27. Live Office labelled region ve seviye-2 heading'dir. Özet polite/atomic live
    region; worker ve active-work koleksiyonları semantik listeler; status ve
    current-tool bağlamları ekran okuyucu etiketlidir.
28. Gerçek Electron testi Company tablist'ini ok tuşlarıyla, view-options menüsünü
    Enter ile kullanır; compact/off değerlerini, computed animation `none`
    sonucunu ve renderer reload sonrası preference read-back'ini doğrular.

İlgili ana dosyalar:

- `src/shared/barkos/control-policy.ts`
- `src/main/barkos/control-policy-store.ts`
- `src/main/ipc/barkos-control-policy.ts`
- `src/preload/api/barkos-control-policy-api.ts`
- `src/renderer/src/store/slices/barkos-control-policy.ts`
- `src/renderer/src/components/barkos-company/BarkosControlCenter.tsx`
- `src/shared/barkos/orchestration-dispatch-stop.ts`
- `src/shared/barkos/dispatch-stop-state.ts`
- `src/shared/barkos/assignment-reassignment.ts`
- `src/shared/barkos/orchestration-dispatch-adapter.ts`
- `src/renderer/src/lib/barkos-orchestration-runtime.ts`
- `src/renderer/src/lib/barkos-live-office.ts`
- `src/renderer/src/components/barkos-company/BarkosDispatchStopControl.tsx`
- `src/renderer/src/components/barkos-company/BarkosTaskReassignmentControl.tsx`
- `src/renderer/src/components/barkos-company/BarkosLiveOffice.tsx`
- `src/renderer/src/components/barkos-company/BarkosLiveOfficeViewOptions.tsx`
- `src/renderer/src/components/barkos-company/BarkosLiveOfficeWorkerRow.tsx`
- `src/renderer/src/lib/barkos-live-office-view-preferences.ts`
- `src/shared/barkos/usage-cost-ledger.ts`
- `src/main/barkos/usage-cost-store.ts`
- `src/main/barkos/usage-cost-collector.ts`
- `src/main/ipc/barkos-usage-cost.ts`
- `src/renderer/src/components/barkos-company/BarkosUsageCost.tsx`
- `src/renderer/src/components/barkos-company/use-barkos-usage-cost.ts`
- `src/renderer/src/lib/barkos-codex-failover.ts`
- `tests/e2e/barkos-control-policy.spec.ts`
- `tests/e2e/barkos-dispatch-stop.spec.ts`

## Son tamamlanan davranış: M5 Gemini ve paired-runtime tool yan-etki onayı

1. Decision Inbox strict v2 oldu; v1 snapshot'lar request içeriği değişmeden v2'ye
   migrate ediliyor.
2. Desktop local, direct SSH ve WSL Claude/Codex/Droid `PreToolUse` ve Gemini
   `BeforeTool` sınırları
   destructive shell, external mutation ve budgeted action sınıflarını gerçek
   çalıştırmadan önce yakalıyor.
   Normal test, dosya edit/write ve salt-okunur arama araçları bu sınırın dışında
   kalıyor.
3. Hook isteği yalnız exact pane → terminal handle → aktif Orca Dispatch zinciri,
   aynı Run/Task bağları ve SHA-256 launch-token commitment'ı eşleştiğinde BarkOS
   talebi sayılıyor. Tab remint yalnız aynı stable leaf kimliğinde kabul ediliyor.
4. Durable talep exact BarkOS Task/Assignment/Dispatch, Orca Run/Task/Dispatch,
   host, pane, tool adı, kategori, canonical tool-input SHA-256, 30 dakikalık
   expiry ve consumption zamanını saklıyor. Ham tool input veya launch token
   saklanmıyor; görünen özet secret ve URL query değerlerini redakte ediyor.
5. İlk çalıştırma `deny` döndürüp Decision Inbox'a pending talep yazıyor. Kullanıcı
   onayı yalnız değişmemiş tek retry için geçerli; yürütmeden önce atomik consume
   ediliyor. Claude, Droid ve Gemini kendi sözleşmelerinde explicit `allow`, Codex
   ise desteklenmeyen input-rewrite üretmemek için nötr `{}` alıyor. Replay veya
   farklı girdi yeni onay ister. Ret aynı exact eylemi engelli tutar.
6. Kimlik uyuşmazlığı, expiry, revision conflict, disk/persistence hatası veya
   provider/aktif Dispatch uyuşmazlığı veya hook sunucusuna erişilememesi
   fail-closed davranır. BarkOS Claude oturumunda transport kaybı exit 2,
   Codex, Droid ve Gemini oturumlarında provider-specific structured deny ile yan
   etkiyi durdurur; normal oturumlar mevcut nötr davranışını korur.
7. Decision Inbox main-process tarafından oluşan talepleri aktif Dispatch varken
   iki saniyede bir salt-okunur sync eder. Açık kullanıcı approve/reject eylemi
   trusted IPC üzerinden main-owned atomik resolver'a gider; lead Run veya remote
   reply yetkisi gerektirmez.
8. SSH/WSL hook sunucusu mevcut bidirectional JSON-RPC kanalı üzerinden sürümlü
   `agent_hook.evaluateBarkosSideEffect.v1` isteği gönderir; yeni stream opcode
   eklenmedi. Tam bir aktif Orca istemcisi exact Dispatch'i sahiplenmelidir.
   Sıfır, birden çok, malformed, timeout veya method-not-found yanıtı deny olur.
9. Main, relay'in verdiği kimliğe güvenmez: direct SSH'ta exact target ve
   `ssh:` execution host'u; WSL'de local terminal worktree'sinin exact distro
   runtime'ını yeniden doğrular. Launch token/provider/Dispatch zinciri aynı
   biçimde korunur.
10. Managed-hook install yanıtına additive `installedAgents` alanı eklendi.
    SSH relay ve WSL host, marker taşıyan BarkOS Claude/Codex/Droid/Gemini fiziksel PTY'sini
    exact güncel hook kurulmadan başlatmaz. WSL ilk kurulum sürüyorsa güvenli
    hata verir; kurulum devam eder ve kullanıcı yeniden deneyebilir.
11. Enforced remote hook yanıtı için timeout sekiz saniyeye çıktı; normal hook
    timeout'u ve normal terminal davranışı değişmedi. Eski relay'in boş 204
    yanıtı yalnız gerçek `PreToolUse`/`BeforeTool` olayında bloklar; Stop/PostTool gibi
    olaylar nötr kalır.
12. Paired runtime için additive `barkos.paired-side-effect-approval.v1`, v2 ve
    v3 capability'leri var. v1 Claude/Codex sözleşmesini değiştirmiyor; Droid
    yalnız ayrı v2, Gemini yalnız ayrı v3 subscribe/resolve RPC'leriyle taşınıyor.
    Desktop, owner'a özel streaming karar aboneliği `ready` olmadan ajanı
    başlatmaz; eski hostta desteklenmeyen provider açık hata ile fail-closed kalır.
13. Host, owner kimliğini istek alanından değil doğrulanmış paired device
    socket'inden türetir. Her sınıflandırılmış istekte canlı PTY incarnation,
    launch token hash'i, provider, pane, worktree ve aktif Orca Run/Task/Dispatch
    zincirini yeniden kanıtlar; yalnız oturumu başlatan cihaza gönderir.
14. Karar kanalı altı saniyede yanıt vermezse, kapanırsa, malformed/unmatched
    yanıt dönerse veya runtime nesli değişirse eylem deny olur. Salt-okunur
    araçlar hostta nötr devam eder ve tool input'u ağ üzerinden gönderilmez.
    Bağlantı yalnız ilk paired BarkOS ajan launch'ından sonra tutulur ve kopunca
    sınırlı yeniden bağlanır; uygulama kapalıyken hiçbir süreç veya timer yoktur.
15. Client, host kanıtını kendi durable Company/work-ledger kaydıyla exact
    environment/workspace/worker/Task/Assignment/Dispatch kimliklerinde tekrar
    eşler. Onay hâlâ aynı canonical tool-input hash'inin tek retry'ında atomik
    tüketilir. Host restart sonrası ephemeral PTY owner bağı yoksa mevcut ajan
    fail-closed kalır ve yeniden doğrulanmış launch gerekir.
16. Paired runtime içinden açılan nested SSH/WSL ajanı aynı owner-only karar
    kanalına önce yönlendirilir; exact uzak connection kimliği host PTY/Dispatch
    kanıtına katılır. Paired owner eşleşmezse yerel SSH sahibine sessiz fallback
    yapılmaz ve enforced eylem deny olur.
17. Factory Droid'un native desktop, direct SSH ve WSL `PreToolUse` sözleşmesi aynı exact
    Dispatch/onay zincirine eklendi. `Execute` shell aracı sınıflandırılır;
    Factory-compatible structured allow/deny döner ve transport kaybı deny olur.
    Launch öncesi renderer ve trusted PTY sınırı managed hook'un kurulu/açık
    olduğunu yeniden doğrular. Direct SSH relay ve WSL guest, exact Droid hook
    kurulumunu raporlamadan fiziksel ajanı başlatmaz; main exact SSH target veya
    WSL distro/Dispatch kimliğini yeniden kanıtlar. Paired BarkOS host v2
    capability'sini ilan ettiğinde Droid launch da aynı authenticated owner,
    canlı PTY/Dispatch ve tek kullanımlık Decision Inbox sınırına girer. Hostta
    managed Droid hook kapalı veya eksikse terminal oluşmadan reddedilir.
    Yalnız v1/legacy hostlar ve diğer provider'lar desteklenmez.
18. Gemini native, direct SSH, WSL ve v3-capable paired-runtime sınırında resmi
    `BeforeTool` girdisini ve
    `{ decision, reason }` çıktısını kullanır. `run_shell_command` aynı destructive,
    external ve budgeted sınıflandırmaya girer. `hooksConfig.enabled=false` veya
    managed hook adının disabled listesinde olması kurulu dosyaları yeterli
    saymaz; renderer, trusted PTY ve relay spawn guard fiziksel ajan başlangıcını
    reddeder. Paired Gemini yalnız ayrı v3 capability, v3 owner stream ve v3
    resolve yöntemi birlikte hazırsa açılır; v1/v2 host ve karar şemaları kabul
    edilmez.

## Son tamamlanan davranış: BarkOS paket ve çalışma kimliği izolasyonu

1. Paket kimliği `com.barkos.desktop`, ürün adı ve ana executable `BarkOS` oldu;
   macOS app/helper, Windows executable/installer ve Linux executable/artifact
   adları Orca'dan ayrıldı.
2. BarkOS yalnız `barkos:` URL scheme'ini sahiplenir. Eski paylaşım/pairing
   linkleri migrasyon için parse edilebilir; işletim sisteminde `orca:` scheme'i
   BarkOS adına kaydedilmez.
3. Kurulan CLI yalnız `barkos` komutudur. Unix symlink, Windows launcher ve WSL
   kaydı mevcut kullanıcı `orca` komutuna dokunmaz; kaldırma/migrasyon da Orca
   komutunu silmez.
4. Paket içindeki macOS/Linux launchers ve Windows native launcher BarkOS
   executable'ını açar ve ajanlara `ORCA_CLI_COMMAND=barkos` çalışma ipucunu
   verir. Bu nedenle orchestration resume/check metinleri yanlışlıkla global
   `orca` komutuna gitmez. İç `ORCA_*` environment isimleri wire ve hook
   uyumluluğu için korunur; işletim sistemi ürün sahipliği değildir.
5. BarkOS build'i upstream Orca yayın kanalını kullanmaz: builder publish listesi
   boş, production release updater kapalıdır. Yerel build seçimi ayrı kalır.
6. 19 Ağustos 2026'da yerel Apple Silicon paketi üretildi. Final çıktı
   `dist/barkos-macos-arm64.dmg`; içindeki uygulama `BarkOS.app`, kimliği
   `com.barkos.desktop`, executable mimarisi `arm64` ve URL scheme'i yalnız
   `barkos:`. Windows/Linux installer ve genel dağıtım paketi henüz üretilmedi.
7. Linux headless fallback ve managed-terminal PATH shim'i de yalnız `barkos`
   komutunu üretir. `~/.local/bin/orca`, GNOME Orca veya kullanıcıya ait başka
   bir `orca` komutu oluşturulmaz, gölgelenmez ya da değiştirilmez. Bu açık
   izolasyon beklentisi gerçek filesystem testleriyle sabitlendi.

İlgili ana dosyalar:

- `src/shared/barkos/decision-inbox-contract.ts`
- `src/shared/barkos/side-effect-approval.ts`
- `src/main/barkos/side-effect-classification.ts`
- `src/main/barkos/side-effect-tool-identity.ts`
- `src/main/barkos/side-effect-approval-controller.ts`
- `src/main/barkos/side-effect-approval-context.ts`
- `src/shared/barkos/side-effect-capable-agent.ts`
- `src/shared/barkos/paired-side-effect-approval.ts`
- `src/main/barkos/paired-side-effect-approval-broker.ts`
- `src/main/barkos/paired-side-effect-approval-client.ts`
- `src/main/barkos/paired-side-effect-approval-context.ts`
- `src/main/runtime/rpc/methods/barkos-side-effect-approval.ts`
- `src/main/barkos/decision-inbox-store.ts`
- `src/main/agent-hooks/server.ts`
- `src/shared/agent-hook-side-effect-relay.ts`
- `src/relay/agent-hook-side-effect-evaluator.ts`
- `src/relay/agent-hook-server.ts`
- `src/main/agent-hooks/wsl-hook-relay-manager.ts`
- `src/main/agent-hooks/windows-agent-hook-curl-command.ts`
- `src/main/claude/managed-hook-script.ts`
- `src/main/codex/managed-hook-script.ts`
- `src/main/droid/managed-hook-script.ts`
- `src/main/gemini/managed-hook-script.ts`
- `src/main/gemini/hook-service.ts`
- `src/main/ipc/barkos-decision-inbox.ts`
- `src/renderer/src/store/slices/barkos-decision-inbox.ts`
- `src/renderer/src/components/barkos-company/use-barkos-decision-inbox.ts`
- `src/renderer/src/components/barkos-company/BarkosDecisionRequestCard.tsx`

### M2 — Delegasyon, gerçek çalıştırma ve kanıt

- Work-ledger şeması v5'e yükseltildi.
- Hedef, plan, görev, atama, dispatch, kanıt ve onay kapısı sözleşmeleri eklendi.
- Bağımlılık DAG'i, referans bütünlüğü, iyimser revision kontrolü, azami deneme
  sayısı ve tek aktif atama kuralları uygulanıyor.
- Yetenek, yük, uygunluk ve hedef ortamına göre deterministik işçi seçimi var;
  seçimin gerekçesi kaydediliyor.
- BarkOS plan ve görevleri Orca Run/Task/Dispatch kayıtlarına bağlanıyor.
- Dispatch iki aşamalı: önce `prepared` kayıt kalıcılaştırılıyor, sonra gerçek
  Orca yan etkisi çağrılıyor, ardından dönen kimlikler kaydediliyor.
- Zaman aşımı veya belirsiz yan etki durumunda kör otomatik tekrar yapılmıyor;
  authoritative ledger yeniden yükleniyor.
- Terminal kuyruğu ve Git durumu yalnızca kullanıcı kanıt toplama ekranını
  açtığında, bağlı tam hedef üzerinden okunuyor.
- Test sonuçları elle kaydedilebildiği gibi yalnız `Run test` kullanıcı eylemiyle
  exact aktif Dispatch workspace'i cwd alınarak çalıştırılıp bounded kanıta dönüştürülebiliyor;
  kanıt ekranını açmak veya göndermek komut çalıştırmıyor.
- PNG, JPEG, GIF ve WebP kanıtları kullanıcı seçimiyle ekleniyor. Ana süreç
  boyut/piksel sınırlarını doğruluyor, SHA-256 hash alıyor ve özel,
  content-addressed BarkOS depolamasına kopyalıyor.
- Kanıt gönderme görevi doğrudan tamamlamıyor; kullanıcı kabulü görevi
  tamamlıyor ve bağımlı işleri açıyor. Ret, işi yeniden hazır hâle getiriyor.

## Son tamamlanan davranış: kullanıcı onaylı test kanıtı

1. Test çalıştırma yalnız kanıt formundaki açık `Run test` eylemiyle başlıyor;
   dialog açılması, kanıt toplama veya submit hiçbir komut çalıştırmıyor.
2. Main process çalıştırmadan hemen önce running Dispatch, dispatched Assignment,
   exact Task/worker, created worker-session, workspace ve execution-host zincirini
   durable kayıtlardan yeniden doğruluyor. Uyuşmazlık fail-closed kalıyor.
3. Komut shell'e verilmeden binary ve argv olarak ayrılıyor. Çok satırlı, shell
   operatörlü, validation dışı, install/publish ve `--fix`/`--write`/snapshot
   update biçimleri reddediliyor.
4. Yerel ve WSL çalışma Orca'nın mevcut runtime-aware sabit-binary runner'ını;
   direct SSH çalışma exact SSH target ve ayrı `barkos-test-evidence` operation
   lane'ini kullanıyor. Her ikisinde de etkileşimli Git credential istemleri kapalı.
5. Çalışma azami beş dakika ve 64 KiB birleşik çıktı ile sınırlı. ANSI/control
   dizileri temizleniyor, credential-benzeri çıktı main process'te sansürleniyor
   ve renderer'a en çok 1.000 karakterlik sonuç özeti dönüyor.
6. Dialog kapatılırsa veya renderer yok edilirse exact çalışma iptal ediliyor.
   Aynı renderer/Dispatch için yeni çalışma önceki controller'ı sonlandırıyor.
7. Sonuç yalnız passed/failed, komut, bounded özet ve süre alanlarını dolduruyor;
   görevi tamamlamıyor. Kullanıcının kanıtı ayrıca submit etmesi ve sonra kabul
   etmesi gerekiyor.
8. Paired-runtime çalışma yalnız host `barkos.test-evidence-execution.v1`
   capability'sini yayınlarsa açılıyor. Desktop pairing revision'ı pinliyor;
   capability ve runtime kimliği kontrolünü komutla aynı dedicated E2EE sokette
   yapıyor. Preflight reddedilirse komut frame'i hiç gönderilmiyor; aradaki host
   restart aynı soketi kapattığı için yürütme başlamıyor ve final response kimliği
   ayrıca preflight ile eşleşmek zorunda. Host authenticated owner cihazı, canlı
   PTY incarnation/launch token, exact Run/Task/Dispatch, tab ve workspace kökünü
   yeniden doğruluyor ve komutu tekrar allowlist'ten geçiriyor. Dialog/renderer
   kapanışı veya timeout soketi kapatarak host child process'ini de abort ediyor.
   Eski host, stale authority ve paired host içindeki nested SSH/WSL workspace
   manuel kayıtla fail-closed kalıyor. Web istemcisi desktop komutu çalıştıramıyor.
9. Validation biçimli project script'leri kullanıcının normal OS yetkileriyle
   çalışır; bu nedenle UI bu sınırı açıkça bildirir. BarkOS bunu sandbox olarak
   göstermiyor.

İlgili ana dosyalar:

- `src/shared/barkos/test-evidence-run.ts`
- `src/main/barkos/test-evidence-runner.ts`
- `src/main/barkos/paired-test-evidence-client.ts`
- `src/main/barkos/test-evidence-command-executor.ts`
- `src/main/ipc/barkos-work-ledger.ts`
- `src/main/ipc/runtime-environment-transport-routing.ts`
- `src/main/runtime/rpc/methods/barkos-test-evidence.ts`
- `src/main/runtime/barkos-paired-test-evidence-transport.integration.test.ts`
- `src/preload/api/barkos-work-ledger-api.ts`
- `src/renderer/src/components/barkos-company/use-barkos-evidence-submission.ts`
- `src/renderer/src/components/barkos-company/BarkosEvidenceSubmissionDialog.tsx`
- `src/renderer/src/components/barkos-company/BarkosTestEvidenceEditor.tsx`

## Son tamamlanan davranış: paired-runtime kullanım ve maliyet kanıtı

1. Additive `barkos.remote-usage-cost.v1` capability ve strict v1
   `barkos.usageCost.collect` RPC eklendi. İstek en fazla 1.000 benzersiz exact
   orchestration Dispatch id taşır; response yalnız bounded aggregate veya
   typed unavailable reason taşır.
2. RPC yalnız doğrulanmış `runtime` scoped paired device tarafından çağrılabilir.
   Host owner kimliğini request alanından almaz; transport context'indeki paired
   device kimliğine bağlar.
3. Host her Dispatch için bitmiş orchestration kaydını, canlı local PTY'yi,
   owner device'ı, terminal handle'ı, process incarnation'ı, launch-token hash'i,
   Claude/Codex provider'ını, workspace'i ve host hook'undan tek provider session
   kimliğini yeniden doğrular.
4. Direct SSH, WSL ve paired host içindeki nested SSH/WSL bu v1 kapsamına alınmadı.
   Owner, süreç, token, session, workspace veya zaman aralığı belirsizse ölçüm
   fail-closed `unavailable` olur.
5. Host provider store'u yalnız kullanıcının mevcut `Sync usage records`
   tıklamasıyla tarar. Aynı provider requested batch için bir kez refresh edilir;
   ortak session iki Dispatch'e bölünmez. Provider'a ağ isteği veya background
   poll eklenmedi.
6. Wire ham transcript, rollout, provider dosya yolu, credential, tool input veya
   renderer'ın provider-session iddiasını taşımaz. Scan hataları da yalnız reason
   code olarak döner; ham host hata/path metni desktop ledger'a alınmaz.
7. Desktop önce capability ve status runtime id'sini doğrular, response envelope
   ve payload runtime id'sini aynı hosta pinler, sonra Dispatch/workspace/provider
   eşleşmesini tekrar kontrol eder. Eksik kayıt veya host restart bütün ilgili
   kanıtı reddeder.
8. Desktop local Claude/Codex store'ları artık yalnız `executionHostId=local`
   Dispatch'ler için taranır. Remote iş hiçbir zaman desktop loglarıyla
   etiketlenmez. Capability ilan etmeyen eski paired host mevcut güvenli
   `remote-usage-unavailable` davranışında kalır.
9. Local durable ledger şeması ve renderer/preload sözleşmesi değişmedi; remote
   aggregate aynı strict kayda map edilir. Düğme metni yeni kapsamı doğru anlatmak
   için `Sync usage records` oldu.

İlgili ana dosyalar:

- `src/shared/barkos/remote-usage-cost.ts`
- `src/shared/protocol-version.ts`
- `src/main/barkos/remote-usage-cost-collector.ts`
- `src/main/barkos/remote-usage-cost-client.ts`
- `src/main/barkos/usage-cost-collector.ts`
- `src/main/runtime/rpc/methods/barkos-usage-cost.ts`
- `src/main/runtime/orca-runtime.ts`
- `src/main/ipc/barkos-usage-cost.ts`
- `src/renderer/src/components/barkos-company/BarkosUsageCost.tsx`

## Son tamamlanan davranış: iş verildiğinde ajan gerçekten başlıyor

Kullanıcının beklentisi "şirkette ajana ne işi verirsem gidip onu yapsın" olarak
uygulandı:

1. `Assign and start`, görev Orca'ya bağlanmamışsa önce Run ve Task kayıtlarını
   hazırlar.
2. Uygun işçiyi seçer ve atamayı kalıcılaştırır.
3. Düşük/orta riskli görevde aynı kullanıcı eylemi içinde görevin tam
   talimatını seçili, tanınmış ve canlı ajan terminaline dispatch eder.
4. İşçi henüz hazır değilse atama kaybolmaz; açık bir `Start work` tekrarı
   sunulur.
5. Yüksek/kritik riskli görevler, planlayıcıdaki opsiyonel kutudan bağımsız
   olarak daima kalıcı bir onay kapısında durur.
6. `Approve and start`, kapıyı onaylar ve görevi hemen gerçek ajana dispatch
   eder.
7. İşçi başlangıç brifingi, BarkOS `TASK` bloğu geldiğinde gereksiz ikinci bir
   onay istemeden işe başlamasını söyler.

İlgili ana dosyalar:

- `src/shared/barkos/task-authority.ts`
- `src/shared/barkos/work-ledger.ts`
- `src/shared/barkos/work-ledger-migrations.ts`
- `src/renderer/src/components/barkos-company/use-barkos-orchestration-actions.ts`
- `src/renderer/src/components/barkos-company/BarkosTaskAuthorityReview.tsx`
- `src/renderer/src/components/barkos-company/BarkosWorkerAuthorityReview.tsx`
- `src/renderer/src/lib/barkos-orchestration-runtime.ts`
- `src/renderer/src/lib/launch-barkos-worker-session.ts`

## Yetki modeli ve dürüst güvenlik sınırı

İşçi başlatma ekranı, ajanın gerçek argüman ve environment ayarlarından etkili
sağlayıcı izin modunu çıkarıp kullanıcıya gösteriyor. Full/yolo erişimde şu
gerçek açıkça belirtiliyor: ajan, seçili makinede kullanıcının işletim sistemi
hesabı altında dosya okuyup yazabilir, komut çalıştırabilir, ağı kullanabilir ve
süreç başlatabilir.

BarkOS rol ve onay kuralları genel olarak işletme politikasıdır; evrensel bir
işletim sistemi sandbox'ı değildir. Desktop local, direct SSH, WSL ve
paired-runtime Claude/Codex/Droid için aşağıda belgelenen exact
`PreToolUse` sınırı gerçek bir yürütme kapısıdır; diğer provider ve
desteklenmeyen remote ortamları kapsayan genel bir interception katmanı henüz
yoktur.
Güvenilmeyen ya da çok güçlü çalışmalar için gerçek sınır ayrı worktree,
çalışma alanı, kullanıcı hesabı, container/VM veya uzak host olmalıdır. Üründe
bunun aksini iddia etme.

## Work-ledger v5 migrasyonu

- Güncel sürüm `BARKOS_WORK_LEDGER_SCHEMA_VERSION = 5`.
- Migrasyon zinciri v0 → v1 → v2 → v3 → v4 → v5 olarak ardışık ve testli.
- Bekleyen yüksek/kritik riskli işlerde zorunlu dispatch onay politikası kalıcı
  hâle getiriliyor.
- Eski fakat henüz dispatch edilmemiş onaylı yüksek riskli atamalar için
  bekleyen dispatch kapısı oluşturuluyor.
- Tarihî olarak dispatch edilmiş veya tamamlanmış işlere sahte onay kaydı
  üretilmiyor.
- v4 eski dispatch kayıtlarına `memoryDelivery: null` ekliyor; geçmiş işlere
  yapılmamış bir hafıza teslimatı veya sahte makbuz üretmiyor.
- v5 eski dispatch kayıtlarına `stop: null` ekliyor; geçmiş işlere yapılmamış
  Dispatch stop veya PTY kill kanıtı üretmiyor.

## Doğrulama sonucu

Bu çalışma dilimi sonunda aşağıdaki doğrulamalar başarıyla geçti:

- Paired-runtime test kanıtı capability/client/host-authority/RPC/transport
  odak paketi, önceki test-evidence regresyonlarıyla birlikte: **10 test dosyası,
  74 test geçti**. Gerçek E2EE WebSocket zincirinde capability yokken command
  frame'inin gönderilmediği, client iptalinin host execution signal'ını abort
  ettiği ve status preflight sonrasındaki host restart'ın komutu başlamadan
  kestiği doğrulandı. Pairing revision/runtime pinleme, authenticated owner +
  canlı Dispatch/PTY/workspace doğrulaması, ikinci allowlist, 5 dakika/64 KiB
  sınırı ve redaction da kapsanıyor.
- Kullanıcı onaylı test kanıtı sözleşme/runner/IPC/SSH/preload/React odak paketi:
  **8 test dosyası, 60 test geçti**. Shell/write/workspace-override reddi, exact Dispatch authority,
  local/SSH routing, credential redaction, iptal ve web fail-closed davranışı
  doğrulandı.
- Güncel `pnpm run typecheck`: node, cli ve web typecheck geçti.
- Paired-runtime Droid v2 authority dilimi: **11 test dosyasında 113 test
  geçti**. Yalnız v1 ilan eden eski hostta subscribe/launch yapılmadığı, v2
  request/resolution sürümünün owner ve pending request'e bağlandığı, managed
  hook yokluğunda PTY oluşmadığı ve web host create isteğinin v2 taşıdığı
  doğrulandı.
- BarkOS paket/CLI kimliği dilimi: **14 test dosyasında 194 test geçti, 2 test
  platform koşuluyla atlandı**. Builder kimlikleri, packaged CLI varlıkları,
  Windows native launcher sözleşmesi, Linux smoke yolları ve orchestration CLI
  adı kapsandı.
- M5 Gemini native/direct-SSH/WSL `BeforeTool` dilimi: **16 test dosyasında 199
  test geçti, 1 test platform koşuluyla atlandı**. Provider-specific karar JSON'u,
  transport kaybında fail-closed script, disabled hook readiness, exact
  provider/Dispatch/SSH/WSL kimliği ve fiziksel launch guard doğrulandı.
- Paired Gemini v3 ve mevcut Gemini sınırları: **17 test dosyasında 1.331 test
  geçti, 2 test platform koşuluyla atlandı**. v1/v2 geriye uyumluluk, v3
  stream/resolve, exact owner/Dispatch kimliği, Gemini karar şeması ve host
  managed-hook launch guard doğrulandı.
- Paired-runtime usage/cost v1 odak paketi: **8 test dosyasında 1.187 test geçti,
  1 test platform koşuluyla atlandı**. Strict wire parser, authenticated owner,
  exact host PTY/process/Dispatch/session kanıtı, capability/runtime pinning,
  aggregate-only response, local-scan izolasyonu ve eski host fallback'i
  doğrulandı. Node, CLI ve web typecheck geçti.
- Linux BarkOS CLI fallback/shim, Codex absolute preflight ve managed hook
  beklentileri: **6 test dosyasında 71 test geçti, 7 test koşula bağlı atlandı**.
  BarkOS'un `orca` komutu üretmediği ve kullanıcı `orca` dosyasını değiştirmediği
  gerçek filesystem sınırında doğrulandı.
- Nihai tam Vitest regresyonu: **5.957 test dosyası geçti, 33 dosya koşula bağlı
  atlandı; 55.133 test geçti, 183 test atlandı, hata yok**.
- Dört worker ile güncel tam Vitest regresyonu: **5.982 test dosyasının 5.949'u
  geçti, 33'ü koşula bağlı atlandı; 55.088 test geçti, 183 test atlandı, hata
  yok**.
- Güncel tam `pnpm run lint` kapısı; native/type-aware audit, reliability,
  max-lines, skill manifest ve localization kontrolleriyle geçti.
- Güncel changed-scope React Doctor kontrolü **0 blocking error** ile geçti.
  Test-evidence dilimine ait üç uyarı giderildi; branch'in diğer mevcut BarkOS
  değişikliklerinde 106 non-blocking uyarı raporlanıyor.

- BarkOS, agent-launch, provider-capacity, Codex resume/failover ve Orca dispatch
  regresyon paketi: **77 test dosyası, 386 test geçti**.
- Typed provider-failure diliminin exact-turn, main/relay poll, renderer store ve
  recovery kapısı paketi: **12 test dosyası, 132 test geçti**.
- Güncel BarkOS domain, main IPC, renderer ve store regresyon paketi: **77 test
  dosyası, 330 test geçti**.
- M5 control-policy sözleşme/store/IPC/preload/store/UI/failover odak paketi:
  **9 test dosyası, 29 test geçti**. Assignment, Dispatch adapter, Company ve
  work-ledger regresyon paketi ayrıca **4 dosya, 33 test geçti**.
- M5 authoritative stop domain/migration/hook/UI odak paketi: **5 test dosyası,
  39 test geçti**.
- M5 reassignment ve Live Office odak paketi: **7 test dosyası, 51 test geçti**.
- M5 provider-derived usage/cost odak paketi: **7 test dosyası, 18 test geçti**;
  güncel geniş BarkOS domain/main/IPC/renderer regresyonu aşağıdaki yeni Office
  testleriyle birlikte **86 test dosyası, 351 test geçti**.
- M5 Live Office presentation/accessibility odak paketi: **3 test dosyası, 7
  test geçti**. Semantic worker/work listesi, strict preference fallback ve
  compact/off round-trip doğrulandı.
- M5 local Claude side-effect enforcement odak paketi: **14 test dosyası, 128
  test geçti, 5 test koşula bağlı atlandı**. Sınıflandırma, exact kimlik,
  fail-closed persistence/transport, tek kullanımlık onay ve renderer karar
  kartı doğrulandı.
- M5 local Codex side-effect enforcement son odak paketi: **10 test dosyası, 79
  test geçti, 8 test koşula bağlı atlandı**. Structured deny, nötr onay retry'ı,
  provider/Dispatch/launch-token kimliği, Windows/POSIX/WSL script üretimi ve
  normal Codex oturumlarının nötr davranışı doğrulandı.
- M5 native-host Droid side-effect enforcement odak paketi: **9 test dosyası,
  91 test geçti, 3 test koşula bağlı atlandı**. Factory `Execute`
  sınıflandırması, exact Dispatch kimliği, tek kullanımlık allow/deny,
  POSIX/Windows transport kaybı, local hook readiness ve paired-target launch reddi
  doğrulandı.
- Droid + hook server + PTY + relay regresyon paketi: **16 test dosyası, 165 test
  geçti, 3 test koşula bağlı atlandı**. `pnpm run typecheck`, tam `pnpm run lint`,
  relay/WSL bundle build'i, hedefli format ve `git diff --check` geçti.
- Droid direct-SSH/WSL capability dilimi: shared relay parser, main controller,
  renderer launch, trusted PTY/WSL readiness, SSH karar transport'u ve gerçek
  WSL relay bundle zinciri doğrulandı. Güncel odak turu **11 test dosyasında 138
  passed / 0 failed**; `pnpm run build:relay`, `pnpm run typecheck` ve tam lint
  kapısı geçti.
- M5 direct SSH/WSL side-effect enforcement paketi: sürümlü relay sözleşmesi,
  exact SSH/WSL transport kimliği, tek istemci sahipliği, managed-hook spawn
  guard'ı, eski relay 204 davranışı ve local regresyonları doğrulandı. Odak paket
  **15 test dosyasında 180 passed / 2 skipped / 0 failed**; son tam regresyon
  **5970 test dosyasında 55.010 passed / 183 skipped / 0 failed**.
- BarkOS kurulum ikonu ve paired-runtime approval kanalı odak paketi: **16 test
  dosyasında 156 passed / 0 failed**. Güncel tam regresyon **5976 test dosyasında
  55.034 passed / 183 skipped / 0 failed**.
- Relay ve WSL relay bundle'ları Linux/macOS/Windows x64/arm64 hedefleri için
  yeniden üretildi; `pnpm run build:relay` geçti.
- `v1.4.184` kararlı sürümüne karşı eski/yeni terminal wire uyumluluk paketi:
  **5/5 test geçti**.
- Tam `pnpm test` regresyonu: **5984 test dosyası; 55.103 test geçti, 183 test
  koşula bağlı atlandı, hata yok**.
- `pnpm run typecheck`: node, cli ve web typecheck geçti.
- Tam `pnpm run lint` kapısı; native/type-aware audit, reliability gate,
  max-lines ratchet ve yerelleştirme kontrolleriyle geçti.
- Yerelleştirme catalog/extraction/coverage kontrolleri geçti.
- Değişen React dosyaları için kalite kontrolü geçti.
- Değişen/yeni 111 çalışma ağacı girdisinde yeni kod kalitesi bulgusu: **0**.
- Type-aware yeni bulgu: **0**.
- React Doctor yeni bulgu: **0**. Rapordaki 103 toplam uyarı mevcut baseline
  uyarılarıydı; BarkOS değişiklikleri yeni uyarı eklemedi.
- Electron headless E2E `tests/e2e/barkos-company.spec.ts`: **1/1 geçti**.
  Usage & cost sekmesi, fatura olmayan tahmin açıklaması, manuel local sync ve
  durable ledger revision aynı gerçek Electron sınırında doğrulandı. Aynı test
  Live Office sekme/menü klavye kullanımını, compact ve no-animation modlarını,
  computed animation sonucunu ve reload kalıcılığını da doğruladı. Main-owned
  side-effect talebinin serbest metin olmadan görünmesi, açık `Reject` eylemi ve
  durable `rejected` sonucu da gerçek preload/IPC/store zincirinden geçti.
- Electron Codex failover başarı, dört fault-injection ve gerçek süreç yeniden
  başlatma paketi: **6/6 geçti**. Company ve yeni Control kalıcılık
  regresyonlarıyla birleşik koşu **8/8 geçti**.
- Electron authoritative stop, confirmed-stop reassignment ve beş
  fault-injection matrisi: **7/7 doğrulandı**. Intent, Dispatch stop proof, PTY
  kill proof, final cancellation, farklı worker seçimi ve fresh approval gate
  gerçek renderer/preload IPC/main-store zincirinde sınandı. Live Office exact
  hook aktivitesi de aynı Electron akışında doğrulandı.
- E2E; Decisions, Memory ve Capacity sekmelerinin kalıcı IPC sınırlarından
  yüklenmesini; manuel recovery için uygun local Codex Dispatch'in reload
  sonrasında görünmesini; durable history ve kullanıcı dostu resume etiketini;
  proposal scope/confidence düzenleme ile promotion'ı; görünür
  `Full agent access` uyarısını ve worker-session kaydının ikinci renderer reload
  sonrasında `Remote launch identity unconfirmed` olarak geri gelmesini
  doğruladı. Control E2E ayrıca üç limitin kaydını, revision artışını, pause'u ve
  renderer reload sonrası durable read-back'i doğruladı.
- `git diff --check` geçti.
- Testler gerçek bir ajan/sağlayıcı görevi dispatch etmedi.

Bloklamayan mevcut notlar:

- WSL live-hook fixture'ı platform güvenli `/bin/sh` executable override'ına
  geçirildi ve tam regresyonda geçti.
- E2E sırasında görülen `/usr/local/bin/orca-dev` symlink yazma izni uyarısı
  paketleme yolunda çözüldü; macOS build'i global dev CLI kurulumunu atlıyor.
- Mevcut CSS `::highlight` optimizer uyarıları çıktı; BarkOS akışını
  engellemedi.

## Normal sistem performansı

BarkOS şu ana kadar şunları eklemedi:

- login item;
- daemon veya sürekli arka plan servisi;
- scheduled job;
- browser extension;
- uygulama kapalıyken çalışan watcher;
- kullanıcı eylemi olmadan sağlayıcı çağrısı veya kota tüketimi.

Bu nedenle BarkOS/Orca başlatılmadığında normal web gezintisinde BarkOS kaynaklı
yavaşlama beklenmez. Uygulama açıkken gerçek terminal, Git ve ajan işleri
yalnızca ilgili kullanıcı eylemleriyle başlar. Company sayfası açık ve aktif bir
dispatch varsa karar mesajları için iki saniyelik read-only yerel/runtime sorgusu
çalışır; sayfadan çıkınca durur ve LLM/provider çağrısı yapmaz.
Live Office bunun üzerine yeni timer veya sorgu eklemez; yalnız mevcut renderer
store güncellendiğinde durable ledger ve in-memory hook snapshot'ını yeniden
hesaplar.
Usage & cost açılışta yalnız küçük local ledger'ı okur. Claude/Codex transcript
ve rollout taraması ancak kullanıcı `Sync usage records` düğmesine bastığında
işi yürüten local veya capability-capable paired native hostta bir kez çalışır;
provider ağına çıkmaz ve sürekli watcher kurmaz. Eski paired host, direct SSH ve
WSL için tarama başlamaz.
Aktif bir Codex turn'ü sırasında hook sunucusu rollout dosyasının yalnız eklenen
baytlarını saniyede bir, sınırlı biçimde kontrol eder; exact completion gelince
durur ve timer süreç yaşamını uzatmaz. Uygulama kapalıyken bu poll da yoktur.

## Ara verilirken süreç durumu

19 Ağustos 2026 tarihli son kontrolde açık Vite, Electron dev, Playwright,
Vitest veya BarkOS E2E süreci bulunmadı. Son Electron E2E geçici çalışma alanı
temizlendi. Bu yüzden ayrıca öldürülecek bir geliştirme/test süreci yoktu.

Yalnızca bu konuşmayı ve çalışma oturumunu taşıyan ChatGPT/Codex kernel süreci
açıktı. Onu kapatmak aktif oturumu aniden sonlandıracağı için dokunulmadı;
oturum/uygulama kapatıldığında kendisi kapanır. Normal Orca veya diğer kullanıcı
uygulamalarına dokunulmadı.

## 19 Ağustos 2026 güncel checkpoint

- M5 desktop local, direct SSH, WSL ve paired-runtime Claude/Codex gerçek tool
  yan-etki kapıları tamamlandı.
  Destructive, external-mutation ve budgeted eylemler exact Dispatch kimliğiyle
  ilk denemede durur; açık onay yalnız aynı input'un tek retry'ında atomik
  tüketilir.
- Factory Droid native host, direct SSH, WSL ve v2-capable paired runtime'da aynı
  exact Decision Inbox sınırına eklendi. Managed hook veya doğru v2 owner kanıtı
  eksikse ajan süreci başlatılmaz.
- Gemini native host, direct SSH, WSL ve v3-capable paired runtime'da aynı exact
  Decision Inbox sınırına `BeforeTool` sözleşmesiyle eklendi. Eski paired hostlar
  capability yokluğunda fail-closed kalır.
- Paired-runtime native Claude/Codex usage/cost kanıtı additive v1 capability ile
  eklendi. Authenticated owner ve exact bitmiş host Dispatch/PTY/process/session
  kanıtı olmadan ölçüm yapılmaz; desktop local logları remote işe yazılmaz.
- Ham tool input ve launch token diske yazılmaz. Persistence veya BarkOS hook
  transport belirsizliği fail-closed kalır.
- Decision Inbox main-owned talepleri aktif Dispatch sırasında iki saniyede bir
  salt-okunur çeker; uygulama kapalıyken süreç veya provider işi oluşturmaz.
- Direct SSH/WSL sürümlü relay karar sözleşmesine ve pre-spawn hook guard'ına;
  paired runtime ise authenticated owner-only E2EE reverse karar kanalına ve
  exact host-side PTY/Dispatch kanıtına sahiptir. Paired runtime içindeki nested
  SSH/WSL zinciri de exact connection kimliğiyle aynı kanala bağlıdır. Droid v2,
  Gemini ayrı v3 capability ile paired kanala dahil edildi.
  OpenClaude ve diğer provider'lar henüz bu korumaya sahip değildir.
- BarkOS paket/bundle/protokol/CLI/güncelleme kimlikleri Orca'dan ayrıldı.
  Mevcut Orca kurulumu, `orca` komutu, `orca:` scheme'i, user data ve update
  kanalı BarkOS tarafından sahiplenilmez.
- BarkOS master logosundan `.icns`, altı-frame `.ico`, build/runtime PNG
  varlıkları üretildi ve kurulum hedeflerine yerleştirildi.
- Yerel macOS arm64 installer kanıtı tamamlandı:
  - DMG: `dist/barkos-macos-arm64.dmg` (**328.265.138 byte**), SHA-256
    `c42983f82602529ccc1072b7124015ce2cc9b6093281650e6d2b7785ec815c74`.
  - ZIP: `dist/BarkOS-1.4.178-rc.2.local.1787095004585.7ae6aedc02db-arm64-mac.zip`
    (**327.409.069 byte**), SHA-256
    `72a6d3b497956b2b392f7915fab7ff3597ff4b0dde95352b2b17c79097742be5`.
  - Sürüm `1.4.178-rc.2.local.1787095004585.7ae6aedc02db`; uygulama ve DMG
    içindeki kopya `codesign --verify --deep --strict` ile geçti, DMG checksum'u
    geçerli ve paketli `barkos --help` çalıştı.
  - Yerel paket ücretsiz ad-hoc imzalıdır ve notarize edilmemiştir. M8 genel
    dağıtım imzası/notarizasyonu tamamlanmış sayılmaz.
  - Yerel `build:mac` artık yalnız host mimarisini üretir, global `orca-dev`
    symlink yazmaz, eski macOS/Linux Orca launcher kaynaklarını paketlemez ve
    paketli yardım metnini BarkOS olarak sunar.
  - İlk denemelerin eski ZIP/DMG dosyaları kaldırıldı; bunlar yeniden üretilebilir
    build artifact'larıydı. Önceki BarkOS paketi daha sonra
    `/Applications/BarkOS.app` altına kuruldu; Orca kurulumuna dokunulmadı.
- Son doğrulama: typecheck ve tam lint geçti; tam test paketi **5.957 dosya
  passed / 33 dosya skipped; 55.133 test passed / 183 skipped / 0 failed**.
  Paired usage/cost odak paketi **1.187 passed / 1 skipped**, Linux CLI/hook
  paketi **71 passed / 7 skipped**. Bu dilimde yalnız Usage & cost düğme metni
  düzeltildi; layout veya görsel stil değişmedi. Önceki Company E2E **1/1**
  sonucu geçerlidir.
- Çalışma ağacındaki commitlenmemiş değişiklikler bilinçlidir; yeni oturumda
  reset, clean veya checkout yapılmadan korunmalıdır.

## BarkOS yüzeyi, Türkçe ve canlı ofis checkpoint'i

- Ana pencere, web istemcisi, ajan panosu, yardımcı pencereler, macOS durum
  menüsü, uygulama menüsü, bildirimler ve hata istemlerindeki görünür ürün adı
  BarkOS olarak değiştirildi. Paketli HTML başlıkları sırasıyla `BarkOS`,
  `BarkOS Web` ve `BarkOS Ajan Panosu` olarak doğrulandı.
- Uygulama dili olarak Türkçe eklendi. Sistem dili Türkçe olan mevcut profildeki
  `uiLanguage: system` ayarı yeni catalog'u otomatik seçer. Ana kenar çubuğu,
  macOS uygulama/durum menüleri, şirket kurulum-kadro ekranı ve Canlı Ofis
  Türkçeleştirildi.
- Türkçe catalog şu anda **394/13.749** anahtarı kapsıyor. Kapsanmayan alanlar
  BarkOS olarak yeniden markalanmış İngilizce catalog'a düşüyor; bu nedenle
  uygulamanın tamamının Türkçe olduğu henüz iddia edilmemeli.
- Canlı Ofis'e gerçek Worker/Assignment/Dispatch/hook durumundan beslenen,
  üstten görünümlü hareketli masa katı eklendi. Sahte çalışan aktivitesi,
  provider sorgusu veya yeni timer eklenmedi. Sistem reduced-motion tercihi ve
  açık `Animasyon yok` seçeneği hareketi kapatıyor.
- Dil değişikliği artık çalışan native macOS durum menüsünü de yeniden kuruyor;
  uygulama yeniden başlatılmadan `BarkOS'u Aç`, `Ayarlar`,
  `Güncellemeleri Denetle...` ve `BarkOS'tan Çık` etiketleri uygulanıyor.
- Doğrulama: odaklı Vitest paketi **168 geçti / 1 skipped**, menü+tray paketi
  **54 geçti / 1 skipped**, BarkOS Company Electron E2E **1/1**, Türkçe kabuk ve
  native menü Electron E2E **1/1** geçti. Typecheck, localization catalog,
  localization extraction, max-lines ratchet, hedefli oxlint ve
  `git diff --check` geçti.
- Yeni yerel macOS arm64 paketi üretildi:
  - DMG: `dist/barkos-macos-arm64.dmg` (**328.321.975 byte**), SHA-256
    `e5e1e17a7dfa1f1bd273f8e3884b352c13b234b5c0955e5b4f3d1bd8237b6a12`.
  - ZIP: `dist/BarkOS-1.4.178-rc.2.local.1787097023868.7ae6aedc02db-arm64-mac.zip`
    (**327.450.039 byte**), SHA-256
    `4178c84778b2b24f06c8d034021ddccf87228666e25f60fd65a2377125e4514d`.
  - Paket sürümü `1.4.178-rc.2.local.1787097023868.7ae6aedc02db`, bundle kimliği
    `com.barkos.desktop`, executable/display name `BarkOS`.
  - `codesign --verify --deep --strict` ve `hdiutil verify` geçti. Paket ad-hoc
    imzalı ve notarize edilmemiştir.
- Yeni paket çalışan `/Applications/BarkOS.app` üzerine otomatik kurulmadı.
  Eski uygulama kapatılıp yeni DMG ile değiştirilene kadar ekranda eski metinler
  görülebilir.

## 19 Ağustos 2026 son ürünleştirme checkpoint'i

Bu bölüm, yukarıdaki eski paket ve Türkçe kapsam sayılarını geçersiz kılan en
güncel kayıttır.

- İlk açılıştaki miras onboarding/CLI tanıtımı otomatik olarak gösterilmiyor.
  Yeni profilde BarkOS doğrudan `Şirketinizi kurun` ekranına gidiyor; şirket adı,
  misyon ve baş ajan alınarak kalıcı şirket oluşturuluyor.
- BarkOS Mobil ekranındaki upstream TestFlight, App Store, APK ve QR hedefleri
  kaldırıldı. BarkOS'a ait gerçek App Store Connect/TestFlight yayını oluşana
  kadar sahte veya Orca'ya giden kurulum bağlantısı gösterilmiyor.
- Şirket çalışma alanının üstünde yatay piksel ofis bannerı var. Her masa gerçek
  Worker ile eşleşiyor; çalışma/bekleme/onay/blokaj hareketleri kalıcı
  Assignment/Dispatch ve canlı ajan hook durumundan türetiliyor. Sağ çalışan
  rayından ajan başlatılabiliyor ve yeni çalışan eklenebiliyor.
- Banner komut alanına proje veya değişiklik yazıldığında BarkOS dosya okuyucu
  rolünü ve çalışanını idempotent biçimde hazırlıyor, seçili klasörde inceleme
  görevini başlatıyor ve ardından baş ajan görevini hazır ediyor.
- Dosya okuyucunun raporu ile baş ajanın sürümlü staffing proposal çıktısı exact
  Task/Dispatch kimliğiyle doğrulanıyor. Baş ajan yeni rol, çalışan ve görevleri
  belirliyor; doğrulanan öneri kalıcı şirkete ve work-ledger'a uygulanıyor,
  bağımlılıklar ve risk kapıları korunarak ajan oturumları ve görevler
  başlatılıyor. Otomatik çalışan silme yok; kullanıcı kadroyu düzenleyebilir.
- Kararlar dahil ana ürün yüzeyi Türkçe. `tr.json` kapsamı **13.801/13.801** ve
  eksik anahtar sayısı **0**. Catalog, extraction ve coverage kapıları geçti.
- Görünür `Orca` markası titlebar, native menü/tray, ilk açılış, yardım/destek,
  mobil kurulum, gizlilik, eklenti adları ve şirket ekranlarından kaldırıldı.
  macOS tray simgesi BarkOS kalkan/taç şablonudur. Telemetri kapalıdır.
- Paket yardımcıları da `barkos-notification-status`,
  `barkos-keyboard-layout`, `BarkOS Computer Use.app` ve
  `barkos-computer-use-macos` adlarıyla üretiliyor. Kurulu CLI yalnız `barkos`.
- `orca-plugin.json`, `orca-marketplace.json`, `engines.orca`, bazı
  `out/shared/orca-*` modül adları ve `ORCA_*` environment anahtarları kullanıcı
  markası değil; eski masaüstü/SSH/paired-runtime istemcilerle wire ve disk
  uyumluluğunu bozmamak için iç sözleşme olarak korunuyor. Bunlar UI'da ürün adı
  olarak gösterilmiyor.
- Son Electron E2E paketi: BarkOS şirket kalıcılığı + Türkçe ilk açılış/native
  menü/canlı ofis/karar ekranı **2/2 geçti**. Görünür body metninde `Orca` ve
  seçili İngilizce ürün terimleri bulunmadığı ayrıca assert edildi.
- Son odaklı regresyonlarda macOS helper paketi **60/60**, tray/ikon/eklenti
  paketi **73/73**, BarkOS resmi eklenti kimliği paketi **67/67** geçti.
  `pnpm typecheck`, `git diff --check`, localization kontrolleri, packaged plugin
  doğrulaması ve `codesign --verify --deep --strict` geçti.
- Güncel Apple Silicon paketi:
  - DMG: `dist/barkos-macos-arm64.dmg` (**328.321.291 byte**), SHA-256
    `194207f340d4a586faa04118ed8ff78fe2aa6bb1bc233fe7d6fca7c7cc05f2fc`.
  - ZIP: `dist/BarkOS-1.4.178-rc.2.local.1787103520649.7ae6aedc02db-arm64-mac.zip`
    (**327.445.954 byte**), SHA-256
    `e794cde20cc6a1b983131ec94c42f2777e81e737c9e639c348432be50473bc00`.
  - Uygulama `BarkOS.app`, bundle kimliği `com.barkos.desktop`; ana executable
    ve helper bundle adları BarkOS. `hdiutil verify` ve ad-hoc imza doğrulaması
    geçti. Paket notarize edilmediği için yalnız bu makine/izin verilen özel
    kurulumlar içindir; genel dağıtım hazır sayılmaz.
- Uygulamanın kapalı olduğu durumda login item, daemon, scheduler veya BarkOS
  watcher'ı yoktur. Normal gezintiye BarkOS kaynaklı yeni yük eklenmez.

İlgili yeni ana dosyalar:

- `src/shared/barkos/project-intake.ts`
- `src/shared/barkos/staffing-proposal.ts`
- `src/renderer/src/lib/barkos-project-intake-runtime.ts`
- `src/renderer/src/components/barkos-company/use-barkos-project-automation.ts`
- `src/renderer/src/components/barkos-company/BarkosProjectCommandBar.tsx`
- `src/renderer/src/components/barkos-company/BarkosOfficeBanner.tsx`
- `src/renderer/src/components/barkos-company/use-barkos-live-office-projection.ts`
- `src/shared/barkos-visible-brand.ts`
- `resources/icon-source/barkos-master.png`
- `resources/tray/barkos-menu-barTemplate.svg`

## Yarın devam etme

Önce çalışma alanını ve doğru Node sürümünü hazırla:

```sh
cd /Users/muratkomurcu/Desktop/orca
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
node --version
git status --short
```

Geliştirme uygulamasını yeniden açmak için:

```sh
pnpm run dev
```

Hızlı doğrulama için:

```sh
pnpm run typecheck
pnpm exec vitest run --config config/vitest.config.ts \
  src/shared/barkos \
  src/main/barkos \
  src/main/ipc/barkos-*.test.ts \
  src/renderer/src/components/barkos-company \
  src/renderer/src/lib/barkos-*.test.ts \
  src/renderer/src/lib/ensure-barkos-worker-session.test.ts \
  src/renderer/src/lib/launch-barkos-worker-session.test.ts \
  src/renderer/src/store/slices/barkos-*.test.ts \
  src/renderer/src/web/web-preload-api-barkos-usage-cost.test.ts
```

Electron E2E tekrar gerektiğinde:

```sh
pnpm run ensure:electron-runtime
pnpm exec playwright test tests/e2e/barkos-company.spec.ts \
  tests/e2e/barkos-dispatch-stop.spec.ts \
  --config tests/playwright.config.ts \
  --project electron-headless \
  --workers=1
```

## Önerilen bir sonraki çalışma dilimi

M5 yürütme kontrolü, authoritative stop/kill, confirmed-stop reassignment,
read-only Live Office, local ve paired-native provider-derived usage/cost muhasebesi, Office
presentation/accessibility ve local/direct-SSH/WSL Claude-Codex-Droid-Gemini tool-boundary
dilimleri ile paired-runtime reverse approval kanalı tamamlandı.
Client-local durable pause ve
limitler yeni yan etkilerden önce uygulanıyor; mevcut running Dispatch yalnız
exact Dispatch ve PTY kanıtıyla iptal ediliyor; replacement ise yalnız bu kesin
sınırdan farklı bir işçiye geçiyor. Sıradaki dilim:

1. Diğer provider desteğini yalnız eşdeğer blocking pre-execution hook, exact
   provider/PTY/Dispatch kimliği ve fail-closed transport kanıtı varsa genişlet.
2. Usage & cost kapsamını direct SSH/WSL veya paired-host nested SSH/WSL'ye ancak
   ayrı execution-owner capability'si, exact remote session kanıtı ve aynı
   aggregate-only sözleşme kurulursa genişlet; aksi halde unavailable bırak.
3. Paired host restart sonrasında çalışan ajanı otomatik sahiplenmek istenirse,
   ephemeral owner bağını ancak imzalı, generation-fenced ve revocable durable
   bir receipt ile geri yükle; mevcut davranış güvenli biçimde relaunch ister.
4. Paired-runtime test kanıtının capability yokluğu, disconnect iptali ve host
   restart sınırları production E2EE WebSocket server/client zincirinde doğrulandı.
   İstenirse bunu ayrı iki-makine Electron fixture'ına yükselt; nested SSH/WSL
   desteğini ise ancak ayrı execution-owner capability'siyle aç.

## Referans belgeler

- `BARKOS_ROADMAP.md`: ürün aşamaları ve tamamlanan dilimler.
- `BARKOS_ARCHITECTURE.md`: ürün sınırı, domain modeli, dispatch ve kanıt
  mimarisi.
- `NOTICE-BARKOS.md`: fork ve atıf notları.

Yeni oturumda kısa komut olarak şunu söylemek yeterli:

> `BARKOS_HANDOFF.md` dosyasını oku ve önerilen bir sonraki çalışma diliminden
> devam et. Önce 19 Ağustos 2026 kapanış checkpoint'ini doğrula; mevcut
> commitlenmemiş değişiklikleri koru.

## 19 Ağustos 2026 piksel ofis ve gerçek proje zinciri checkpoint'i

Bu bölüm önceki “Türkçe anahtar kapsamı tamdır” ifadesini kalite bakımından
düzeltir: bütün anahtarların bulunması bütün çevirilerin doğru olduğu anlamına
gelmiyordu. Görünür bozuk çeviriler ekran ekran düzeltilmeye devam ediyor.

- Pixel Agents deposunun MIT lisanslı karakter, zemin, duvar ve halı varlıkları
  BarkOS içine alındı; atıf `NOTICE-BARKOS.md` içinde korunuyor. Aynı gerçek
  durum motoru artık hem yatay şirket bannerında hem de tam `Canlı ofis`
  sekmesinde çalışıyor. Eski gri masa çizimi tam ofis sekmesinden kaldırıldı.
- Piksel çalışanların `idle/walk/type/read/wait/approve/blocked/done` durumu
  gerçek Worker, oturum, görev ve Dispatch durumundan türetiliyor. Sahte çalışan
  veya rastgele “çalışıyor” verisi üretilmiyor.
- `Ekibi kur ve başlat` gerçek Electron uçtan uca testinde şu zincirle geçti:
  klasör seçimi → Atlas dosya okuyucu oturumu → analiz Task/Dispatch → kanıtlı
  `worker_done` → baş ajan planlama oturumu → doğrulanan staffing proposal →
  Nova çalışanı → gerçek terminal oturumu → uygulama Objective/Task/Dispatch.
- Aynı şirkete yeni çalışan kaydedilirken aktif work-ledger'ın yanlışlıkla
  sıfırlanması düzeltildi. Bu hata baş ajanın önerisi kabul edildiği halde
  uygulama görevinin başlamamasının doğrudan nedeniydi.
- Otonom `Proje:` ve `Uygulama:` hedeflerinde yarım kalan, materialize edilmiş
  hazır görevler uygulama açıkken otomatik yeniden deneniyor. Aynı hedef için
  eşzamanlı çift başlatma kilitli. Bekleyen veya reddedilen kullanıcı onayı
  otomatik kurtarma tarafından aşılmıyor.
- Ajan görev brifingi Türkçe ve eylem odaklıdır; işçiye gönderilen Task'ı hemen
  uygulaması söylenir. Eski “kullanıcı hedefini bekle” çelişkisi kaldırıldı.
- Çalışma alanı panosundaki yerleşik durumlar görünür yüzeyde `Yapılacak`,
  `Devam ediyor`, `İncelemede`, `Tamamlandı` olarak gösteriliyor. Bozuk
  tur sayacı, pano boş durumu ve pano ayarları Türkçeleştirildi.
- En son doğrulama:
  - Typecheck geçti.
  - İlgili birim paketleri: 44/44, 43/43, 43/43 ve 20/20 geçti.
  - Gerçek Electron proje zinciri + banner/tam ofis piksel sahne doğrulaması
    **1/1 geçti (46,7 sn)**.
  - React Doctor değişiklik taraması BarkOS dosyalarında yeni uyarı üretmedi;
    listelenen uyarılar önceden değişmiş mobil dosyalardadır.
- E2E derlemesi mağaza erişimi için
  `VITE_EXPOSE_STORE=true pnpm run build:electron-vite` ile alınmalıdır.
- Bu checkpoint'i içeren güncel Apple Silicon paketi üretildi:
  - DMG: `dist/barkos-macos-arm64.dmg` (**328.386.511 byte**), SHA-256
    `aa47260ac55ddd250524d83f3936726088222ae30a38266a157359c00a52c5ac`.
  - ZIP:
    `dist/BarkOS-1.4.178-rc.2.local.1787138732310.7ae6aedc02db-arm64-mac.zip`
    (**327.522.846 byte**), SHA-256
    `eeb101f7e2a5558b0380488e5411628c1d8a4abbd385960ac34cbecaa4d1635d`.
  - Paket sürümü `1.4.178-rc.2.local.1787138732310.7ae6aedc02db`; uygulama adı
    `BarkOS`, bundle kimliği `com.barkos.desktop`.
  - `codesign --verify --deep --strict` ve `hdiutil verify` geçti. Paket
    ad-hoc imzalı ve notarize edilmedi; özel kurulum içindir.

## 19 Ağustos 2026 kapanış notu — ürün ayrıştırma ve bozuk çalışma alanı

Kullanıcı doğrulamasında uygulamanın BarkOS adıyla açılmasına rağmen birçok
yüzeyin hâlâ Orca ürününe, `stablyai/orca` deposuna ve Orca'nın servislerine
bağlı olduğu görüldü. Yarınki çalışma yeni özellik eklemekten önce aşağıdaki
ayrıştırma ve çalışırlık borcunu kapatmalıdır.

### Kesin ürün kuralları

- Kullanıcıya görünen hiçbir başlık, açıklama, komut, kurulum adımı, menü,
  bağlantı, QR hedefi, hesap akışı veya yardım yüzeyi `Orca` dememeli.
- Kullanıcıya görünen CLI adı yalnız `barkos` olmalı. `orca` uyumluluk katmanı
  gerekiyorsa içeride ve görünmez kalmalı; yeni kurulum ona yönlendirilmemeli.
- Orca web bağlantıları BarkOS'a ait hedeflerle değiştirilmelidir. Ürün ve
  yardım sayfaları için hedef alan adı `muratkomurcu.com` olarak ele alınacak;
  gerçek route mevcut değilse çalışan BarkOS sayfası hazırlanmadan bağlantı
  gösterilmeyecek.
- Bir bağlantı veya düğme gerçekten çalışmıyorsa tamamlanmış gibi
  gösterilmeyecek. Yer tutucu entegrasyonlar gizlenecek ya da açık biçimde
  “henüz kullanılamıyor” olacak; sessizce Orca'ya düşmeyecek.
- GitHub/source-control varsayılanı `stablyai/orca` ve upstream Orca issue'ları
  olmamalı. Eklenen kullanıcının kendi klasörü/repository'si kaynak kabul
  edilmeli; upstream ancak ayrıca seçilen referans deposu olabilir.

### Ekranlarda doğrulanan hatalar

1. Kurulum 3/6 ekranında `Enable Orca CLI`, İngilizce adımlar ve Orca'ya ait
   metinler hâlâ görünüyor. Tamamı Türkçe BarkOS akışına dönüştürülecek.
2. Kurulum, `npx skills add https://github.com/stablyai/orca ...` komutunu
   öneriyor. Bu, eski ürünün skill paketini kuruyor. BarkOS CLI ve becerileri
   BarkOS'a ait yerel/bundled kaynaktan tek tıkla kurulmalı; dışarıdaki Orca
   deposu son kullanıcı kurulum bağımlılığı olmamalı.
3. `Orkestrasyon Becerisi` kartı “Hiçbir yükleme” durumunda kalıyor; `Kur`
   pasif görünüyor ve `Re-check` İngilizce. Kurulum düğmesi gerçek komutu
   çalıştırmalı, sonucu/hatayı göstermeli ve yeniden kontrol Türkçe olmalı.
4. BarkOS Hesap ekranında `Signing in...` takılı kalıyor; açıklamalarda
   İngilizce ve bozuk cümleler var. Giriş başarılı, hatalı, iptal ve zaman aşımı
   durumları uçtan uca çalışmalı. BarkOS hesabı sunucusu hazır değilse bu akış
   zorunlu veya tamamlanmış gibi sunulmamalı.
5. Git & Source Control ekranında İngilizce başlıklar kalmış; açıklamada `main`
   yüzlerce kez tekrarlanıyor. Kaynak metin/interpolasyon hatası düzeltilmeli,
   toggle etiketi ve tüm açıklamalar anlaşılır Türkçe olmalı.
6. GitHub issue görünümünde kolonlar ve `GÜNCELLEME` yazıları üst üste biniyor;
   satır içeriği kayboluyor. Tablo genişlik, scroll, satır yüksekliği ve boş
   veri durumları macOS arayüzünde görsel testle doğrulanmalı.
7. Proje sidebar'ında ve dosya ağacında hâlâ `orca` görünmesi yalnız marka
   metni değildir: diskteki klasör adı ve Git remote hâlâ upstream fork'u
   işaret ediyor. BarkOS'un bağımsız repo/remote/klasör geçişi planlanmalı;
   kaynak lisans atfı `NOTICE-BARKOS.md` içinde korunmalı.
8. Tamamlanmış görünen onboarding adımları gerçek yeteneği kanıtlamıyor.
   Adım ancak ilgili CLI, skill, hesap veya entegrasyon health-check'i başarıyla
   geçince tamamlanmış sayılmalı.
9. Paketlenmiş BarkOS terminalinde `codex` komutu `zsh: command not found:
codex` hatası veriyor. Makinedeki Codex yalnız VS Code eklentisinin özel
   dizininde bulunuyor; BarkOS terminalinin `PATH`'inde global/standalone CLI
   yok. Varsayılan ajan adımı bunu yanlışlıkla başarılı saymış. BarkOS;
   çalıştıracağı gerçek executable'ı resolve etmeli, terminale aynı `PATH`'i
   aktarmalı veya kullanıcı onayıyla resmî standalone CLI'ı kurmalı. Health-check
   `command -v codex` ve gerçek `codex --version` başarılı olmadan tamamlanmamalı.

### Son ekranın teşhisi: klasör neden “çalışmadı”

- Klasör aslında BarkOS'a eklenmiş ve dosya ağacında okunabiliyor. Sorun klasör
  ekleme değil, açılan iki panelin de normal `zsh` kabuğu olması.
- `bu klasör ne işe yarıyor` metni doğrudan kabuk prompt'una yazıldığı için
  `zsh`, ilk kelimeyi çalıştırılabilir program sanıp `command not found: bu`
  döndürüyor. Normal terminal doğal dil anlayan ajan değildir.
- Mevcut geçici kullanımda önce terminalde `codex` yazıp Enter'a basmak,
  Codex'in `›` giriş alanı açıldıktan sonra doğal dil sorusunu oraya yazmak
  gerekir. Yalnız dosya komutu çalıştırılacaksa doğrudan shell komutu yazılır.
- Hedef BarkOS davranışı bu ayrımı kullanıcıya bırakmamak: klasör seçilip görev
  yazıldığında BarkOS otomatik olarak dosya okuyucu ajanı başlatmalı, baş ajana
  analiz vermeli, ekibi kurmalı ve gerçek Task/Dispatch zincirini göstermeli.
  Boş shell terminali açıp kullanıcıdan ayrıca `codex` başlatmasını istemek son
  ürün davranışı değildir.
- Proje kartındaki anlamsız tekrarlanan isim (`birincil ...`) ve `barkos/foundation`
  etiketi de görev/oturum kimliği üretimindeki görünür veri hatası olarak
  düzeltilecek.

### Yarın ilk uygulanacak sıra

1. Tüm görünür Orca/upstream URL ve komut envanterini çıkar; her girdiyi
   BarkOS hedefi, iç uyumluluk katmanı veya kaldırılacak özellik olarak sınıfla.
2. Klasör → doğal dil görev → dosya okuyucu → baş ajan → çalışanlar zincirini
   paketlenmiş uygulamada tekrar çalıştır; boş shell'e düşen yolu düzelt.

   Durum (21 Ağustos 2026): zincir gerçek Electron uygulamasında uçtan uca
   çalışıyor; `tests/e2e/barkos-project-intake.spec.ts` üç kez geçti. Boş
   shell'e düşmenin kod kaynakları kapatıldı: (a) yeni şirket kuruluşu
   `codex`'i körlemesine varsayıyordu; artık algılanan+etkin ajandan
   deterministik tercih sırasıyla seçiliyor (`company-agent-default.ts`).
   (b) Analistin ajanı hiçbir çalışma alanında başlatılamayacaksa intake,
   klasör seçtirmeden önce kesin Türkçe teşhis veriyor
   (`explainBarkosWorkerTargetGap` + `describeBarkosWorkerTargetGap`);
   klasör eklendikten sonra da hâlâ hedef yoksa aynı teşhisi raporluyor.
   Kalan: kullanıcının kendi makinesinde paketlenmiş uygulamayla elle doğrulama
   (gerçek CLI PATH'i ve ajan kurulumlarıyla).

3. BarkOS CLI/skill kurulumunu dış `stablyai/orca` URL'sinden ayır ve gerçek
   health-check ile onboarding durumuna bağla.

   Durum (21 Ağustos 2026): kurulum komutları zaten bundled kaynaktan
   üretiliyor (`agent-feature-install-commands.ts`, `barkos skills install …`;
   hiçbir komut dış depoya işaret etmiyor). Bu dilimde: (a) `AgentSkillSetupPanel`
   ve `FloatingTerminalOrchestrationDialog` bölümündeki bozuk Türkçe düzeltildi
   ("Re-check"→"Yeniden denetle", "Checking..."→"Denetleniyor…", kopyalama ve
   kurulum hata metinleri dahil). (b) CLI ön koşul uyarıları Orca markasından
   arındırılıp translate() üzerinden Türkçeleştirildi
   (`agent-skill-cli-prerequisite.ts` + `skill.cli.prerequisite` locale bölümü).
   (c) Kurulum kartındaki "Kur pasif" kök nedeni WSL repair durumlarına
   özgü çıktı; macOS'ta düğme etkin ve gerçek terminal komutunu çalıştırıyor.
   (d) #9'daki "varsayılan ajan adımı yanlışlıkla başarılı sayma" hatası
   kapatıldı: `default-agent` adımı artık yalnız seçilen ajan bu makinede
   PATH'te gerçekten algılandığında tamamlanıyor
   (`feature-wall-setup-progress.ts` + `detectedTuiAgents`). Ayrıca settings
   içinde `notifications` eksikken oluşan latent TypeError giderildi.
   Kalan: paketlenmiş uygulamada kart akışının elle doğrulanması.

4. Hesap ve tüm dış bağlantıları çalışır BarkOS endpoint'lerine bağla; henüz
   sunucusu olmayan akışları dürüstçe devre dışı bırak.

   Durum (21 Ağustos 2026): kök neden kapatıldı — paketlenmiş yapı auth
   yapılandırması olmasa bile upstream'in `login.onorca.dev` / `orca-desktop`
   üretim uçlarına sessizce varsayılanlanıyordu (`profile-cloud-auth-config.ts`).
   Artık BarkOS'un birinci taraf bulutu olmadığı için yerleşik varsayılan uç
   yok: paketlenmiş yapı yalnız açık `ORCA_CLOUD_*` env geçersiz kılmalarıyla
   yapılandırılıyor, aksi hâlde `configured: false` dönüyor ve hesap ekranı
   "Oturum aç" düğmesini dürüstçe pasifleştirip "bu yapıda kullanılamıyor"
   mesajı gösteriyor ("Signing in…" takılma durumu artık paketlenmiş yapıda
   oluşamıyor). Relay yönetmeni fallback'u yapılandırılan API kökeninden
   türetiliyor. BarkOS Hesabı Türkçe metinleri baştan yazıldı (bozuk cümleler,
   İngilizce kalan "Sign out" vb.). Kalan: gerçek BarkOS sunucusu hazır
   olduğunda env ile uçtan uca doğrulama.

5. Yukarıdaki bozuk Türkçe ve layout ekranlarını tek tek düzelt; Electron
   render doğrulamasında ekran görüntüsü ve etkileşim kanıtı al.
6. Son olarak BarkOS bağımsız Git remote/klasör adlandırmasını, yükseltme ve
   paket uyumluluğunu bozmadan tamamla.

Kapasite notu: kullanıcı mevcut çalışma alanında yaklaşık `%8` hak kaldığını
belirtti. Bu checkpoint'ten sonra 20 Ağustos 2026'da devam edilecek; düşük kalan
hak bugün yeni geniş geliştirme dilimi başlatmak için kullanılmayacak.

## 21 Ağustos 2026 — OpenCode sonrası denetim

- OpenCode'un eklediği OpenCode sağlayıcısı, yan-etki onay zinciri, bundled
  BarkOS beceri kurulumu ve proje intake akışı incelendi. BarkOS odaklı 495 test
  ile son eklenen 97 test geçti.
- `server-opencode-side-effect-http.test.ts` içindeki eksik `PreToolUse` karar
  sözleşmesi tamamlandı; tüm TypeScript projeleri yeniden hatasız doğrulandı.
- Ayar yükleme döngüsünün boş `modelOverridesByOperation` üretip kalıcı JSON'u
  her açılışta değiştirmesi engellendi. OpenCode'un geçici scratch testi silindi.
- Kurulum kontrol listesindeki görünür İngilizce/Orca metinleri BarkOS ve Türkçe
  karşılıklarıyla değiştirildi.
- Git ayarlarında ekrana yüzlerce kez `main`/`güvenle` basan bozuk Türkçe kayıt
  temizlendi; başlık, açıklama ve "Yerel ana dalı güncel tut" metni düzeltildi.
- Doğrulama: `pnpm run typecheck` geçti; ilgili 40 Vitest testi geçti;
  `tr.json` geçerli JSON olarak doğrulandı.
- Sıradaki iş: GitHub görev tablosundaki üst üste binme sorununu Electron
  render testinde düzeltmek, ardından paketlenmiş BarkOS'ta klasör → doğal dil
  görev → ekip başlatma akışını gerçek kurulu ajanlarla yeniden doğrulamak.

## 21 Ağustos 2026 — GitHub görev ekranı ve tek tık başlatma

- VS Code'da yanlışlıkla `/Users/muratkomurcu/orca` çalışma alanı deposunun
  açıldığı belirlendi; gerçek kaynak kökü `/Users/muratkomurcu/Desktop/orca`.
- GitHub görev tablosunu dağıtan sözlük kayıtları düzeltildi. `Güncelleme`,
  `Model`, `Of` gibi yüzlerce kez tekrarlanan 211 patolojik çeviri kaydı kısa,
  geçerli Türkçe karşılıklarına indirildi. Tablo başlıkları `Kimlik`,
  `Başlık / Bağlam`, `Atananlar`, `İnceleyenler`, `Birleştirme` ve
  `Güncellendi` olarak tamamlandı.
- Ana GitHub listesindeki `Başlat` artık yalnızca oluşturma penceresini açmıyor.
  Doğrudan çalışma alanı oluşturma hattını çalıştırıyor, seçili ajanı başlatıyor
  ve görev metnini ajan hazır olduğunda otomatik gönderiyor. Repo/ajan/kurulum
  kararı eksikse mevcut oluşturma penceresine güvenli biçimde geri düşüyor.
- Doğrulama: görev başlatma ve çalışma alanı oluşturma için 3 dosyada 42 test
  geçti; tüm TypeScript projeleri hatasız derlendi; Türkçe sözlükte patolojik
  tekrar sayısı 0 ve JSON geçerli.

## 22 Ağustos 2026 — BarkOS ürünleştirme doğrulaması

- Türkçe arayüz kataloğundaki görünür `Orca` markaları BarkOS olarak temizlendi;
  bozuk çalışma alanı, kenar çubuğu ve ayar metinleri düzeltildi. İç protokol,
  ortam değişkeni ve dosya adları geriye dönük uyumluluk için değiştirilmedi.
- Claude Pro oturumu gerçek CLI çağrısıyla doğrulandı. Kullanım API'sindeki 429
  artık oturumu bozuk göstermiyor; mevcut geri çekilme ve yeniden deneme akışı
  sessiz çalışıyor.
- OpenCode'un kimlik bilgisi gerektirmeyen, gerçek çağrıyla doğrulanan
  `opencode/mimo-v2.5-free` modeli BarkOS çalışanlarının varsayılanına bağlandı.
  Baş ajanın atadığı model, eski kullanıcı model argümanını güvenle değiştiriyor.
- Piksel ofis gerçek çalışan durumuna bağlı yürüyüş/yazma/okuma karelerini,
  yol bulmayı, görev ve araç etiketlerini, çalışma bölgelerini ve hareketli
  Pixel Agents evcil hayvanlarını gösteriyor. Sistem hareket azaltma ayarına
  uyuyor.
- Başlangıçtaki yinelenen terminal kurtarma yarışı kaldırıldı. Beklenen geçici
  `terminal_liveness_unavailable` uyarısı bastırıldı; gerçek hatalar raporlanmaya
  devam ediyor. Ana Electron penceresinin meşru dinleyici kapasitesi yerel olarak
  yükseltilerek `MaxListeners` uyarısı giderildi.
- `muratkomurrcu.com` yönlendirmesi özellikle devreye alınmadı. Hedef sayfalar
  yayımlandıktan sonra eski upstream URL'ler tek envanter üzerinden BarkOS
  adreslerine taşınacak; şimdilik kırık bağlantı üretmiyoruz.
- Doğrulama: 103 hedef Vitest testi, TypeScript typecheck, React Doctor ve tam
  depo lint/yerelleştirme kontrolleri geçti. Sonraki adım yeni DMG'yi üretip
  kurulu uygulamada Playwright CDP ile başlangıç ve canlı ofisi doğrulamak.

## 25 Ağustos 2026 — Munder desenlerinin BarkOS'a uyarlanması

- Ayrı bir dosya posta kutusu kopyalanmadı. BarkOS'un zaten SQLite tabanlı,
  kalıcı, teslim alındılı ve Run/Dispatch kimliğine bağlı orkestrasyon posta
  kutusu korundu.
- Bunun üstüne sürümlü ajan konuşma zarfı eklendi: conversation/reply zinciri,
  worker/task/dispatch kimlikleri, iletişim edimi, yanıt gereksinimi ve dört
  aktarımlık döngü sınırı katı biçimde doğrulanıyor.
- Kalıcı çalışan brifingi; soru, durum, devir ve `worker_done` ayrımını her
  sağlayıcıya aynı sözleşmeyle bildiriyor.
- Baş ajanın ekip kurma sözleşmesi Codex/Claude/OpenCode kilidinden çıkarıldı.
  Yalnız güvenli BarkOS yan-etki hattına bağlı Codex, Claude, OpenCode, Gemini
  ve Droid kabul ediliyor; görev türü için denetlenmiş yetenek matrisi prompt'a
  ekleniyor.
- Canlı ofis artık araç adına ve girdisine göre analiz, araştırma, planlama,
  üretim, test, inceleme ve toplantı istasyonlarını belirliyor. Karakterler
  gerçek hook olayında ilgili istasyona yürüyor; işçi listesi aynı istasyonu
  Türkçe gösteriyor.
- Proje otomasyonu tek poll başına en fazla dört doğrulanmış geçiş çalıştırıyor.
  Böylece rapor kabulü → bağımlı görevin hazır olması → ekip önerisi → yeni
  işçilerin/görevlerin başlatılması gereksiz poll gecikmeleri olmadan ilerliyor;
  sabit üst sınır runaway döngüsünü engelliyor.
- Görev dispatch hafızası, aynı izinli kapsam içindeki kayıtları görev başlığı
  ve spesifikasyonuyla çevrimdışı sözcüksel ilgisine göre sıralıyor. Kapsam,
  hassas içerik, süre ve karakter bütçesi kapıları aynen korunuyor; dış servis
  veya embedding zorunluluğu eklenmedi.
- Munder'ın ayrı lisanslı piksel varlıkları, marka öğeleri, güvenlik atlatma
  bayrakları ve ikinci bir Git/iş yürütme otoritesi alınmadı.
- Doğrulama: ilgili dokuz test dosyasında 34 test geçti; Node, CLI ve web
  TypeScript projelerinin tamamı hatasız typecheck edildi. Ortam Node 26.7
  kullandığı için deponun beklediği Node 24 uyarısı sürüyor.

## 25 Ağustos 2026 — Çoklu platform ve kalıcı ajan iletişimi

- Codex, Claude ve OpenCode gerçek yerel CLI çağrılarıyla doğrulandı. Codex
  ChatGPT oturumuyla, Claude Pro oturumuyla ve OpenCode kimlik bilgisi
  gerektirmeyen `opencode/mimo-v2.5-free` modeliyle beklenen kısa yanıtı verdi.
- Ekip kurma artık her çalışanı kendi sağlayıcısı için aynı çalışma alanı ve
  yürütme sunucusunda yeniden çözüyor. Baş ajana yalnız o hedefte gerçekten
  bulunan sağlayıcılar bildiriliyor; Codex hedefinin Claude/OpenCode için
  yanlışlıkla yeniden kullanılması engellendi.
- Canlı ofise kalıcı ajan iletişim akışı eklendi. Devirler, kanıt raporları ve
  tamamlanmış hatalar yeni bir posta kutusu oluşturmadan iş defterinden
  yansıtılıyor. Electron E2E testi gerçek kalıcılık sınırında bu akışı gördü.
- BarkOS'a ait macOS/Windows/Linux yayın matrisi eklendi: DMG/ZIP, NSIS ve
  AppImage/deb. Paket adları BarkOS olarak sabitlendi ve paketlenmiş CLI her
  işletim sisteminde duman testine bağlandı.
- macOS paketleme sırasında bulunan eksik düz-Node çalışma zamanı kapanışı
  giderildi. Paket içi CLI, daemon, eklenti ve kod imzası doğrulamaları geçti;
  `dist/barkos-macos-arm64.dmg` başarıyla üretildi. Paket ad-hoc imzalı ve
  noterlenmemiş bir test paketidir; genel dağıtım için Apple/Windows imzalama
  kimlikleri ayrıca gereklidir.
- Doğrulama: 37 odaklı birim testi, tam TypeScript typecheck, masaüstü derleme,
  BarkOS Electron E2E testi ve macOS paket içi CLI/daemon testleri geçti.
  Windows ve Linux paketleri GitHub'ın kendi işletim sistemi runner'larında
  doğrulanmak üzere yeni yayın iş akışına bağlandı.
