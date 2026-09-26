# Manifest – Církev jako kráva

Vertikální webová prezentace manifestu komunity **Církev jako kráva**.

**Živě:** https://manifest.cirkevjakokrava.cz (GitHub Pages ze složky `docs/`, aktualizuje se s každým pushem do `main`; `https://radomilcz.github.io/cirkevjakokrava/` sem přesměrovává).

Zdroj designu: [Figma – Církev jako kráva](https://www.figma.com/design/RT5auaz60q3F1kL5eAmKwG/C%C3%ADrkev-jako-kr%C3%A1va) (stránka `Manifest`, sekce `Manifest` s framy `00`–`07` a `Předmluva`, sekce `Kultura` s framy `Kultura 00`–`Kultura 10` a `Zrcadlo 00`).

## Struktura

```
src/obsah/skupiny/           slajdy po skupinách (uvod, poslani, kultura, zaver) – co se píše v Pages CMS
src/obsah/spolecne.yml       podpis, nápověda, sdílení odkazu (v CMS „Nastavení“)
.pages.yml                   formulář pro Pages CMS: sekce, názvy polí, nápovědy, povinná pole
.github/workflows/web.yml    po každém pushi do main přesází web a commitne docs/
src/manifest.template.html   šablona – sazba jednotlivých typů slajdů (Jinja2)
src/manifest.css             styly
src/manifest.js              navigace, otisky, animace
src/assets/otisk-paths.txt   křivky otisku (vektor „Group 14“ z Figmy, 55 cest)
src/assets/fotky/hero.webp       úvodní fotka, zmenšená pro web (webp q82; zdroj hero.jpg, + hero-original.jpg)
src/assets/fotky/kultura.jpg     fotka slajdu KULTURA, oříznutá podle Figmy (+ kultura-original.jpg)
src/assets/fotky/kennedy.webp    vystřižený portrét na slajd „Ich bin ein Kuhländler“ (bezztrátový webp; zdroj kennedy.png)
src/assets/fotky/krava-manifest.webp fotka na slajd „KRÁVA má Boží design“ (webp q84; zdroj krava-manifest.jpg, ořez z highland-original.jpg)
src/assets/fotky/zrcadlo.webp    fotka na závěrečný slajd „ZRCADLO“, oříznutá podle Figmy (webp je o třetinu menší než jpg)
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
`cirkevjakokrava`. Po uložení CMS commitne soubor do `src/obsah/`, GitHub Action přesází web a do minuty
je změna venku.

Menu CMS: **Úvod** · **Poslání** · **Kultura** · **Závěr** · **Nastavení**.
Tři úrovně: skupina (položka v menu) → slajd (řádek v seznamu) → objekt (pole).

- Každá skupina je stránka se svými slajdy v pořadí jako na webu – slajd se přidá tlačítkem (s volbou typu),
  přetáhne za úchyt, smaže košem. Sbalený řádek ukazuje Název slajdu (pole Název – jen pro přehled v CMS, na web nejde).
- Skupiny jdou na webu za sebou jako v menu; mezi nimi je čárka na liště s tečkami. Nová skupina =
  zkopírovat jeden řádek v `content` v `.pages.yml` (jde to i v Pages CMS → Configuration) a změnit
  name/label/path; CMS pak nabídne založit soubor.
- Přesun slajdu mezi skupinami v CMS nejde (každá skupina je vlastní seznam) – smazat a založit znovu.
- Pole mají u všech typů stejná jména: Nadtitulek, Velké slovo, Dovětek, Výrok, Otázka, Podpis, Fotka,
  Popis fotky, Otisk, Text. Definovaná jsou jednou v `components` v `.pages.yml`.
- Povinná pole mají v konfiguraci `pattern` – CMS česky upozorní už při uložení („Doplň výrok“) a nevisí
  u nich anglické „Required“. Build povinnost hlídá znovu (pole s `pattern` nebo `required`, fotka vždy).
- Otisk: prázdné = automaticky (další poloha z řady podle typu, jiná než sousedé).
- Uložení z CMS se v historii jmenuje česky („Texty: src/obsah/skupiny/poslani.yml“).

Typy slajdů:

| typ | co to je |
| --- | --- |
| Úvod | fotka přes celý slajd, velký nápis po písmenech (BŮŮŮH) |
| Předmluva | dlouhý text po kapitolách (Tagline, Nadpis, Text v editoru – **Citace** = zvýrazněná otázka) |
| Pilíř | nadtitulek, výzva (velký nadpis), text (odstavec), otázka, otisk – pilíře poslání |
| Výrok | nadtitulek, výrok po řádcích, otázka, podpis, otisk |
| Výrok na růžovém | totéž na růžovém pozadí (Lásko, to je Kravařsko!) |
| Fotka se slovem | fotka přes celý slajd, velké slovo, dovětek (v závorce, nebo bez) |
| Odstavec | text, který se při čtení rozsvěcuje po slovech |
| Hodnota | velké slovo + příslovce; počítadlo „3/10“ se spočítá ze všech hodnot |
| Zrcadlo | fotka, velké slovo, otázka |
| Kennedy | kompozice s portrétem – jen jednou, výrok přesně na dva řádky |

Čísla slajdů (`#s0`…), počítadlo hodnot a otisky dopočítá build. Otisk je poloha z Figmy (tabulka `PRINT`
v `manifest.js`); „Automaticky“ vezme další z řady podle typu slajdu tak, aby sousedé neměli stejný.
Fotky se nahrávají přímo v CMS do `src/assets/fotky/`; co je širší než 2000 px nebo těžší než 600 kB,
build zmenší do webp. Na web jdou jen použité fotky.

