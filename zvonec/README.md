# Zvonec – kdo co kdy dělá

Zvonec je správa sboru a plánovač setkání pro Církev jako kráva: **lidé, týmy a skupinky, kalendář
s rozpisem služeb, osnova setkání a upozornění**. Běží na https://zvonec.cirkevjakokrava.cz na vlastním
serveru sboru (Payload a Postgres, provozuje Značkárna); aplikace je v tomhle repu, server v
[znackarna/zvonec](https://github.com/znackarna/zvonec).

**Ukázka s vymyšlenými lidmi:** https://manifest.cirkevjakokrava.cz/zvonec/

Hlavní adresa otevírá Zvonec (Moje · Obsazení · Kalendář · Lidé · Skupiny).

## Barvy

Zvonec je sourozenec [Otázek na tělo](https://otazky.cirkevjakokrava.cz): stejné písmo Agrandir, tykání
a stejné barvy. Barvy si vybereš **terčem** – kroužek má barvu podkladu, tečka barvu písma, stejně jako
v Otázkách. Na počítači je terč dole v levém sloupci vedle tvého jména, na telefonu v menu; stejnou volbu
máš i v Mém účtu. Na výběr je pět dvojic:

- **Krém a hlína** – světlé, výchozí
- **Hlína a růžová** – tmavé
- **Růžová a hlína** – světlé
- **Modrá a krém** – tmavé
- **Krém a modrá** – světlé

a pod nimi **Podle zařízení**: když máš v telefonu nebo počítači světlý režim, uvidíš Krém a hlínu, když
tmavý, Hlínu a růžovou. Zelené dvojice z webu tu nejsou – na zelené by drobné písmo aplikace nešlo dobře
přečíst.

Volbu si pamatuje prohlížeč, takže platí jen u tebe. Chceš někomu poslat odkaz rovnou v určitých barvách?
Přidej do adresy před `#` `?paleta=modra-krem` (nebo `hlina-ruzova`, `ruzova-hlina`, `krem-modra`,
`krem-hlina`, `zarizeni`), tedy `…/zvonec/?paleta=modra-krem#kalendar`. Starší odkazy s `?rezim=svetly`
a `?rezim=tmavy` fungují dál (světlý je Krém a hlína, tmavý Hlína a růžová). Tisk jde vždycky na bílý papír.

## Tři části: Lidé, Týmy a skupinky, Setkání

Zvonec stojí na třech částech a každá navazuje na tu předchozí:

1. **Lidé** – seznam všech, kdo k nám patří: kontakt, domácnost, členství. O plánování neví nic.
2. **Týmy a skupinky** – vybírají si lidi ze seznamu. Tým (Technika, Chvály…) má role a u každého člověka je
   napsané, jestli roli **umí**, nebo se ji **učí**. Skupinka a vedení jsou lidé, kteří k sobě patří.
3. **Setkání** – plánování bere lidi z týmů. Do role na konkrétním setkání někoho zapíšeš, on potvrdí,
   nebo napíše, že nemůže.

Tři různé věci, tři různé záznamy: *Petr je v týmu Technika* (patří do skupiny), *Petr umí zvuk* (role
v týmu), *Petr dělá 11. 10. zvuk* (služba na setkání). Oprávnění v aplikaci (správce, vedoucí, člen) je
něco jiného než role v týmu a nikdy se nejmenují stejně.

## Co kde najdeš

Na počítači je vlevo sloupec s menu: nahoře název církve, pod ním položky s ikonami, dole tvoje jméno
(vede na Můj účet) a terč s barvami. Na telefonu je nahoře lišta s názvem a tlačítkem **Menu** – v něm
najdeš totéž. Vedoucí vidí v menu všechno, člen jen Přehled, Kalendář, Lidé a Jak se scházíme. Kdo není
přihlášený, vidí jen přihlášení.

Každá obrazovka má nahoře název, vpravo hlavní tlačítko (třeba **Přidat setkání**) a pod názvem záložky
s pohledy.

| obrazovka | co tam je |
| --- | --- |
| **Přehled** | úvod pro všechny: co čeká na tvoji odpověď (Potvrď / Nemůžu), tvoje služby na osm týdnů dopředu (i do kalendáře v telefonu, .ics), příští neděle, tento týden, kdy nemůžeš, tvoje skupiny. Vedoucí navíc vidí, co nesedí, volná místa na příští tři týdny, služby čekající na potvrzení a karty lidí k doplnění; správce ještě pozvánky, které čekají, a přístupy bez karty |
| **Kalendář** | jedna stránka a čtyři pohledy: **Měsíc** (mřížka, na telefonu malá mřížka a pod ní seznam vybraného dne), **Týden** (hodiny na ose, na telefonu tři dny), **Seznam** (po týdnech, s obrázky) a **Rozpis**. Nad nimi šipky ‹ ›, **Dnes** a filtry: **Druh setkání** (Nedělní setkání, Zkouška, Skupinka, Akce), **Tým** a **Jen moje služby**. Pohled si Zvonec pamatuje |
| **Rozpis** | tabulka měsíce: řádky jsou setkání, sloupce role po týmech. Vedoucí klikne do buňky, vybere člověka a hotovo; člen vidí tabulku jen ke čtení se svými službami zvýrazněnými. Tisk na A4 na šířku – bez telefonů |
| **Setkání** | detail s obrázkem a třemi záložkami. **Přehled**: popis, poznámka pro tým, kdo slouží, začátek osnovy, mapa, upozornění a po skončení kolik lidí přišlo (jen počet, ne kdo). **Kdo slouží**: služby po týmech, výběr lidí s důvody, proč by to nešlo, „Navrhnout lidi“, „Obsadit jako minule“, „Kolik lidí je potřeba“, stavy čeká na potvrzení → potvrzeno → nemůže, výjimka u upozornění. **Osnova**: viz níže |
| **Nové setkání** | tlačítko „Přidat setkání“, ve dvou krocích: nejdřív **Podle čeho?** (šablona, nebo „Bez šablony“), pak název, kdy, kde a pro koho; zbytek (obrázek, popis, zveřejnění, poznámka pro tým) je v **Dalších možnostech**. Opakování: každý týden, každých 14 dní, každý měsíc ve stejný den v týdnu (třeba každou první neděli). Hotovou řadu prodloužíš v detailu setkání (**Prodloužit řadu**). Při úpravě řady se Zvonec zeptá, jestli jen tohle setkání, nebo i další |
| **Osnova** | setkání se skládá z formátů (Přivítání, Chvály, Kázání, Otázky na tělo, Večeře Páně…). Časy se dopočítají, vedoucí bodů se doplní podle rolí, body jdou přetahovat, je tu „Převzít minulou osnovu“ a součet proti délce setkání. Formát může přinést další role (Večeře Páně potřebuje dva lidi) – na setkání se objeví jako volná místa a „Navrhnout lidi“ je obsadí taky. List na A4 na výšku k pultu, dost velký i na plátno |
| **Upozornění** | všechno, co v rozpisu nesedí, od dneška i zpětně. Pohledy **Podle setkání** a **Podle lidí**, filtr chyba / pozor / info. Rovnou tu jde vybrat jiného člověka nebo vybrat „Povolit výjimku“ |
| **Lidé** | pohledy **Seznam**, **Tabulka** (třídění, sloupce, hromadné akce: zkopírovat e-maily, přidat do skupiny, stáhnout jako CSV; na počítači výchozí), **Domácnosti**, **Podle skupin**, **Narozeniny** a **Vytížení** (kolik služeb má kdo tenhle měsíc proti tomu, kolik jich zvládne). Filtry Všichni · Členové · Přátelé · Hosté · Děti (a Chybí údaje, když nějaké chybí), hledání podle jména, telefonu i e-mailu. Karta člověka: vlevo osobní údaje, vpravo skupiny, služby, kdy nemůže, vytížení a upozornění; každý blok upravíš zvlášť. Člen má Seznam, Domácnosti a Podle skupin |
| **Archiv** | kdo k nám přestal chodit, nepatří do seznamu, ale do archivu. Na kartě člověka zvol v nabídce ⋯ **Přesunout do archivu** (nebo dole v Členství). Člověk pak zmizí ze seznamů, kontaktů, výběru lidí i návrhů do služeb, jeho budoucí služby se uvolní a přestane vést skupiny. Ve starých rozpisech a osnovách zůstane. Archiv najdeš úplně dole v Lidech pod odkazem **Archiv (počet)**; u každého uvidíš, odkdy tam je, a tlačítka **Vrátit z archivu** (karta dostane zpátky dřívější členství, a když ho Zvonec nezná, bude přítel; týmy a dovednosti zůstávají) a **Smazat kartu**. Po roce v archivu se Zvonec zeptá, jestli karty nesmazat. Archiv vidí jen vedoucí. Starý odkaz na filtr „Už nechodí“ otevře archiv |
| **Týmy a skupinky** | **Týmy**, **Skupinky**, **Vedení** a **Role** (u každé role je vidět, kolik lidí ji umí, a kdo: zeleně umí, v obrysu se učí; vedoucí klepnutím na člověka změní, jak to umí, a přes „+ Přidat“ přidá dalšího). V týmu záložky **Lidé**, **Role**, **Kdo co umí** a **Setkání**. Role: kolik lidí, „Nezbytná role“, jen pro dospělé, u dětí, jen část setkání, které role zvládne jeden člověk naráz. Starý tým jde dát do archivu |
| **Jak se scházíme** | stavební kameny setkání na třech záložkách. **Šablony** (jaká setkání máme: den, čas, délka, místo, obrázek, popis, kdo je potřeba a osnova; v šabloně vidíš i řady, které z ní vznikly), **Formáty** (z čeho se skládá osnova: u každého proč ho děláme a jak probíhá; členové čtou, vedoucí upravují) a **Místa** (budovy s adresou a mapou a místnosti v nich). Co tu zveřejníš, uvidí návštěvníci webu |
| **Nastavení** | **Sbor** (název, hlavní místo, adresa), **Pravidla** (kolik služeb je moc, upozornění, od kolika let je člověk dospělý), **Přístupy** (kdo se může přihlásit, pozvánky) a **Záloha** (stáhnout, nahrát – jen správce; celý kalendář do telefonu) |
| **Můj účet** | po kliknutí na tvoje jméno nahoře: můj kontakt a kdo ho vidí, kdy nemůžu, moje služby do kalendáře, barvy, změna hesla, odhlášení. V ukázce i „Jak to vidí ostatní“ |

**Výběr lidí** je všude stejný – u role na setkání, u členů skupiny i u domácnosti. Pilulky **Umí to ·
Celý tým · Všichni lidé**, hledání vždycky prochází všechny lidi. Když nikdo takový není,
„+ Nový člověk“ založí krátkou kartu (host, bez dalších údajů) a toho člověka rovnou vybere. Karta se pak objeví
v Lidech pod „Chybí údaje“, ať ji někdo doplní.

**Formuláře** ukazují nejvýš zhruba sedm polí. Co se hodí jen občas, je schované pod **Další možnosti**
a Zvonec si pamatuje, jestli byly otevřené. Dlouhé věci (třeba šablona) mají vlastní stránku
s tlačítkem **Uložit**.

**Stavy** poznáš podle tvaru, barvy i slova: zelené plné kolečko s fajfkou je potvrzeno, přerušovaný
oranžový kroužek s hodinkami čeká na potvrzení, červené ✕ je nemůže (jméno je navíc přeškrtnuté).

### Kdo co vidí

| | správce a vedoucí | člen |
| --- | --- | --- |
| jméno, domácnost | ano | ano |
| telefon, e-mail | ano | jen když to člověk dovolil („Telefon a e-mail smí vidět i ostatní“) |
| členství, narození, poznámka, souhlas, přístup, vytížení | ano | ne |
| skupiny | ano | jen názvy |
| služby, kdy nemůže, upozornění | ano | jen svoje (rozpis vidí celý) |

Správce navíc dává a ruší přístupy vedoucím a správcům. Vedoucí plánuje, upravuje lidi a skupiny a zve
nové lidi. Člen vidí kalendář, rozpis a osnovu, odpovídá na svoje služby, zapisuje, kdy nemůže, a upravuje
svůj kontakt.

Členství ve sboru prozrazuje vyznání, proto se v pohledu pro členy ani v tisku nikdy neukazuje.

### Upozornění

Chyba = takhle to nepůjde: v seznamu upozornění plná tečka, v kalendáři a u služby plná plocha.
Pozor = ať o tom víš: prázdné kolečko, v kalendáři čárkovaný obrys. U konkrétní služby jde chybu
**povolit jako výjimku** („Povolit výjimku“) a napsat proč – Zvonec ji pak hlásí jen jako info.

| kód | co hlídá | závažnost |
| --- | --- | --- |
| K1 | člověk na dvou setkáních, která se časově kryjí | chyba |
| K2 | dvě role naráz na jednom setkání (kromě rolí, které jde dělat zároveň, a rolí, které trvají jen část setkání – kafe po skončení) | chyba |
| K3 | služba v době, kdy člověk nemůže | chyba |
| K4 / K4b | role, kterou člověk v týmu nemá / učí se a nikdo zkušený u toho není | chyba / pozor |
| K5 | neobsazená role – i ta, kterou přinesl formát v osnově (u nezbytné role týden předem chyba) | pozor / chyba |
| K6 | pět dní předem pořád „čeká na potvrzení“ | pozor |
| K7 | víc služeb v měsíci, než člověk chce (zkoušky se nepočítají) | pozor |
| K8 | víc nedělí po sobě, než člověk chce | pozor |
| K9 | místo obsazené dvakrát naráz (u sdíleného místa jen info) | chyba / info |
| K10 | oba rodiče malých dětí slouží naráz a nikdo z nich není u dětí | pozor |
| K11 | dítě v roli jen pro dospělé | chyba |
| K12 | u dětí méně než dva dospělí | pozor |
| K13 | v rozpisu je někdo, kdo je v archivu nebo má pauzu | pozor |
| K14 | zrušené setkání, na kterém pořád někdo je | info |
| K15 | osnova je delší než setkání | pozor |
| K16 | bod osnovy vede člověk, který v tu dobu nemůže, je v archivu nebo má pauzu | chyba / pozor |
| K17 | bod osnovy nikdo nevede, protože role z formátu už neexistuje | pozor |

Pravidla jsou v `docs/zvonec/lib/conflicts.js`. Stejný kód běží v aplikaci, v testech i v kontrole
na serveru.

## Jak je to postavené

Od 30. 10. 2026 běží Zvonec sboru na **vlastním serveru**: Payload a Postgres, provozuje ho Značkárna. Kód serveru
je v repu [znackarna/zvonec](https://github.com/znackarna/zvonec), aplikace (frontend) zůstává tady.

```
veřejné repo radomilcz/cirkevjakokrava            server znackarna/zvonec (Payload + Postgres)

docs/zvonec/  aplikace ── server si ji bere ───▶  https://zvonec.cirkevjakokrava.cz
                                                  backend.json   řekne aplikaci, že běží na serveru
                                                  /api/zvonec    přihlášení, data, přístupy, pozvánky, dary
                                                  /admin         správa sborů a zapnutí služeb
prohlížeč: jméno + heslo ─────────────────────▶  server pozná, kdo to je, a dá mu jen to, co smí vidět
```

- **Přihlášení:** jméno a heslo, server si pamatuje přihlášení (cookie na měsíc). Žádný GitHub klíč.
- **Kdo co vidí, hlídá server.** Člen dostane data už oříznutá (bez členství, poznámek a archivu ostatních,
  kontakty jen sdílené, nepřítomnost jen svoji) a server odmítne změnu, kterou člen udělat nesmí. Na GitHubu
  to hlídala jen aplikace.
- **Přístupy a pozvánky** spravují vedoucí a správci ve Zvonci (Nastavení → Přístupy, nebo z karty člověka).
  Změna platí hned. Pozvánka platí 14 dní a jde použít jen jednou. Nový člověk vyplní jméno, kontakt, s čím
  pomůže, vlastní heslo, zaškrtne **souhlas** a je v Lidech jako host. Role, se kterými chce pomáhat, dostane
  jako „učí se“. Vedoucí to pak upraví.
- **Ukládání:** server drží stejné soubory jako dřív datové repo. Změny se sbírají a po chvilce se uloží. Když
  mezitím uložil někdo jiný, aplikace načte čerstvou verzi, **sloučí změny po záznamech** a uloží znovu. Co
  uložil někdo jiný, aplikace stáhne, když se vrátíš do okna, a pak každou minutu.
- **Na serveru dál běží** kontrola upozornění, pondělní e-mail a stahování plateb z banky. Každou službu
  zvlášť zapíná správce v `/admin` › Sbory.
- **Ukázka:** když vedle aplikace neleží `backend.json` ani `access.json` (manifest.cirkevjakokrava.cz/zvonec/),
  běží aplikace jako ukázka v prohlížeči s vymyšlenými lidmi. V Mém účtu se přes „Podívat se očima druhých“
  podíváš očima kohokoli z ukázky – hodí se na školení vedoucích i na vyzkoušení pohledu člena.
- **Verze aplikace na serveru:** https://zvonec.cirkevjakokrava.cz/api/zvonec/version ukáže, ze kterého commitu
  tohohle repa server aplikaci bere (`frontend`).

### Soubory s daty (na serveru)

```
data/people.json     lidé a domácnosti
data/groups.json     skupiny, role týmů, kdo je ve skupině a co umí
data/events.json     šablony, setkání se službami a osnovou, řady, formáty, místa, kdy kdo nemůže, kolik kdo slouží
data/settings.json   název a adresa sboru, výchozí limity, upozornění
```

Přesný tvar záznamů je v [ARCHITECTURE.md](ARCHITECTURE.md). Když smažeš kartu, ve starých rozpisech
a osnovách zůstane jen jméno. Kontakt a ostatní údaje zmizí. Kde jméno uložené není (starší data), uvidíš
„někdo smazaný“.

### Kód

```
docs/zvonec/              aplikace na hlavní adrese: index.html (CSP), app.js (start, přihlášení, adresy obrazovek);
                          one/ jen přesměruje staré odkazy
docs/zvonec/lib/          logika bez obrazovek: lidé, místa, skupiny, setkání a řady, osnova, plánování, upozornění,
                          kontrola dat, přístupy, úložiště (server / GitHub / prohlížeč) a slučování, .ics, ukázková data
docs/zvonec/ui/           stavebnice a obrazovky, sdílený stav (state.js) a volba barev (palette.js)
docs/zvonec/css/          vzhled a barevné dvojice (palettes.css – vyrábí je zvonec/palettes.mjs)
zvonec/check.mjs          kontrola upozornění z příkazové řádky
zvonec/build-public.mjs   veřejný výřez dat (zveřejněná setkání a formáty) pro web
zvonec/palettes.mjs       barevné dvojice: z podkladu a písma dopočítá všechny barvy, ověří kontrast a zapíše
                          docs/zvonec/css/palettes.css (node zvonec/palettes.mjs)
zvonec/test/              testy (node --test zvonec/test/*.test.mjs)
zvonec/data-repo/         vzory workflow pro starý provoz na GitHubu (web.yml, check.yml, digest.yml)
```

Úplné zadání aplikace je v [SPEC.md](SPEC.md), datové schéma v [ARCHITECTURE.md](ARCHITECTURE.md) a pravidla
vzhledu v [design/one/DESIGN.md](design/one/DESIGN.md).

Písma, ikony a favicon se berou z manifestu (`docs/assets/`). Build manifestu (`build.py`) do
`docs/zvonec/` nesahá.

## Provoz na serveru

- **Správa:** https://zvonec.cirkevjakokrava.cz/admin (správce sboru). Tam se zapíná pondělní e-mail
  („Posílat pondělní e-mail“) a stahování plateb („Stahovat platby z banky“).
- **Lidé:** nové lidi zve vedoucí nebo správce ve Zvonci (Přístupy → Pozvat člověka, nebo z karty člověka).
  Odkaz posílej soukromě, ne do skupinového chatu.
- **Co je potřeba na serveru** (logy, doména, obnova ze zálohy, převod dat): issue v repu
  [znackarna/zvonec](https://github.com/znackarna/zvonec/issues). **Tokeny a hesla do issue nikdy nepiš**, ty se
  posílají zvlášť.
- **Převod dalšího sboru z GitHubu:** krok za krokem v návodu serveru,
  https://github.com/znackarna/zvonec#moving-the-church-over.

### Starý provoz na GitHubu

Do 30. 10. 2026 běžel Zvonec jen na GitHubu: aplikace na GitHub Pages, data v soukromém repu
`radomilcz/church-data`, dary v `radomilcz/church-finance`, kontrola a pondělní e-mail v GitHub Actions.
Workflow `web.yml`, `check.yml` a `digest.yml` v church-data jsou vypnuté a Pages taky. `bank.yml`
v church-finance běží, dokud stahování plateb nepřevezme server. Aplikace tenhle režim pořád umí (`GithubStore`,
když vedle ní leží `access.json`), vzory workflow jsou v `zvonec/data-repo/`.

## Co Zvonec umí

| chceme | jde? | jak |
| --- | --- | --- |
| plánování, upozornění, osnova, správa lidí, týmů a skupinek | ano | aplikace + server |
| přihlášení bez GitHub účtu | ano | jméno + heslo |
| registrace nových lidí online | ano, pozvánkou | odkaz na 14 dní, jen jednou; vyplní údaje, souhlas a heslo |
| členové potvrzují nebo odmítají svoje služby | ano | po přihlášení v Moje nebo u setkání |
| skrýt data před členy doopravdy | ano | server dá každému jen to, co smí vidět |
| upozornění vedoucím | ano | kontrola na serveru |
| připomínky e-mailem členům | ano, jednou týdně | v pondělí ráno z adresy zvonec@cirkevjakokrava.cz (níž „Pondělní e-mail“) |
| kalendář v telefonu | ano, stažením .ics | |
| registrace úplně bez pozvánky (formulář pro kohokoli) | ne | jen pozvánkou od vedoucího |
| víc lidí ukládá naráz | ano | změny se sloučí po záznamech |

Další na seznamu: databáze písní k osnově, výměna služby mezi lidmi.

### Pondělní e-mail

Každé pondělí kolem sedmé ráno dostane každý, kdo má přihlášení do Zvonce a vyplněný e-mail, souhrn toho, co na něj
čeká: služby, na které má odpovědět, a co ho ten týden čeká. Vedoucí navíc vidí, co zbývá vyřešit v Obsazení. Když na
člověka nic nečeká, e-mail nepřijde. Vypnout si ho může každý v Můj účet › Moje karta.

E-mail posílá server přes Postmark z adresy zvonec@cirkevjakokrava.cz. Doména má v DNS podpis Postmarku
(`…._domainkey`) a adresu pro vrácené e-maily (`pm-bounces`). Zapíná se v `/admin` › Sbory › „Posílat pondělní
e-mail“, nejdřív po zkušebním e-mailu.


## Osobní údaje (GDPR)

- **Členové, bývalí členové a přátelé sboru:** údaje zpracováváme na základě oprávněné činnosti
  církve (čl. 9 odst. 2 písm. d GDPR) a nikam mimo sbor nejdou. **Hosté:** bez souhlasu jen křestní jméno,
  víc až po souhlasu (na kartě je jeho datum). Kdo se registruje přes pozvánku, dává souhlas sám.
- **Děti do 15 let:** kontakt jde přes rodiče, dítě nemá vlastní telefon ani e-mail.
- **Jak dlouho:** hosty, kteří rok nepřišli, smažeme. Kdo přestal chodit, jde do archivu. Po roce
  v archivu se Zvonec v Archivu i na Přehledu zeptá, jestli karty smazat; po smazání zůstane jen jméno ve
  starých rozpisech.
- **Kdo co vidí:** viz tabulka výš. Členství prozrazuje vyznání (zvláštní kategorie údajů), proto ho člen
  nevidí u nikoho a netiskne se. Důvod, proč někdo nemůže, a upozornění vidí jen vedoucí. V rozpisu na nástěnku
  telefony nejsou.
- **Kde data leží:** v databázi na serveru (znackarna/zvonec), nikdy v tomhle veřejném repu. Ven jde jen
  `public.json` se zveřejněnými setkáními a formáty, bez jediného člověka. Na veřejné ukázce jsou jen vymyšlení
  lidé (`@example.cz`). Pastorační a zdravotní poznámky do Zvonce nepatří.
- **Pravidla na serveru:** ke každému novému poli nebo souboru, který člen vidět nemá, patří pravidlo
  v `policy.ts` serveru a test. Jinak by chyba prozradila údaje lidem, kteří je vidět nemají.
- **Úplný výmaz:** smazání karty ve Zvonci smaže údaje z databáze. V nočních zálohách serveru zůstanou, dokud se
  zálohy nepřepíšou, a ve starém repu church-data v historii gitu, dokud se repo nesmaže nebo nepřepíše
  (`git filter-repo`). Osobní údaje proto nikdy nepatří do veřejného repa, ani zašifrované.
- **Zpracovatel** je Značkárna, která server provozuje; e-maily posílá Postmark. Kde server běží a kdo má přístup
  k zálohám, patří do informace pro členy a do smlouvy se zpracovatelem.

## Vývoj

```
node --test zvonec/test/*.test.mjs          # testy (upozornění, plánování, osnova, přihlášení, úložiště a slučování, .ics, ukázka, check.mjs)
cd docs && python3 -m http.server 8000      # pak http://localhost:8000/zvonec/ (ukázka)
node zvonec/check.mjs cesta/k/data --today 2026-10-04 --markdown souhrn.md
```

Lokální databáze není: aplikaci vyvíjíš v ukázce. Změny serveru (API, pravidla v `policy.ts`) patří do repa
znackarna/zvonec i s testy, podle jeho návodu.

Starý režim na GitHubu lokálně: polož vedle aplikace `docs/zvonec/access.json` s obsahem `{"v":2,"logins":[]}` (a
případně `repo.json` s `{"owner":"…","repo":"…"}`) – ukáže se založení. Oba soubory jsou v `.gitignore`.

Testy a kontrolu syntaxe pouští i GitHub Action `.github/workflows/zvonec.yml` („Zvonec tests“) při každé
změně Zvonce.

## Jak to vzniklo

Tým: doménový analytik (role, služby a pravidla kolizí podle Planning Center, ChurchTools a Elvanta, osekané
na malý sbor), architekt (co jde jen nad GitHubem, bezpečnost klíče, GDPR), designér (převod Otázek na tělo
na aplikaci – stavy tvarem místo barvy, texty tak, jak mluví Kráva) a vývoj. Technický popis je
v [ARCHITECTURE.md](ARCHITECTURE.md).
