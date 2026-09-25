# Manifest – Církev jako kráva

Vertikální webová prezentace manifestu komunity **Církev jako kráva**.

**Živě:** https://manifest.cirkevjakokrava.cz (GitHub Pages ze složky `docs/`, aktualizuje se s každým pushem do `main`; `https://radomilcz.github.io/cirkevjakokrava/` sem přesměrovává).

Zdroj designu: [Figma – Církev jako kráva](https://www.figma.com/design/RT5auaz60q3F1kL5eAmKwG/C%C3%ADrkev-jako-kr%C3%A1va) (stránka `Manifest`, sekce `Manifest` s framy `00`–`07` a `Předmluva`, sekce `Kultura` s framy `Kultura 00`–`Kultura 10` a `Zrcadlo 00`).

## Struktura

```
src/admin/index.html         Sveltia CMS na /admin/ (zkušebně; config.yml sestaví build z .pages.yml)
src/obsah/*.yml              texty – co se píše v Pages CMS (úvod, předmluva, poslání, kultura, zrcadlo, společné)
.pages.yml                   formulář pro Pages CMS: sekce, názvy polí, nápovědy, povinná pole
.github/workflows/web.yml    po každém pushi do main přesází web a commitne docs/
src/manifest.template.html   šablona – sazba slajdů (Jinja2), texty bere z src/obsah/
src/manifest.css             styly
src/manifest.js              navigace, otisky, animace
src/assets/otisk-paths.txt   křivky otisku (vektor „Group 14“ z Figmy, 55 cest)
src/assets/hero.webp         úvodní fotka, zmenšená pro web (webp q82; zdroj hero.jpg, + hero-original.jpg)
src/assets/kultura.jpg       fotka slajdu KULTURA, oříznutá podle Figmy (+ kultura-original.jpg)
src/assets/kennedy.webp      vystřižený portrét na slajd „Ich bin ein Kuhländler“ (bezztrátový webp; zdroj kennedy.png)
src/assets/krava-manifest.webp fotka na slajd „KRÁVA má Boží design“ (webp q84; zdroj krava-manifest.jpg, ořez z highland-original.jpg)
src/assets/zrcadlo.webp      fotka na závěrečný slajd „ZRCADLO“, oříznutá podle Figmy (webp je o třetinu menší než jpg)
src/assets/krava.png         vystřižená kráva – na slajdu 06 ji nahradil Kennedy (+ krava-original.png)
src/assets/highland-original.jpg  zatím nepoužitá fotka
src/assets/og.jpg            náhled při sdílení odkazu (1200×630, vyfocený úvodní slajd)
src/assets/favicon.svg       ikona webu – terč v barvách značky (+ favicon-32.png, icon-180.png)
src/fonts/*.woff             Subset (latinka, čeština, šipka)
build.py                     sestaví web do docs/
docs/index.html + assets/    hotový web – HTML, CSS, JS, fonty a fotky jako samostatné soubory
```

## Fotky

Přejmenované na krátké názvy podle toho, kam patří – původní jména z Unsplashe si nesla autora, tak ať se neztratí:

| soubor | zdroj |
| --- | --- |
| `kultura-original.jpg` | Alexander Dummer, Unsplash (`hotgFPIL6Bc`) |
| `highland-original.jpg`, `krava-manifest.jpg` | Pascal van de Vendel, Unsplash (`81mllqC4JiU`) |

`kultura.jpg` je z originálu oříznutá přesně na výřez z Figmy (frame `Hodnoty 00`) a zmenšená na 2000 px.

## Úprava textů – Pages CMS

Texty se píšou na [app.pagescms.org](https://app.pagescms.org): přihlásit se GitHubem, vybrat repozitář
`cirkevjakokrava`. Sekce jdou v pořadí slajdů a čísla v názvech (`02 · Co děláme?`) sedí s tečkami
na liště webu. Po uložení CMS commitne soubor do `src/obsah/`, GitHub Action přesází web a do minuty
je změna venku.

Zkratky v textových polích:

- `->` je šipka →; v běžném textu se sama přilepí k předchozímu slovu, aby nezačínala řádek
- `*slovo*` je kurzíva (ne v odstavci o hodnotách – ten se při čtení rozsvěcuje po slovech)
- výroky na slajdech se píšou po řádcích – co je jedna položka, je jeden řádek na slajdu

Slajdy se v CMS nepřidávají ani nepřehazují: otisky, fotky i oddělovače na liště jsou navázané na pořadí.
Hodnot je přesně deset a slajd s Kennedym má přesně dva řádky. Když je povinné pole prázdné nebo
počet nesedí, build skončí českou hláškou (např. `21 · Zrcadlo → Velké slovo: je povinné`),
Action zčervená a na webu zůstane poslední dobrá verze.

### Zkušebně: Sveltia CMS

Druhá administrace nad stejnými soubory běží na [manifest.cirkevjakokrava.cz/admin/](https://manifest.cirkevjakokrava.cz/admin/)
([Sveltia CMS](https://sveltiacms.app), zdarma). Přihlášení: **Sign In Using Access Token** – Sveltia nabídne
odkaz na GitHub, kde se vytvoří token s předvyplněnými oprávněními pro tohle repo. Tlačítko „Sign In with GitHub“
by potřebovalo vlastní OAuth službu, tu zatím nemáme.

Formulář Sveltie (`docs/admin/config.yml`) skládá build z `.pages.yml`, takže obě CMS ukazují stejná pole
a stejné názvy. Která se neosvědčí, ta se smaže (`src/admin/` + funkce `admin()` v `build.py`,
nebo `.pages.yml` – ten pak ale zůstane jako zdroj formuláře pro Sveltii).

## Úprava a build

1. Texty v `src/obsah/*.yml` (nebo v CMS), sazbu v `src/manifest.template.html`, případně `manifest.css` / `manifest.js`.
2. Spusť `python3 build.py` – přegeneruje `docs/` (potřebuje `pip install pyyaml jinja2`).
3. Otevři `docs/index.html` v prohlížeči (fonty přes `file://` v Chromu nepřednačte, přes lokální server nebo po nasazení ano).

Kdo pushuje do `main` ručně, ať si předtím stáhne commity z CMS a Action (`git pull`) – jinak se push odmítne.

Nová úvodní fotka: `python3 build.py --hero cesta/k/fotce.jpg` (vyžaduje `pip install pillow`).

## Náhled při sdílení a ikona

Když někdo pošle odkaz na WhatsApp, Messenger nebo Facebook, ukáže se náhled `assets/og.jpg` s titulkem
„BŮŮŮH je dobrý, my jsme normální“. Náhled není sázený ručně – je to fotka úvodního slajdu hotového webu,
takže vypadá přesně jako web:

```
python3 build.py --og      # přegeneruje src/assets/og.jpg (pip install playwright pillow)
python3 build.py --icons   # přegeneruje PNG ikony z favicon.svg (pip install playwright)
```

Obojí potřebuje Chromium; když ho playwright nemá vlastní, ukaž na jiný přes `CHROME_PATH=/cesta/k/chrome`.
Adresa v absolutních odkazech (`og:image`, `canonical`) je konstanta `SITE` v `build.py` – musí sedět
s doménou v `docs/CNAME`. Po změně náhledu vyčistí keš
[Sharing Debugger](https://developers.facebook.com/tools/debug/), jinak Facebook drží starý obrázek.

## Ovládání prezentace

kolečko myši / touchpad · šipky, mezerník, PageUp/PageDown, Home/End · swipe na mobilu · tečky na pravé liště. Každý slajd má vlastní odkaz (`#s0` … `#s21`).

## Jak je to postavené

- Slajdy se nepřepínají nativním scrollem, ale jedním `translateY` na celém pásu – proto to nikde neškube.
- Otisk je jeden `<symbol>`; na aktivní slajd se naklonuje a „přitiskne“ – naběhne z 108 % a −2° do plné síly. Animuje se jen průhlednost a transformace jedné vrstvy, takže to kompozitor zvládne sám a SVG se vykreslí jen jednou. Rozmístění a rotace otisku na jednotlivých slajdech odpovídá Figmě 1:1 (tabulka `PRINT` v JS).
- Text se odhaluje po řádcích maskou (`.ln`), písmena BŮŮŮH jednotlivě.
- Barvy: pozadí `#3b2f2f`, text `#e6acac`, otisk `rgba(217,199,199,.30)` (náhrada za white + soft-light).
- Písmo: Agrandir Grand Heavy (popisky, wordmark), Regular (výroky), Narrow Black (BŮŮŮH, hodnoty, Zrcadlo), Grand (podtitul, příslovce).