Předmluva nesází seznamy, tabulky, obrázky, odkazy ani tučné písmo – build je odmítne s hláškou.

Zkratky v textových polích:

- `->` je šipka →; v běžném textu se sama přilepí k předchozímu slovu, aby nezačínala řádek
- `*slovo*` je kurzíva (ne v Odstavci – ten se při čtení rozsvěcuje po slovech)
- výroky se píšou po řádcích – co řádek v poli, to řádek na slajdu (zalomení drží sazbu z Figmy)

Když je povinné pole prázdné nebo Kennedy nesedí, build skončí českou hláškou
(např. `Závěr 1 (Zrcadlo) → Velké slovo: je povinné`), Action zčervená a na webu
zůstane poslední dobrá verze.

## Úprava a build

1. Texty v `src/obsah/` (nebo v CMS), sazbu v `src/manifest.template.html`, případně `manifest.css` / `manifest.js`.
2. Spusť `python3 build.py` – přegeneruje `docs/` (potřebuje `pip install pyyaml jinja2`, pro zmenšování fotek `pillow`).
3. Otevři `docs/index.html` v prohlížeči (fonty přes `file://` v Chromu nepřednačte, přes lokální server nebo po nasazení ano).

Kdo pushuje do `main` ručně, ať si předtím stáhne commity z CMS a Action (`git pull`) – jinak se push odmítne.


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

kolečko myši / touchpad · šipky, mezerník, PageUp/PageDown, Home/End · swipe na mobilu · tečky na pravé liště. Každý slajd má vlastní odkaz (`#s0`, `#s1`… podle pořadí).

## Jak je to postavené

- Slajdy se nepřepínají nativním scrollem, ale jedním `translateY` na celém pásu – proto to nikde neškube.
- Otisk je jeden `<symbol>`; na aktivní slajd se naklonuje a „přitiskne“ – naběhne z 108 % a −2° do plné síly. Animuje se jen průhlednost a transformace jedné vrstvy, takže to kompozitor zvládne sám a SVG se vykreslí jen jednou. Rozmístění a rotace otisku na jednotlivých slajdech odpovídá Figmě 1:1 (tabulka `PRINT` v JS).
- Text se odhaluje po řádcích maskou (`.ln`), písmena BŮŮŮH jednotlivě.
- Barvy: pozadí `#3b2f2f`, text `#e6acac`, otisk `rgba(217,199,199,.30)` (náhrada za white + soft-light).
- Písmo: Agrandir Grand Heavy (popisky, wordmark), Regular (výroky), Narrow Black (BŮŮŮH, hodnoty, Zrcadlo), Grand (podtitul, příslovce).
