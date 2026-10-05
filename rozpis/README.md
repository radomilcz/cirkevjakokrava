# Rozpis – kdo co kdy dělá

Plánovač setkání pro Církev jako kráva: **kalendář, lidi, služby, pořad a kolize**. Běží jen na GitHubu –
aplikace na GitHub Pages, data v soukromém repu, kontrola v GitHub Actions. Žádný server, žádná další služba.

**Živě (ukázka s vymyšlenými lidmi):** https://manifest.cirkevjakokrava.cz/rozpis/

Design je sourozenec [Otázek na tělo](https://otazky.cirkevjakokrava.cz): stejné dvě barvy
(`#3b2f2f` / `#e6acac`), písmo Agrandir, otisk z Figmy, pilulky, šipky, tykání.

## Co to umí

| sekce | co tam je |
| --- | --- |
| **Kalendář** | měsíc v mřížce (na mobilu seznam dnů), klik do dne = nové setkání, šablony, opakování (týden, 14 dní, měsíc) |
| **Setkání** | kdo co dělá po týmech, výběr lidí seřazený podle toho, kdo může a kdo má nejmíň služeb, „Navrhnout zbytek“, „Stejní lidi jako minule“, stavy navrženo → potvrzeno → nemůže, zrušení, řady |
| **Pořad** | setkání se skládá z formátů (Přivítání, Chvály, Kázání, Otázky na tělo, Večeře Páně, Příběh ze života…) – časy se dopočítají, vedoucí se doplní podle služeb, posouvání nahoru/dolů, „Stejný pořad jako minule“, pořad v šabloně, list na A4 na výšku k pultu |
| **Rozpis** | tabulka měsíce (řádky neděle, sloupce služby po týmech), filtr týmů, tisk na A4 na šířku – na bílý papír, bez telefonů |
| **Lidé** | hledání, stav (člen, chodí pravidelně, host, dítě, neaktivní), domácnosti, co umí (umí / učí se), kdy nemůže, kdy slouží, souhlas se zpracováním údajů, kalendář do telefonu (.ics) |
| **Služby** | služby po týmech, vedoucí, služby, které jeden člověk zvládne naráz (zpěv + kytara), formáty pořadu, šablony setkání, místa |
| **Kolize** | všechny problémy od dneška po měsících, filtr chyby / pozor / info |
| **Nastavení** | připojení k GitHubu, záloha a nahrání JSON, celý kalendář .ics |

### Kolize

Chyba = takhle to nepůjde (v rozhraní plná plocha). Pozor = ať o tom víš (čárkovaný obrys).
Chybu jde u konkrétního přiřazení **přebít s důvodem** – pak z ní je info.

| kód | co hlídá | závažnost |
| --- | --- | --- |
| K1 | člověk na dvou setkáních, která se časově kryjí | chyba |
| K2 | dvě služby naráz v jednom setkání (kromě povolených dvojic a služeb mimo své okno – kafe po skončení) | chyba |
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
| K17 | bod pořadu nikdo nevede – služba formátu v setkání není | pozor |

Pravidla jsou v `docs/rozpis/kolize.js` a stejný kód běží v aplikaci, v testech i v GitHub Action.

## Jak je to postavené

Jako [Mobilise Playbook](https://playbook.cirkevjakokrava.cz): **GitHub klíč je jeden, ostatní lidi jsou jen data.**

```
veřejné repo radomilcz/cirkevjakokrava           soukromé repo radomilcz/sbor-data

docs/rozpis/  aplikace (kód)  ── bere si ho ──▶  .github/workflows/web.yml
                                                    aplikace + pristup.json → Pages
                                                    https://kalendar.cirkevjakokrava.cz
                                                 pristup.json  zapečetěná přihlášení (bez jmen)
                                                 rozpis.json   lidi, služby, setkání – na web NIKDY
prohlížeč: jméno + heslo → otevře GitHub klíč ──▶  čte a zapisuje rozpis.json přes API
rozpis/kontrola.mjs  ◀── bere si kód ───────────  .github/workflows/kontrola.yml
```

- **Jeden GitHub klíč.** Správce ho jednou vyrobí (fine-grained token jen k `sbor-data`, Contents: read and write)
  a vloží při založení. Nikdo jiný GitHub účet ani token nepotřebuje.
- **Přihlášení = data.** Každé přihlášení má vlastní pár klíčů RSA. Soukromou půlku zamyká jméno + heslo
  (PBKDF2, 310 000 iterací, jako Playbook), k veřejné je zapečetěný GitHub klíč. Kdo zná jméno a heslo,
  otevře si klíč a pracuje. `pristup.json` jde na web, ale jména ani klíč v něm čitelně nejsou – záznam se
  najde až odvozením ze jména a hesla. Výměna GitHub klíče hesla nepotřebuje: nový se zapečetí ke všem
  veřejným půlkám (Nastavení → GitHub klíč).
- **Role** – správce (všechno, přihlášení, klíč), vedoucí (plánuje, zve lidi), člen (vidí kalendář, rozpis
  a pořad, potvrzuje nebo odmítá svoje služby, zapisuje, kdy nemůže, upravuje svůj kontakt). Role hlídá
  aplikace. Kdo má přihlášení, drží ve svém prohlížeči klíč, takže technicky zdatný člen by se k datům
  dostal i mimo aplikaci – přihlášení proto dostávají lidi, kterým sbor věří, a klíč jde kdykoli vyměnit.
- **Pozvánka = online registrace.** Vedoucí vytvoří pozvánku (Nastavení → Pozvat nového člověka, nebo
  u konkrétního člověka). Odkaz platí 14 dní a jen jednou: nový člověk vyplní jméno, kontakt, s čím pomůže,
  **souhlas** a vlastní heslo – a je v rozpisu (jako host, služby jako „učí se“, vedoucí to pak upraví).
- **Data** jsou jeden JSON v soukromém repu. Pages jsou vždycky veřejné, proto `rozpis.json` na web nikdy
  nejde (workflow to i hlídá).
- **Ukládání**: změny se sbírají a po vteřině a půl odejdou jedním commitem („Rozpis: Petr na Zvuk, …“).
  Když mezitím uložil někdo jiný, GitHub vrátí 409 – aplikace načte čerstvou verzi, **sloučí po záznamech**
  a uloží znovu. Co uložil někdo jiný, se dotáhne při návratu do okna a každou minutu.
- **Nové a zrušené přihlášení** se projeví za pár minut – až workflow přestaví web s novým `pristup.json`.
- **Bez `pristup.json`** vedle sebe (manifest.cirkevjakokrava.cz/rozpis/) běží aplikace jako ukázka
  v `localStorage` s vymyšlenými lidmi – na vyzkoušení a na školení vedoucích.
- **Kontrola v Actions**: `rozpis/kontrola.mjs` pustí stejná pravidla nad `rozpis.json`; při chybě v budoucnu
  běh zčervená a GitHub pošle e-mail.

```
docs/rozpis/index.html   kostra stránky, CSP (ven jen api.github.com)
docs/rozpis/styl.css     design (tokeny z Otázek na tělo), tisk A4
docs/rozpis/app.js       obrazovky, dialogy, přihlášení, pozvánky
docs/rozpis/pristup.js   přihlášení jako v Playbooku: klíče, pečetění, hesla
docs/rozpis/kolize.js    pravidla kolizí, výběr lidí, „Navrhnout zbytek“
docs/rozpis/porad.js     pořad z formátů: časy, kdo vede, přidání formátu i s jeho službami
docs/rozpis/cas.js       datumy (místní čas jako text „2026-10-11T10:00“), opakování, česky
docs/rozpis/data.js      úložiště (prohlížeč / GitHub), slučování, fronta ukládání
docs/rozpis/ics.js       export do kalendáře v telefonu
docs/rozpis/ukazka.js    vymyšlená ukázková data počítaná od dneška
docs/rozpis/otisk.svg    otisk z Figmy (55 cest)
rozpis/kontrola.mjs      kontrola z příkazové řádky / Actions
rozpis/test/             testy (node --test rozpis/test/*.test.mjs)
rozpis/sbor-data/        vzory workflow pro datové repo (web.yml, kontrola.yml)
```

Fonty, ikony a favicon se berou z manifestu (`docs/assets/`). Build manifestu (`build.py`) do
`docs/rozpis/` nesahá.

## Spuštění naostro (jednou, ~15 minut)

1. **Soukromé repo** `radomilcz/sbor-data` (prázdné).
2. Do něj zkopírovat `rozpis/sbor-data/web.yml` a `rozpis/sbor-data/kontrola.yml` do `.github/workflows/`.
3. **Pages**: v `sbor-data` Settings → Pages → Source: **GitHub Actions**, Custom domain
   `kalendar.cirkevjakokrava.cz`, po ověření *Enforce HTTPS*. DNS: záznam `kalendar` typu **CNAME** →
   `radomilcz.github.io.` (stejně jako u Playbooku; Pages ze soukromého repa = GitHub Pro).
   Actions → Web → *Run workflow*.
4. **GitHub klíč**: Settings → Developer settings → Fine-grained tokens → Generate new token,
   *Only select repositories* → `sbor-data`, Permissions → Repository → **Contents: Read and write**. Nic víc.
5. Otevřít https://kalendar.cirkevjakokrava.cz – nikdo tam ještě není, takže se ukáže **Založit Rozpis**:
   vložit klíč, svoje jméno a heslo. Začít se dá se základem z ukázky (služby, týmy, formáty, šablony – bez lidí).
6. Naplnit: lidi (nebo poslat pozvánky), šablona „Setkání na pastvě“ → v kalendáři setkání s opakováním
   každý týden. Vedoucím dát roli vedoucí (u člověka → Přihlášení → Nové heslo / role).

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
- U každého člověka je pole **souhlas** (datum); při registraci pozvánkou ho člověk dává sám.
  Rozpis na nástěnku telefony netiskne. Důvod, proč někdo nemůže, a kolize vidí jen vedoucí.
- Smazaný člověk zůstane v historii gitu. Úplný výmaz = přepsat historii datového repa
  (`git filter-repo`) – proto osobní data nikdy ne do veřejného repa, ani zašifrovaná.
- Zpracovatel je GitHub (data v USA, EU-US Data Privacy Framework) – patří do informace pro členy.

## Vývoj

```
node --test rozpis/test/*.test.mjs        # testy jádra (kolize, pořad, přihlášení, slučování, .ics, GitHub s podvrženým API)
cd docs && python3 -m http.server 8000    # pak http://localhost:8000/rozpis/ (ukázka)
```

Ostrý režim lokálně: polož vedle aplikace `pristup.json` s obsahem `{"v":1,"pristupy":[]}` – ukáže se založení.

Testy pouští i GitHub Action `.github/workflows/rozpis.yml` při každé změně Rozpisu.

## Jak to vzniklo

Tým: doménový analytik (specifikace služeb a 14 pravidel kolizí podle Planning Center, ChurchTools
a Elvanta, osekaná na malý sbor), architekt (co jde jen nad GitHubem, bezpečnost tokenů, GDPR),
designér (převod Otázek na tělo na aplikaci – stavy tvarem místo barvy, mikrocopy v hlasu značky)
a vývoj. Zadání a rozhodnutí jsou shrnutá výš.
