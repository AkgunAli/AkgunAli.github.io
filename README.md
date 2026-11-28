# akgunali.github.io

Kişisel portfolyo sitesi — iOS uygulamaları ve Chrome eklentileri. Derleme aracı veya bağımlılık yok; GitHub Pages doğrudan `main` dalını yayınlar.

## Yapı

| Yol | Açıklama |
| --- | --- |
| `index.html` | Sayfa. Proje kartları `<!-- build:projects -->` arasına **otomatik** yazılır. |
| `assets/css/home.css` | Ana sayfa tasarımı: koyu tema, iki sütun, imleç ışığı, kart efektleri. |
| `assets/js/home.js` | Dil (TR/EN/DE), imleç ışığı, aktif bölüm menüsü, proje filtresi, kod animasyonu ve etkileşimli terminal (`analiz et`, `swift`, `projeler`, `yardım`…). |
| `assets/css/theme.css` | Ana sayfanın koyu renkleri ve temel ayarlar; `404.html` ve `duel/` davet sayfaları kullanır. |
| `assets/css/doc.css` | Uygulama destek ve gizlilik sayfaları (`blockcrash/`, `fit/`, `knot/`, `orbit/`, `plop/`, `popword/`, `derdiedas/privacy/`) için ortak stil. Her uygulamanın `style.css`'i yalnızca marka rengini (`--app`) tanımlar. |
| `data/apps.json` | App Store'dan **otomatik** çekilen uygulamalar — elle düzenlemeyin. |
| `data/appstore.json` | Senkronizasyon ayarları: öne çıkanlar, gizlenenler, kısa açıklama/isim override'ları. |
| `data/websites.json` | Web siteleri ("Web Siteleri" sekmesi). `icon` olarak `assets/img/` altındaki bir logo verilir; verilmezse `monogram` harfleriyle ikon üretilir. |
| `data/extensions.json` | Chrome eklentileri (Web Store'un açık API'si yok, elle eklenir). |
| `data/documents.json` | `Documents/` klasöründeki belgelerin başlıkları; yeni dosyalar otomatik listelenir. |
| `Documents/` | Herkese açık dosyalar (şu an sadece profil fotoğrafı; CV ve belgeler talep üzerine paylaşılır). Repo public olduğu için buradaki **her dosya herkes tarafından indirilebilir** — kimlik bilgisi içeren belgeler (diploma, transkript, sertifika) buraya konmaz; `data/documents.json` içinde `onRequest: true` ile "talep üzerine" listelenir. |
| `scripts/build.mjs` | App Store'dan veri çeker ve `index.html` + `sitemap.xml` üretir. |
| `.github/workflows/sync-apps.yml` | Her gün çalışır; yeni/güncellenen uygulamaları siteye işler. |
| `liste.html` | Sınıf oturma planı / grup oluşturucu (arama motorlarına kapalı). |
| `app-ads.txt` | AdMob doğrulaması — silmeyin. |

## Yeni uygulama yayınladığımda ne olur?

Hiçbir şey yapmanız gerekmez. GitHub Action her gün App Store'daki geliştirici hesabınızı
(`seedAppId` üzerinden otomatik bulunur) TR ve US mağazalarında tarar; yeni uygulama, ikon,
kategori ve puanları `data/apps.json`'a yazar, kartları yeniden üretir ve commit'ler.
Uygulama isimleri/açıklamaları TR, US ve DE mağazalarından çekilir. Hemen görmek isterseniz: **Actions → Sync App Store apps → Run workflow**.

İsteğe bağlı ince ayarlar (`data/appstore.json`):

- `overrides["<appId>"].tr/en.tagline` — App Store açıklamasının ilk cümlesi yerine kısa metin.
- `featured` — geniş kartla öne çıkarılacak uygulamalar.
- `hidden` — sitede gösterilmeyecek uygulamalar.

## Yerel geliştirme

```bash
node scripts/build.mjs          # data/*.json'dan index.html'i yeniden üret
node scripts/build.mjs --sync   # önce App Store'dan güncel veriyi çek
python3 -m http.server 8000     # http://localhost:8000
```

> CSS/JS dosyalarını değiştirdikten sonra `node scripts/build.mjs` çalıştırın (veya push edin; Action çalıştırır): `index.html` içindeki `home.css`/`home.js` `?v=` sürüm etiketleri güncellenir, böylece tarayıcılar eski önbelleği kullanmaz.
