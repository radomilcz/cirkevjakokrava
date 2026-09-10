# Manifest – Církev jako kráva

Vertikální webová prezentace manifestu komunity **Církev jako kráva**.

**Živě:** https://radomilcz.github.io/cirkevjakokrava/ (GitHub Pages ze složky `docs/`, aktualizuje se s každým pushem do `main`).

Zdroj designu: [Figma – Církev jako kráva](https://www.figma.com/design/RT5auaz60q3F1kL5eAmKwG/C%C3%ADrkev-jako-kr%C3%A1va) (framy `00`–`04`, `Hodnoty 01–11`, `Zrcadlo 00`).

## Struktura

```
src/manifest.template.html   šablona – obsah slajdů (HTML)
src/manifest.css             styly
src/manifest.js              navigace, otisky, animace
src/assets/otisk-paths.txt   křivky otisku (vektor „Group 14“ z Figmy, 55 cest)
src/assets/hero.jpg          úvodní fotka, zmenšená pro web (+ hero-original.jpg)
src/assets/hodnoty.jpg       fotka úvodu hodnot (+ hodnoty-original.jpg)
src/fonts/*.woff             Subset (latinka, čeština, šipka)
build.py                     sestaví web do docs/
docs/index.html + assets/    hotový web – HTML, CSS, JS, fonty a fotky jako samostatné soubory
```

## Úprava a build

1. Uprav `src/manifest.template.html` (texty jsou přímo v `<section class="slide">`), případně `manifest.css` / `manifest.js`.
2. Spusť `python3 build.py` – přegeneruje `docs/`.
3. Otevři `docs/index.html` v prohlížeči (fonty přes `file://` v Chromu nepřednačte, přes lokální server nebo po nasazení ano).

Nová úvodní fotka: `python3 build.py --hero cesta/k/fotce.jpg` (vyžaduje `pip install pillow`).

## Ovládání prezentace

kolečko myši / touchpad · šipky, mezerník, PageUp/PageDown, Home/End · swipe na mobilu · tlačítko vpravo dole · tečky na pravé liště. Každý slajd má vlastní odkaz (`#s1` … `#s16`).

## Jak je to postavené

- Slajdy se nepřepínají nativním scrollem, ale jedním `translateY` na celém pásu – proto to nikde neškube.
- Otisk je jeden `<symbol>`; na aktivní slajd se naklonuje a odkryje jednou animovanou maskou (linka po lince zleva dola doprava nahoru) – SVG se vykreslí jen jednou, takže to nezatěžuje ani mobil. Rozmístění a rotace otisku na jednotlivých slajdech odpovídá Figmě 1:1 (tabulka `PRINT` v JS).
- Text se odhaluje po řádcích maskou (`.ln`), písmena BŮŮŮH jednotlivě.
- Barvy: pozadí `#3b2f2f`, text `#e6acac`, otisk `rgba(217,199,199,.30)` (náhrada za white + soft-light).
- Písmo: Agrandir Grand Heavy (popisky, wordmark), Regular (výroky), Narrow Black (BŮŮŮH, hodnoty, Zrcadlo), Grand (podtitul, příslovce).
