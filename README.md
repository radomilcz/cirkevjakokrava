# Manifest – Církev jako kráva

Vertikální webová prezentace manifestu komunity **Církev jako kráva**. Jeden HTML soubor bez externích závislostí: fotka, písmo i otisk jsou vložené přímo v něm.

**Živě:** https://radomilcz.github.io/cirkevjakokrava/ (GitHub Pages ze složky `docs/`, aktualizuje se s každým pushem do `main`).

Zdroj designu: [Figma – Církev jako kráva](https://www.figma.com/design/RT5auaz60q3F1kL5eAmKwG/C%C3%ADrkev-jako-kr%C3%A1va) (framy `00`–`04`, `Hodnoty 01–11`, `Zrcadlo 00`).

## Struktura

```
src/manifest.template.html   šablona – tady se edituje obsah, CSS i JS
src/assets/otisk-paths.txt   křivky otisku (vektor „Group 14“ z Figmy, 55 cest)
src/assets/hero.jpg          úvodní fotka, zmenšená pro web
src/assets/hero-original.jpg úvodní fotka v plném rozlišení
src/fonts/*.woff             Agrandir – subset (latinka, čeština, šipka)
build.py                     složí šablonu + assety do docs/index.html
docs/index.html              hotová prezentace (co se posílá / hostuje)
```

## Úprava a build

1. Uprav `src/manifest.template.html` (texty jsou přímo v `<section class="slide">`).
2. Spusť `python3 build.py` – přegeneruje `docs/index.html`.
3. Otevři `docs/index.html` v prohlížeči.

Nová úvodní fotka: `python3 build.py --hero cesta/k/fotce.jpg` (vyžaduje `pip install pillow`).

## Ovládání prezentace

kolečko myši / touchpad · šipky, mezerník, PageUp/PageDown, Home/End · swipe na mobilu · tlačítko vpravo dole · tečky na pravé liště. Každý slajd má vlastní odkaz (`#s1` … `#s16`).

## Jak je to postavené

- Slajdy se nepřepínají nativním scrollem, ale jedním `translateY` na celém pásu – proto to nikde neškube.
- Otisk je jeden `<symbol>`; na aktivní slajd se naklonuje a jeho linky se objevují postupně (26 ms mezi linkami). Rozmístění a rotace otisku na jednotlivých slajdech odpovídá Figmě 1:1 (tabulka `PRINT` v JS).
- Text se odhaluje po řádcích maskou (`.ln`), písmena BŮŮŮH jednotlivě.
- Barvy: pozadí `#3b2f2f`, text `#e6acac`, otisk `rgba(217,199,199,.30)` (náhrada za white + soft-light).
- Písmo: Agrandir Grand Heavy (popisky, wordmark), Regular (výroky), Narrow Black (BŮŮŮH, hodnoty, Zrcadlo), Grand (podtitul, příslovce).

## Licence písma

Agrandir (Pangram Pangram) je licencované písmo s webovou licencí; v repu je jen subset (latinka, čeština, šipka) potřebný pro build a totožný s tím, co je vložené v hotové stránce.
