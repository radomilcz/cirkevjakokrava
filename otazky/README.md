# Otázky na tělo

Koučovací otázky ke kultuře komunity **Církev jako kráva** – jedna stránka ke čtení i k vytištění.

**Živě:** https://otazky.cirkevjakokrava.cz (GitHub Pages ze složky `docs/`, aktualizuje se s každým pushem do `main`)

Sourozenec [manifestu](https://manifest.cirkevjakokrava.cz) – stejné barvy (`#3b2f2f` / `#e6acac`),
stejné písmo Agrandir i stejný otisk z [Figmy](https://www.figma.com/design/RT5auaz60q3F1kL5eAmKwG/C%C3%ADrkev-jako-kr%C3%A1va).

## Struktura

```
src/otazky.txt             zdroj otázek – bloky a odrážky, jediné místo, kde se text mění
src/index.template.html    šablona stránky: sazba pro obrazovku i @media print pro A4
src/assets/otisk-paths.txt křivky otisku (vektor „Group 14“ z Figmy, 55 cest)
src/assets/favicon.svg     ikona webu – terč v barvách značky (+ favicon-32.png, icon-180.png)
src/assets/og.jpg          náhled při sdílení odkazu (1200×630, vyfocená hlavička stránky)
src/fonts/*.woff           Agrandir – subset (latinka, čeština, šipka), 4 řezy
build.py                   sestaví docs/
docs/index.html + assets/  hotová stránka
docs/otazky-na-telo.pdf    A4 ke stažení – výtisk té samé stránky
```

## Úprava a build

1. Otázku přidej, uber nebo přepiš v `src/otazky.txt`. Prázdný řádek odděluje bloky,
   první řádek bloku je jeho název, řádky s pomlčkou jsou otázky.
2. Spusť `python3 build.py --pdf` – přegeneruje `docs/` i PDF.
3. Otevři `docs/index.html` (nejlíp přes lokální server, přes `file://` Chrome nenačte fonty).

Web a A4 se nemůžou rozejít: tisková podoba je v šabloně jako `@media print` a PDF je její
výtisk. Co vyjede z `--pdf`, vyjede návštěvníkovi i z Ctrl+P.

Jednopísmenné předložky a spojky lepí na další slovo build (`nbsp()`), v `otazky.txt` se
tedy píšou jako obyčejná mezera.

```
python3 build.py            jen stránka
python3 build.py --pdf      stránka + docs/otazky-na-telo.pdf  (pip install playwright)
python3 build.py --og       přegeneruje náhled sdílení          (pip install playwright pillow)
```

Obojí potřebuje Chromium; když ho playwright nemá vlastní, ukaž na jiný přes `CHROME_PATH=/cesta/k/chrome`.
Adresa v absolutních odkazech (`og:image`, `canonical`) je konstanta `SITE` v `build.py` – musí
sedět s doménou v `docs/CNAME`.

## Nasazení

- **GitHub Pages:** Settings → Pages → Deploy from a branch, větev `main`, složka `/docs`,
  vlastní doména `otazky.cirkevjakokrava.cz`, pak zapnout Enforce HTTPS (certifikát chvíli trvá).
- **DNS:** záznam `otazky CNAME radomilcz.github.io.` – přebije wildcard `*.cirkevjakokrava.cz`,
  který jinak míří na hlavní hosting.

## Náhled při sdílení

Když někdo pošle odkaz na WhatsApp nebo Messenger, ukáže se `assets/og.jpg` s titulkem
„Otázky na tělo“. Náhled není sázený ručně – je to fotka hlavičky hotové stránky, takže
vypadá přesně jako web. Po změně vyčistí keš
[Sharing Debugger](https://developers.facebook.com/tools/debug/), jinak Facebook drží starý obrázek.
