# Zvonec – kdo co kdy dělá

Zvonec je správa sboru a plánovač setkání pro Církev jako kráva: **lidé, týmy a skupinky, kalendář
s rozpisem služeb, osnova setkání a upozornění**. Běží jen na GitHubu – aplikace na GitHub Pages, data
v soukromém repu, kontrola v GitHub Actions. Žádný server, žádná další služba.

**Ukázka s vymyšlenými lidmi:** https://manifest.cirkevjakokrava.cz/zvonec/

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
přihlášený, vidí jen **Program** a **Jak se scházíme** – setkání a formáty, které vedoucí zveřejnili –
a tlačítko **Přihlásit se**.

Každá obrazovka má nahoře název, vpravo hlavní tlačítko (třeba **Přidat setkání**) a pod názvem záložky
s pohledy.

| obrazovka | co tam je |
| --- | --- |
| **Přehled** | úvod pro všechny: co čeká na tvoji odpověď (Potvrdit / Nemůžu), tvoje služby na osm týdnů dopředu (i do kalendáře v telefonu, .ics), příští neděle, tento týden ve sboru, kdy nemůžeš, tvoje skupiny. Vedoucí navíc vidí, co nesedí, volná místa na příští tři týdny, služby čekající na potvrzení a karty lidí k doplnění; správce ještě pozvánky, které čekají, a přístupy bez karty |
| **Kalendář** | jedna stránka a čtyři pohledy: **Měsíc** (mřížka, na telefonu malá mřížka a pod ní seznam vybraného dne), **Týden** (hodiny na ose, na telefonu tři dny), **Seznam** (po týdnech, s obrázky) a **Rozpis**. Nad nimi šipky ‹ ›, **Dnes** a filtry: **Účel** (Nedělní setkání, Zkouška, Skupinka, Akce), **Tým** a **Jen moje služby**. Pohled si Zvonec pamatuje |
| **Rozpis** | tabulka měsíce: řádky jsou setkání, sloupce role po týmech. Vedoucí klikne do buňky, vybere člověka a hotovo; člen vidí tabulku jen ke čtení se svými službami zvýrazněnými. Tisk na A4 na šířku – bez telefonů |
| **Setkání** | detail s obrázkem a třemi záložkami. **Přehled**: popis, poznámka pro tým, kdo slouží, začátek osnovy, mapa, upozornění a po skončení kolik lidí přišlo (jen počet, ne kdo). **Kdo slouží**: služby po týmech, výběr lidí s důvody, proč by to nešlo, „Navrhnout lidi“, „Obsadit jako minule“, „Kolik lidí je potřeba“, stavy čeká na potvrzení → potvrzeno → nemůže, výjimka u upozornění. **Osnova**: viz níže |
| **Přidat setkání** | ve dvou krocích: nejdřív **Podle čeho?** (šablona, nebo „Bez šablony“), pak název, kdy, kde a pro koho; zbytek (obrázek, popis, zveřejnění, poznámka pro tým) je v **Dalších možnostech**. Opakování: každý týden, každých 14 dní, každý měsíc ve stejný den v týdnu (třeba každou první neděli). Hotovou řadu prodloužíš v detailu setkání (**Prodloužit řadu**). Při úpravě řady se Zvonec zeptá, jestli jen tohle setkání, nebo i další |
| **Osnova** | setkání se skládá z formátů (Přivítání, Chvály, Kázání, Otázky na tělo, Večeře Páně…). Časy se dopočítají, vedoucí bodů se doplní podle rolí, body jdou přetahovat, je tu „Převzít minulou osnovu“ a součet proti délce setkání. Formát může přinést další role (Večeře Páně potřebuje dva lidi) – na setkání se objeví jako volná místa a „Navrhnout lidi“ je obsadí taky. List na A4 na výšku k pultu, dost velký i na plátno |
| **Upozornění** | všechno, co v rozpisu nesedí, od dneška i zpětně. Pohledy **Podle setkání** a **Podle lidí**, filtr chyba / pozor / info. Rovnou tu jde vybrat jiného člověka nebo napsat „Vím o tom“ |
| **Lidé** | pohledy **Seznam**, **Tabulka** (třídění, sloupce, hromadné akce: zkopírovat e-maily, přidat do skupiny, stáhnout jako CSV; na počítači výchozí), **Domácnosti**, **Podle skupin**, **Narozeniny** a **Břemeno** (kolik služeb má kdo tenhle měsíc proti tomu, kolik jich zvládne). Filtry Všichni · Členové · Přátelé · Hosté · Děti · Už nechodí (a Chybí údaje, když nějaké chybí), hledání podle jména, telefonu i e-mailu. Karta člověka: vlevo osobní údaje, vpravo skupiny, služby, kdy nemůže, břemeno a upozornění; každý blok upravíš zvlášť. Člen má Seznam, Domácnosti a Podle skupin |
| **Týmy a skupinky** | **Týmy**, **Skupinky**, **Vedení** a **Kdo co umí** (tabulka lidé × role: nic / učí se / umí, vedoucí klikem přepíná; u role je vidět, kolik lidí ji umí). V týmu záložky **Lidé**, **Role**, **Kdo co umí** a **Setkání**. Role: kolik lidí, „Bez toho to nepůjde“, jen pro dospělé, u dětí, jen část setkání, které role zvládne jeden člověk naráz. Starý tým jde dát do archivu |
| **Jak se scházíme** | stavební kameny setkání na třech záložkách. **Šablony** (jaká setkání máme: den, čas, délka, místo, obrázek, popis, kdo je potřeba a osnova; v šabloně vidíš i řady, které z ní vznikly), **Formáty** (z čeho se skládá osnova: u každého proč ho děláme a jak probíhá; členové čtou, vedoucí upravují) a **Místa** (budovy s adresou a mapou a místnosti v nich). Co tu zveřejníš, uvidí návštěvníci webu |
| **Nastavení** | **Sbor** (název, hlavní místo, adresa), **Pravidla** (kolik služeb je moc, kdy Zvonec bučí, od kolika let je člověk dospělý), **Přístupy** (kdo se může přihlásit, pozvánky, GitHub klíč) a **Záloha** (stáhnout, nahrát – jen správce; celý kalendář do telefonu) |
| **Můj účet** | po kliknutí na tvoje jméno nahoře: můj kontakt a kdo ho vidí, kdy nemůžu, moje služby do kalendáře, barvy, změna hesla, odhlášení. V ukázce i „Dívat se jako“ |
| **Program**, **Jak se scházíme** | veřejná část pro ty, kdo nejsou přihlášení: nejbližší setkání s obrázkem, časem, místem a mapou, pak další týdny a „Kde nás najdete“; u každého setkání je tlačítko „Stáhnout do kalendáře“ (.ics). Dál zveřejněné formáty. V ukázce ji otevře „Veřejná část“ dole v menu |

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
| telefon, e-mail | ano | jen když to člověk dovolil („Telefon a e-mail smí vidět i ostatní ve sboru“) |
| členství, narození, poznámka, souhlas, přístup, břemeno | ano | ne |
| skupiny | ano | jen názvy |
| služby, kdy nemůže, upozornění | ano | jen svoje (rozpis vidí celý) |

