# Manifest – Církev jako kráva

Vertikální webová prezentace manifestu komunity **Církev jako kráva**.

**Živě:** https://manifest.cirkevjakokrava.cz (GitHub Pages ze složky `docs/`, aktualizuje se s každým pushem do `main`; `https://radomilcz.github.io/cirkevjakokrava/` sem přesměrovává).

Zdroj designu: [Figma – Církev jako kráva](https://www.figma.com/design/RT5auaz60q3F1kL5eAmKwG/C%C3%ADrkev-jako-kr%C3%A1va) (framy `00`–`04`, `Hodnoty 01–11`, `Zrcadlo 00`).

## Struktura

```
src/manifest.template.html   šablona – obsah slajdů (HTML)
src/manifest.css             styly
src/manifest.js              navigace, otisky, animace
src/assets/otisk-paths.txt   křivky otisku (vektor „Group 14“ z Figmy, 55 cest)
src/assets/hero.jpg          úvodní fotka, zmenšená pro web (+ hero-original.jpg)
src/assets/kultura.jpg       fotka slajdu KULTURA, oříznutá podle Figmy (+ kultura-original.jpg)
src/assets/kennedy.png       vystřižený portrét na slajd 06
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
| `highland-original.jpg` | Pascal van de Vendel, Unsplash (`81mllqC4JiU`) |

`kultura.jpg` je z originálu oříznutá přesně na výřez z Figmy (frame `Hodnoty 00`) a zmenšená na 2000 px.

## Úprava a build

1. Uprav `src/manifest.template.html` (texty jsou přímo v `<section class="slide">`), případně `manifest.css` / `manifest.js`.
2. Spusť `python3 build.py` – přegeneruje `docs/`.
3. Otevři `docs/index.html` v prohlížeči (fonty přes `file://` v Chromu nepřednačte, přes lokální server nebo po nasazení ano).

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

kolečko myši / touchpad · šipky, mezerník, PageUp/PageDown, Home/End · swipe na mobilu · tečky na pravé liště. Každý slajd má vlastní odkaz (`#s0` … `#s19`).

## Jak je to postavené

- Slajdy se nepřepínají nativním scrollem, ale jedním `translateY` na celém pásu – proto to nikde neškube.
- Otisk je jeden `<symbol>`; na aktivní slajd se naklonuje a odkryje jednou animovanou maskou (linka po lince zleva dola doprava nahoru) – SVG se vykreslí jen jednou, takže to nezatěžuje ani mobil. Rozmístění a rotace otisku na jednotlivých slajdech odpovídá Figmě 1:1 (tabulka `PRINT` v JS).
- Text se odhaluje po řádcích maskou (`.ln`), písmena BŮŮŮH jednotlivě.
- Barvy: pozadí `#3b2f2f`, text `#e6acac`, otisk `rgba(217,199,199,.30)` (náhrada za white + soft-light).
- Písmo: Agrandir Grand Heavy (popisky, wordmark), Regular (výroky), Narrow Black (BŮŮŮH, hodnoty, Zrcadlo), Grand (podtitul, příslovce).
