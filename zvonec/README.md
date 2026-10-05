# Zvonec – kdo co kdy dělá

Plánovač setkání pro Církev jako kráva: **kalendář, lidi, služby, pořad a kolize**. Běží jen na GitHubu –
aplikace na GitHub Pages, data v soukromém repu, kontrola v GitHub Actions. Žádný server, žádná další služba.

**Živě (ukázka s vymyšlenými lidmi):** https://manifest.cirkevjakokrava.cz/zvonec/

Design je sourozenec [Otázek na tělo](https://otazky.cirkevjakokrava.cz): stejné písmo Agrandir, otisk z Figmy,
pilulky, šipky, tykání a stejná paleta. Bez volby se Zvonec řídí zařízením: ve světlém režimu
krém a hlína (`#f9e7dd` / `#3b2f2f`), v tmavém hlína a růžová (`#3b2f2f` / `#e6acac`). Terč v liště otevře
pět dvojic z palety, které mají dost kontrastu i na drobný text (zelená a dvojice růžová–modrá na to nestačí);
volba se pamatuje v prohlížeči. Tisk jde vždy na bílý papír.

## Co to umí

| sekce | co tam je |
| --- | --- |
| **Kalendář** | měsíc v mřížce (na mobilu seznam dnů), klik do dne = nové setkání, šablony, opakování (týden, 14 dní, měsíc) |
| **Setkání** | kdo co dělá po týmech, výběr lidí seřazený podle toho, kdo může a kdo má nejmíň služeb, „Navrhnout zbytek“, „Stejní lidi jako minule“, stavy navrženo → potvrzeno → nemůže, zrušení, řady |
| **Formáty** | vlastní stránka: každý formát má název, **Proč to děláme** a **Jak to probíhá**, délku, kdo ho vede, odkaz a služby, které potřebuje. Formáty si zakládáš a upravuješ sám; členové je vidí jen ke čtení |
| **Pořad** | setkání se skládá z formátů (Přivítání, Chvály, Kázání, Otázky na tělo, Večeře Páně, Příběh ze života…) – časy se dopočítají, vedoucí se doplní podle služeb, posouvání nahoru a dolů, „Stejný pořad jako minule“, pořad v šabloně. Klik na bod ukáže Proč a Jak. List na A4 na výšku k pultu, volitelně i s Jak |
| **Rozpis** | tabulka měsíce (řádky neděle, sloupce služby po týmech), filtr týmů, tisk na A4 na šířku – na bílý papír, bez telefonů |
| **Lidé** | hledání, stav (člen, chodí pravidelně, host, dítě, neaktivní), domácnosti, co umí (umí / učí se), kdy nemůže, kdy slouží, souhlas se zpracováním údajů, kalendář do telefonu (.ics) |
| **Služby** | služby po týmech, vedoucí, služby, které jeden člověk zvládne naráz (zpěv + kytara), šablony setkání, místa |
| **Kolize** | všechny problémy od dneška po měsících, filtr chyby / pozor / info |
| **Nastavení** | připojení k GitHubu, záloha a nahrání JSON, celý kalendář .ics |

### Kolize

Chyba = takhle to nepůjde (v rozhraní plná plocha). Pozor = ať o tom víš (čárkovaný obrys).
U konkrétního přiřazení jde chybu **povolit jako výjimku** a napsat proč. Zvonec ji pak nehlásí.

| kód | co hlídá | závažnost |
| --- | --- | --- |
| K1 | člověk na dvou setkáních, která se časově kryjí | chyba |
| K2 | dvě služby naráz na jednom setkání (kromě povolených dvojic a služeb mimo své okno – kafe po skončení) | chyba |
| K3 | služba v době, kdy člověk nemůže | chyba |
| K4 / K4b | služba, kterou člověk nemá v profilu / zaučuje se a nikdo zkušený u toho není | chyba / pozor |
| K5 | neobsazená služba (u služby „bez toho to nejde“ týden předem chyba) | pozor / chyba |
| K6 | 5 dní předem pořád jen „navrženo“ | pozor |
| K7 | víc služeb v měsíci, než člověk chce (zkoušky se nepočítají) | pozor |
| K8 | víc neděl po sobě, než člověk chce | pozor |
| K9 | místo obsazené dvakrát naráz (u sdíleného místa jen info) | chyba / info |
| K10 | oba rodiče malých dětí slouží naráz a nikdo z nich není u dětí | pozor |
| K11 | dítě ve službě jen pro dospělé | chyba |
| K12 | u dětí méně než dva dospělí | pozor |
| K13 | neaktivní člověk v rozpisu | pozor |
| K14 | zrušené setkání, na kterém pořád někdo je | info |
| K15 | pořad je delší než setkání | pozor |
| K16 | bod pořadu vede člověk, který v tu dobu nemůže (nebo je neaktivní) | chyba / pozor |
| K17 | bod pořadu nikdo nevede – služba formátu na setkání není | pozor |

Pravidla jsou v `docs/zvonec/kolize.js` a stejný kód běží v aplikaci, v testech i v GitHub Action.

## Jak je to postavené

Jako [Mobilise Playbook](https://playbook.cirkevjakokrava.cz): **GitHub klíč je jeden, ostatní lidi jsou jen data.**

```
veřejné repo radomilcz/cirkevjakokrava           soukromé repo radomilcz/sbor-data

docs/zvonec/  aplikace (kód)  ── bere si ho ──▶  .github/workflows/web.yml
                                                    aplikace + pristup.json → Pages
                                                    https://zvonec.cirkevjakokrava.cz
                                                 pristup.json  zapečetěná přihlášení (bez jmen)
                                                 zvonec.json   lidi, služby, setkání – na web NIKDY
prohlížeč: jméno + heslo → otevře GitHub klíč ──▶  čte a zapisuje zvonec.json přes API
zvonec/kontrola.mjs  ◀── bere si kód ───────────  .github/workflows/kontrola.yml
```

- **Jeden GitHub klíč.** Správce ho jednou vyrobí (fine-grained token jen k `sbor-data`, Contents: read and write)
  a vloží při založení. Nikdo jiný GitHub účet ani token nepotřebuje.
- **Přihlášení = data.** Každé přihlášení má vlastní pár klíčů RSA. Soukromou půlku zamyká jméno a heslo
  (PBKDF2, 310 000 iterací, jako Playbook). Veřejnou půlkou aplikace zamkne kopii GitHub klíče. Kdo zná
  jméno a heslo, odemkne si klíč a může pracovat. `pristup.json` jde na web, ale jména ani klíč v něm
  čitelně nejsou. Svůj záznam najde jen ten, kdo zná jméno a heslo. GitHub klíč jde vyměnit i bez nových
  hesel: aplikace nový klíč zamkne každou veřejnou půlkou zvlášť (Nastavení → GitHub klíč).
- **Role** – správce (všechno, přihlášení, klíč), vedoucí (plánuje, zve lidi), člen (vidí kalendář, rozpis
  a pořad, potvrzuje nebo odmítá svoje služby, zapisuje, kdy nemůže, upravuje svůj kontakt). Na role
  dohlíží aplikace, ne GitHub. Kdo má přihlášení, má klíč ve svém prohlížeči, takže technicky zdatný člen
  by se k datům dostal i mimo aplikaci. Přihlášení proto dostávají lidi, kterým sbor věří. Klíč jde
  kdykoli vyměnit.
- **Pozvánka = online registrace.** Vedoucí vytvoří pozvánku (Nastavení → Pozvat nového člověka, nebo
  u konkrétního člověka). Odkaz platí 14 dní a jde použít jen jednou. Nový člověk vyplní jméno, kontakt,
  s čím pomůže, a vlastní heslo, zaškrtne **souhlas** a je v rozpisu. Zapíše se jako host a služby
  dostane jako „učí se“. Vedoucí to pak upraví.
- **Data** jsou jeden JSON v soukromém repu. Pages jsou vždycky veřejné, proto `zvonec.json` na web nikdy
  nejde (workflow to i hlídá).
- **Ukládání**: změny se sbírají a po vteřině a půl odejdou jedním commitem („Zvonec: Petr na Zvuk, …“).
  Když mezitím uložil někdo jiný, GitHub vrátí 409 – aplikace načte čerstvou verzi, **sloučí po záznamech**
  a uloží znovu. Co uložil někdo jiný, aplikace stáhne, když se vrátíš do okna, a pak každou minutu.
- **Nové a zrušené přihlášení** se projeví za pár minut – až workflow přestaví web s novým `pristup.json`.
- **Ukázka:** když vedle aplikace `pristup.json` neleží (manifest.cirkevjakokrava.cz/zvonec/), běží
  aplikace jako ukázka v `localStorage` s vymyšlenými lidmi. Hodí se na vyzkoušení a na školení vedoucích.
- **Kontrola v Actions**: `zvonec/kontrola.mjs` pustí stejná pravidla nad `zvonec.json`. Když najde chybu
  u setkání, které ještě nebylo, běh zčervená a GitHub pošle e-mail.

```
docs/zvonec/index.html   kostra stránky, CSP (ven jen api.github.com)
docs/zvonec/styl.css     design (tokeny z Otázek na tělo), tisk A4
docs/zvonec/app.js       obrazovky, dialogy, přihlášení, pozvánky
docs/zvonec/pristup.js   přihlášení jako v Playbooku: klíče, pečetění, hesla
docs/zvonec/kolize.js    pravidla kolizí, výběr lidí, „Navrhnout zbytek“
docs/zvonec/porad.js     pořad z formátů: časy, kdo vede, přidání formátu i s jeho službami
docs/zvonec/cas.js       datumy (místní čas jako text „2026-10-11T10:00“), opakování, česky
docs/zvonec/data.js      úložiště (prohlížeč / GitHub), slučování, fronta ukládání
docs/zvonec/ics.js       export do kalendáře v telefonu
docs/zvonec/ukazka.js    vymyšlená ukázková data počítaná od dneška
docs/zvonec/otisk.svg    otisk z Figmy (55 cest)
zvonec/kontrola.mjs      kontrola z příkazové řádky / Actions
zvonec/test/             testy (node --test zvonec/test/*.test.mjs)
zvonec/sbor-data/        vzory workflow pro datové repo (web.yml, kontrola.yml)
```

Fonty, ikony a favicon se berou z manifestu (`docs/assets/`). Build manifestu (`build.py`) do
`docs/zvonec/` nesahá.

## Spuštění naostro (jednou, ~15 minut)

1. **Soukromé repo** `radomilcz/sbor-data` (prázdné).
2. Zkopírovat `zvonec/sbor-data/web.yml` a `zvonec/sbor-data/kontrola.yml` do jeho `.github/workflows/`.
3. **Pages**: v `sbor-data` Settings → Pages → Source: **GitHub Actions**, Custom domain
   `zvonec.cirkevjakokrava.cz`, po ověření *Enforce HTTPS*. DNS: záznam `zvonec` typu **CNAME** →
   `radomilcz.github.io.` (stejně jako u Playbooku; Pages ze soukromého repa = GitHub Pro).
   Actions → Web → *Run workflow*.
4. **GitHub klíč**: Settings → Developer settings → Fine-grained tokens → Generate new token,
   *Only select repositories* → `sbor-data`, Permissions → Repository → **Contents: Read and write**. Nic víc.
5. Otevřít https://zvonec.cirkevjakokrava.cz – nikdo tam ještě není, takže se ukáže **Založit Zvonec**:
   vložit klíč, svoje jméno a heslo. Jako základ jde vzít ukázku (služby, týmy, formáty, šablony – bez lidí).
6. Přidat lidi (nebo poslat pozvánky) a v kalendáři ze šablony „Setkání na pastvě“ založit setkání,
   které se opakuje každý týden. Vedoucím dát roli vedoucí (u člověka → Přihlášení → Nové heslo / role).

## Co jde a co nejde jen s GitHubem

| chceme | jde? | jak |
| --- | --- | --- |
| plánování, kolize, pořad, správa lidí | ano | aplikace + soukromé repo |
| přihlášení bez GitHub účtu | ano | jméno + heslo, jeden zapečetěný klíč (jako Playbook) |
| online registrace nových lidí | ano, pozvánkou | odkaz na 14 dní, jednou; vyplní údaje, souhlas a heslo |
| členové potvrzují / odmítají svoje služby | ano | po přihlášení u svojí služby |
| historie změn, kdo co změnil | ano | každé uložení je commit |
| upozornění vedoucím | ano | Actions + e-mail od GitHubu při chybě v rozpisu |
| kalendář v telefonu | ano, stažením .ics | odběr (feed) by musel ležet na veřejných Pages – jména by šla ven |
| připomínky e-mailem členům | ne | GitHub neposílá e-maily lidem bez účtu |
| registrace úplně bez pozvánky (formulář pro kohokoli) | ne | kdo by mohl zapisovat bez pozvánky, dostal by klíč i k datům ostatních |

Další na seznamu: databáze písní k pořadu; výměna služby mezi lidmi; připomínky (potřebují službu,
která umí poslat e-mail nebo SMS – to už je mimo GitHub).

## Osobní údaje

- Členství ve sboru prozrazuje vyznání – zvláštní kategorie údajů. Data proto jen v **soukromém** repu,
  na web jde jen `pristup.json` bez jmen. Na veřejné ukázce jsou jen vymyšlená jména (`@example.cz`).
- U každého člověka je pole **souhlas** (datum). Kdo se registruje přes pozvánku, dává souhlas sám.
  Rozpis na nástěnku telefony netiskne. Důvod, proč někdo nemůže, a kolize vidí jen vedoucí.
- Smazaný člověk zůstane v historii gitu. Úplný výmaz = přepsat historii datového repa
  (`git filter-repo`) – proto osobní data nikdy ne do veřejného repa, ani zašifrovaná.
- Zpracovatel je GitHub (data v USA, EU-US Data Privacy Framework) – patří do informace pro členy.

## Vývoj

```
node --test zvonec/test/*.test.mjs        # testy jádra (kolize, pořad, přihlášení, slučování, .ics, GitHub s podvrženým API)
cd docs && python3 -m http.server 8000    # pak http://localhost:8000/zvonec/ (ukázka)
```

Ostrý režim lokálně: polož vedle aplikace `pristup.json` s obsahem `{"v":1,"pristupy":[]}` – ukáže se založení.

Testy pouští i GitHub Action `.github/workflows/zvonec.yml` při každé změně Zvonce.

## Jak to vzniklo

Tým: doménový analytik (specifikace služeb a 14 pravidel kolizí podle Planning Center, ChurchTools
a Elvanta, osekaná na malý sbor), architekt (co jde jen nad GitHubem, bezpečnost tokenů, GDPR),
designér (převod Otázek na tělo na aplikaci – stavy tvarem místo barvy, texty v rozhraní tak, jak mluví Kráva)
a vývoj. Zadání a rozhodnutí jsou shrnutá výš.