Správce navíc zakládá a ruší přístupy a mění GitHub klíč. Vedoucí plánuje, upravuje lidi a skupiny a zve
nové lidi. Člen vidí kalendář, rozpis a osnovu, odpovídá na svoje služby, zapisuje, kdy nemůže, a upravuje
svůj kontakt.

Členství ve sboru prozrazuje vyznání, proto se v pohledu pro členy ani v tisku nikdy neukazuje.

### Upozornění

Chyba = takhle to nepůjde: v seznamu upozornění plná tečka, v kalendáři a u služby plná plocha.
Pozor = ať o tom víš: prázdné kolečko, v kalendáři čárkovaný obrys. U konkrétní služby jde chybu
**povolit jako výjimku** („Vím o tom“) a napsat proč – Zvonec ji pak hlásí jen jako info.

| kód | co hlídá | závažnost |
| --- | --- | --- |
| K1 | člověk na dvou setkáních, která se časově kryjí | chyba |
| K2 | dvě role naráz na jednom setkání (kromě rolí, které jde dělat zároveň, a rolí, které trvají jen část setkání – kafe po skončení) | chyba |
| K3 | služba v době, kdy člověk nemůže | chyba |
| K4 / K4b | role, kterou člověk v týmu nemá / učí se a nikdo zkušený u toho není | chyba / pozor |
| K5 | neobsazená role – i ta, kterou přinesl formát v osnově (u role „Bez toho to nepůjde“ týden předem chyba) | pozor / chyba |
| K6 | pět dní předem pořád „čeká na potvrzení“ | pozor |
| K7 | víc služeb v měsíci, než člověk chce (zkoušky se nepočítají) | pozor |
| K8 | víc nedělí po sobě, než člověk chce | pozor |
| K9 | místo obsazené dvakrát naráz (u sdíleného místa jen info) | chyba / info |
| K10 | oba rodiče malých dětí slouží naráz a nikdo z nich není u dětí | pozor |
| K11 | dítě v roli jen pro dospělé | chyba |
| K12 | u dětí méně než dva dospělí | pozor |
| K13 | v rozpisu je někdo, kdo už nechodí nebo má pauzu | pozor |
| K14 | zrušené setkání, na kterém pořád někdo je | info |
| K15 | osnova je delší než setkání | pozor |
| K16 | bod osnovy vede člověk, který v tu dobu nemůže, už nechodí nebo má pauzu | chyba / pozor |
| K17 | bod osnovy nikdo nevede, protože role z formátu už neexistuje | pozor |

Pravidla jsou v `docs/zvonec/lib/conflicts.js`. Stejný kód běží v aplikaci, v testech i v kontrole
v GitHub Actions.

## Jak je to postavené

Jako [Mobilise Playbook](https://playbook.cirkevjakokrava.cz): **GitHub klíč je jeden, ostatní lidé jsou jen data.**

```
veřejné repo radomilcz/cirkevjakokrava          soukromé datové repo radomilcz/church-data

docs/zvonec/  aplikace ── bere si ji ─────────▶  .github/workflows/web.yml
                                                   aplikace + access.json + public.json → Pages
                                                   https://zvonec.cirkevjakokrava.cz
                                                access.json   zapečetěné přístupy (bez jmen)
                                                public.json  jen zveřejněná setkání a formáty (bez lidí)
                                                data/*.json   lidé, skupiny, setkání – na web NIKDY
prohlížeč: jméno + heslo → odemkne klíč ───────▶  čte a zapisuje data/ přes GitHub API
zvonec/check.mjs ◀── bere si kód ──────────────  .github/workflows/check.yml
```

- **Jeden GitHub klíč.** Správce ho jednou vyrobí (fine-grained token jen k datovému repu, Contents: Read
  and write) a vloží ho při založení. Nikdo další GitHub účet ani vlastní klíč nepotřebuje.
- **Přístupy jsou data.** Každý přístup má vlastní pár klíčů RSA. Soukromou půlku zamyká jméno a heslo
  (PBKDF2, 310 000 iterací, jako Playbook), veřejnou půlkou aplikace zamkne kopii GitHub klíče. Kdo zná
  jméno a heslo, odemkne si klíč a může pracovat. `access.json` jde na web, ale jména ani klíč v něm čitelně
  nejsou. GitHub klíč jde vyměnit i bez nových hesel (Nastavení → Přístupy → GitHub klíč).
- **Kdo se může přihlásit, má klíč.** Na to, co kdo vidí, dohlíží aplikace, ne GitHub. Technicky zdatný člen by
  se k datům dostal i mimo aplikaci. Přihlásit se proto můžou jen lidé, kterým sbor věří, a do Zvonce
  nepatří žádné pastorační, zdravotní ani finanční poznámky. Klíč jde kdykoli vyměnit.
- **Pozvánka = registrace online.** Vedoucí vytvoří pozvánku (Nastavení → Přístupy → Pozvat nového
  člověka, nebo v Lidech tlačítkem Pozvat). Odkaz platí 14 dní a jde použít jen jednou. Nový člověk vyplní jméno,
  kontakt, s čím pomůže, vlastní heslo, zaškrtne **souhlas** a je v Lidech jako host. Role, se kterými
  chce pomáhat, dostane jako „učí se“. Vedoucí to pak upraví.
- **Ukládání:** změny se sbírají a po chvilce odejdou jako commit („Zvonec: Petr na Zvuk, …“). Každý
  soubor s daty se ukládá zvlášť, takže se zapíše jen to, co se změnilo. Když mezitím uložil někdo jiný,
  aplikace načte čerstvou verzi, **sloučí změny po záznamech** a uloží znovu. Co uložil někdo jiný,
  aplikace stáhne, když se vrátíš do okna, a pak každou minutu.
- **Nový a zrušený přístup** začne platit za pár minut – až workflow `web.yml` znovu vystaví web s novým
  `access.json`.
- **Ukázka:** když vedle aplikace `access.json` neleží (manifest.cirkevjakokrava.cz/zvonec/), běží aplikace
  jako ukázka v prohlížeči s vymyšlenými lidmi. V Mém účtu se přes „Dívat se jako“ podíváš očima kohokoli z ukázky –
  hodí se na školení vedoucích i na vyzkoušení pohledu člena.
- **Kontrola v Actions:** `zvonec/check.mjs` pustí stejná pravidla nad složkou `data/`. Když najde chybu
  u setkání, které ještě nebylo, běh zčervená a GitHub pošle e-mail.

### Soubory s daty (soukromé repo)

```
data/people.json     lidé a domácnosti
data/groups.json     skupiny, role týmů, kdo je ve skupině a co umí
data/events.json     šablony, setkání se službami a osnovou, řady, formáty, místa, kdy kdo nemůže, kolik kdo slouží
data/settings.json   název a adresa sboru, výchozí limity, kdy Zvonec bučí
access.json          zapečetěné přístupy – jde na web, neobsahuje jména
```

Přesný tvar záznamů je v [ARCHITECTURE.md](ARCHITECTURE.md). Smazaný člověk může někde zůstat jako
„někdo smazaný“; při dalším uložení souboru, ve kterém je, zmizí.

### Kód

```
docs/zvonec/index.html, style.css, imprint.svg   kostra stránky (CSP: ven jen api.github.com a mapy OpenStreetMap), základ vzhledu, tisk A4
docs/zvonec/css/          barvy a rozměry (tokens.css), barevné dvojice (palettes.css – vyrábí je zvonec/palettes.mjs)
                          a styly jednotlivých částí
docs/zvonec/app.js        start (ukázka / naostro), přihlášení, adresy obrazovek, menu, stav ukládání
docs/zvonec/lib/          logika bez obrazovek: lidé, místa, skupiny, setkání a řady, osnova, plánování, upozornění,
                          kontrola dat, přístupy, úložiště (GitHub / prohlížeč) a slučování, .ics, ukázková data
docs/zvonec/ui/           obrazovky a stavebnice (kit): Přehled, kalendář, setkání, rozpis, lidé, týmy, Jak se scházíme,
                          výběr lidí, upozornění, nastavení, Můj účet, veřejná část, přihlášení; stránka #kit ukazuje
                          všechny součástky v barvách Krém a hlína i Hlína a růžová
zvonec/check.mjs          kontrola upozornění z příkazové řádky / Actions
zvonec/build-public.mjs   veřejný výřez dat (zveřejněná setkání a formáty) pro web
zvonec/palettes.mjs       barevné dvojice: z podkladu a písma dopočítá všechny barvy, ověří kontrast a zapíše
                          docs/zvonec/css/palettes.css (node zvonec/palettes.mjs)
zvonec/test/              testy (node --test zvonec/test/*.test.mjs)
zvonec/data-repo/         vzory workflow pro datové repo (web.yml, check.yml)
```

Jak se přidává nová část, je v [ARCHITECTURE.md](ARCHITECTURE.md), pravidla vzhledu
v [DESIGN.md](DESIGN.md).

Písma, ikony a favicon se berou z manifestu (`docs/assets/`). Build manifestu (`build.py`) do
`docs/zvonec/` nesahá.

## Spuštění naostro (jednou, asi 15 minut)

1. **Soukromé repo** pro data `radomilcz/church-data` (prázdné).
2. Zkopírovat `zvonec/data-repo/web.yml` a `zvonec/data-repo/check.yml` do jeho `.github/workflows/`.
3. **Pages:** v datovém repu Settings → Pages → Source: **GitHub Actions**, Custom domain
   `zvonec.cirkevjakokrava.cz`, po ověření *Enforce HTTPS*. DNS: záznam `zvonec` typu **CNAME** →
   `radomilcz.github.io.` (stejně jako u Playbooku; Pages ze soukromého repa vyžadují GitHub Pro).
   Pak Actions → Web → *Run workflow*.
4. **GitHub klíč:** Settings → Developer settings → Fine-grained tokens → Generate new token,
   *Only select repositories* → datové repo, Permissions → Repository → **Contents: Read and write**. Nic víc.
5. Otevřít https://zvonec.cirkevjakokrava.cz – nikdo tam ještě není, takže se ukáže **Založit Zvonec**:
   vložit klíč, svoje jméno a heslo. Jako základ jde vzít ukázku (skupiny, role, formáty, šablony, místa –
   bez lidí).
6. V Lidech přidat lidi (nebo rozeslat pozvánky), v Týmech a skupinkách je zařadit do týmů a v Kalendáři ze šablony
   „Setkání na pastvě“ založit setkání, které se opakuje každý týden. Vedoucím dát oprávnění „vedoucí“
   (karta člověka → Přístup).

## Co jde a co nejde jen s GitHubem

| chceme | jde? | jak |
| --- | --- | --- |
| plánování, upozornění, osnova, správa lidí, týmů a skupinek | ano | aplikace + soukromé repo |
| přihlášení bez GitHub účtu | ano | jméno + heslo, jeden zapečetěný klíč (jako Playbook) |
| registrace nových lidí online | ano, pozvánkou | odkaz na 14 dní, jen jednou; vyplní údaje, souhlas a heslo |
| členové potvrzují nebo odmítají svoje služby | ano | po přihlášení v Přehledu nebo u setkání |
| historie změn, kdo co změnil | ano | každé uložení je commit |
| upozornění vedoucím | ano | Actions + e-mail od GitHubu, když je v rozpisu chyba |
| kalendář v telefonu | ano, stažením .ics | odběr by musel ležet na veřejných Pages – jména by šla ven |
| skrýt data před členy doopravdy | ne | jeden klíč čte všechno; skrývání je jen v aplikaci |
| připomínky e-mailem členům | ne | GitHub neposílá e-maily lidem bez účtu |
| registrace úplně bez pozvánky (formulář pro kohokoli) | ne | kdo by mohl zapisovat bez pozvánky, dostal by klíč i k datům ostatních |
| víc lidí ukládá naráz | ano | změny se sloučí po záznamech; smazání člověka se ale do všech souborů nepropíše naráz |

Další na seznamu: databáze písní k osnově, výměna služby mezi lidmi, připomínky (potřebují službu, která
umí poslat e-mail nebo SMS – to už je mimo GitHub).

## Osobní údaje (GDPR)

- **Členové, bývalí členové a přátelé sboru:** údaje zpracováváme na základě oprávněné činnosti
  církve (čl. 9 odst. 2 písm. d GDPR) a nikam mimo sbor nejdou. **Hosté:** bez souhlasu jen křestní jméno,
  víc až po souhlasu (na kartě je jeho datum). Kdo se registruje přes pozvánku, dává souhlas sám.
- **Děti do 15 let:** kontakt jde přes rodiče, dítě nemá vlastní telefon ani e-mail.
- **Jak dlouho:** hosty, kteří rok nepřišli, smažeme. U bývalých členů po roce necháme jen jméno a data
  členství.
- **Kdo co vidí:** viz tabulka výš. Členství prozrazuje vyznání (zvláštní kategorie údajů), proto ho člen
  nevidí u nikoho a netiskne se. Důvod, proč někdo nemůže, a upozornění vidí jen vedoucí. V rozpisu na nástěnku
  telefony nejsou.
- **Kde data leží:** jen v **soukromém** repu, na web jde jen `access.json` bez jmen a `public.json` se zveřejněnými
  setkáními a formáty, bez jediného člověka (workflow to hlídá).
  Na veřejné ukázce jsou jen vymyšlení lidé (`@example.cz`). Žádné pastorační, zdravotní ani finanční
  poznámky – jeden klíč znamená, že každý přihlášený prohlížeč přečte všechno.
- **Úplný výmaz:** git si pamatuje staré verze. Smazat někoho úplně znamená přepsat historii datového repa
  (`git filter-repo`) – proto osobní údaje nikdy nepatří do veřejného repa, ani zašifrované.
- **Zpracovatel** je GitHub (data v USA, EU-US Data Privacy Framework) – to patří do informace pro členy.

## Vývoj

```
node --test zvonec/test/*.test.mjs          # testy (upozornění, plánování, osnova, přihlášení, úložiště a slučování, .ics, ukázka, check.mjs)
cd docs && python3 -m http.server 8000      # pak http://localhost:8000/zvonec/ (ukázka)
node zvonec/check.mjs cesta/k/data --today 2026-10-04 --markdown souhrn.md
```

Ostrý režim lokálně: polož vedle aplikace `docs/zvonec/access.json` s obsahem `{"v":2,"logins":[]}` (a
případně `repo.json` s `{"owner":"…","repo":"…"}`) – ukáže se založení. Oba soubory jsou v `.gitignore`.

Testy a kontrolu syntaxe pouští i GitHub Action `.github/workflows/zvonec.yml` („Zvonec tests“) při každé
změně Zvonce.

## Jak to vzniklo

Tým: doménový analytik (role, služby a pravidla kolizí podle Planning Center, ChurchTools a Elvanta, osekané
na malý sbor), architekt (co jde jen nad GitHubem, bezpečnost klíče, GDPR), designér (převod Otázek na tělo
na aplikaci – stavy tvarem místo barvy, texty tak, jak mluví Kráva) a vývoj. Technický popis je
v [ARCHITECTURE.md](ARCHITECTURE.md).
