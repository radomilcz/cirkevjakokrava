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

```
veřejné repo radomilcz/cirkevjakokrava        soukromé repo (např. cirkevjakokrava/sbor-data)

docs/rozpis/  → GitHub Pages                  rozpis.json  (lidi, služby, setkání)
aplikace, žádná data       ── čte a zapisuje ─▶  každé uložení = commit
                              tokenem vedoucího
rozpis/kontrola.mjs        ◀── bere si kód ───  .github/workflows/kontrola.yml
                              kontroly           (po uložení a v pondělí ráno)
```

- **Aplikace** je statická (`docs/rozpis/`, bez buildu a bez frameworku). Obsah skládá přes DOM, nikdy
  přes `innerHTML`, a má přísnou CSP – ven smí jen na `api.github.com`. V prohlížeči leží token, tak na tom záleží.
- **Data** jsou jeden JSON v **soukromém** repu. Aplikace ho čte a zapisuje přes Contents API osobním
  tokenem vedoucího. Pages jsou vždycky veřejné (i ze soukromého repa), proto data na Pages nikdy nejdou.
- **Ukládání**: změny se sbírají a po vteřině a půl odejdou jedním commitem („Rozpis: Petr na Zvuk, …“).
  Když mezitím uložil někdo jiný, GitHub vrátí 409 – aplikace načte čerstvou verzi, **sloučí po záznamech**
  (moje změny + jeho změny, u stejného pole vyhrává moje) a uloží znovu.
- **Bez připojení** běží ukázka v `localStorage` prohlížeče – na vyzkoušení a na školení vedoucích.
- **Kontrola v Actions**: `rozpis/kontrola.mjs` pustí stejná pravidla nad `rozpis.json`; při chybě v budoucnu
  běh zčervená a GitHub pošle e-mail. Vzor workflow je v `rozpis/sbor-data/kontrola.yml`.

```
docs/rozpis/index.html   kostra stránky, CSP
docs/rozpis/styl.css     design (tokeny z Otázek na tělo), tisk A4
docs/rozpis/app.js       obrazovky a dialogy
docs/rozpis/kolize.js    pravidla kolizí, výběr lidí, „Navrhnout zbytek“
docs/rozpis/porad.js     pořad z formátů: časy, kdo vede, přidání formátu i s jeho službami
docs/rozpis/cas.js       datumy (místní čas jako text „2026-10-11T10:00“), opakování, česky
docs/rozpis/data.js      úložiště (prohlížeč / GitHub), slučování, fronta ukládání
docs/rozpis/ics.js       export do kalendáře v telefonu
docs/rozpis/ukazka.js    vymyšlená ukázková data počítaná od dneška
docs/rozpis/otisk.svg    otisk z Figmy (55 cest)
rozpis/kontrola.mjs      kontrola z příkazové řádky / Actions
rozpis/test/             testy (node --test rozpis/test/*.test.mjs)
rozpis/sbor-data/        vzor workflow pro datové repo
```

Fonty, ikony a favicon se berou z manifestu (`docs/assets/`). Build manifestu (`build.py`) do
`docs/rozpis/` nesahá.

## Spuštění naostro (jednou, ~15 minut)

1. **Organizace na GitHubu** pro sbor (zdarma), třeba `cirkevjakokrava`. Proč organizace: fine-grained token
   neumí cizí osobní repo, kde je člověk jen pozvaný. V nastavení organizace zapnout povinné 2FA a
   *Personal access tokens → Require approval* (tokeny jde pak vidět a rušit).
2. **Soukromé repo** `sbor-data` v organizaci. Pozvat do něj jen vedoucí (role *Write*).
3. Každý vedoucí si udělá **fine-grained token**: Settings → Developer settings → Fine-grained tokens →
   Resource owner = organizace, *Only select repositories* = `sbor-data`,
   Permissions → Repository → **Contents: Read and write**. Platnost rok.
4. V Rozpisu → **Nastavení** vyplnit organizaci, repo a token → Připojit. Soubor ještě není, takže aplikace
   nabídne **založit prázdný** (nebo z ukázky – lidi v ní jsou ale vymyšlení).
5. Do `sbor-data` zkopírovat `rozpis/sbor-data/kontrola.yml` jako `.github/workflows/kontrola.yml`.
6. Naplnit: služby a týmy → šablona „Setkání na pastvě“ → lidi → v kalendáři setkání s opakováním každý týden.

## Co jde a co nejde jen s GitHubem

| chceme | jde? | jak |
| --- | --- | --- |
| plánování, kolize, správa lidí | ano | aplikace + soukromé repo |
| historie změn, kdo co změnil | ano | každé uložení je commit |
| přihlášení vedoucích | ano, tokenem | OAuth bez serveru nejde (GitHub na přihlašovacích adresách nepovoluje volání z prohlížeče) |
| upozornění vedoucím | ano | Actions + e-mail od GitHubu při chybě v rozpisu |
| kalendář v telefonu | ano, stažením .ics | odběr (feed) by musel ležet na veřejných Pages – jména by šla ven |
| připomínky e-mailem členům | ne | GitHub neposílá e-maily lidem bez účtu |
| online registrace bez GitHub účtu | **ne** | viz níž |

## Online registrace členů (další fáze)

Každý zápis do repa potřebuje token a ten nesmí být ve stránce. Čistě přes GitHub proto registrace
člověka bez GitHub účtu nejde. Možnosti od nejmenšího kompromisu:

1. **Formulář, který sestaví e-mail** (`mailto:`) na adresu sboru – vedoucí ho přepíše do Rozpisu.
   Nic nového, souhlas je doložený e-mailem. *Doporučení na start.*
2. **Odkaz „Přidej se“ přímo v Rozpisu** pro vedoucí: formulář pro nového člověka s polem souhlasu
   (to už je – Lidé → Přidat člověka).
3. **Jedna malá funkce mimo GitHub** (např. Cloudflare Worker s tokenem v tajemství), která zapíše
   přihlášku do `sbor-data` jako issue nebo rovnou do `rozpis.json`. To už je služba mimo GitHub – rozhodnutí na vás.

Další na seznamu: samoobslužné „Moje služby“ (potvrdit / nemůžu) – potřebuje stejný kompromis jako registrace;
pořad setkání (písně, délky); databáze písní; výměna služby mezi lidmi.

## Osobní údaje

- Členství ve sboru prozrazuje vyznání – zvláštní kategorie údajů. Data proto jen v **soukromém** repu,
  přístup jen vedoucí. Na veřejném webu jsou jen vymyšlená ukázková jména (`@example.cz`).
- U každého člověka je pole **souhlas** (datum). Rozpis na nástěnku telefony netiskne.
- Smazaný člověk zůstane v historii gitu. Úplný výmaz = přepsat historii datového repa
  (`git filter-repo`) – proto osobní data nikdy ne do veřejného repa, ani zašifrovaná.
- Zpracovatel je GitHub (data v USA, EU-US Data Privacy Framework) – patří do informace pro členy.

## Vývoj

```
node --test rozpis/test/*.test.mjs        # testy jádra (kolize, slučování, .ics, GitHub s podvrženým API)
cd docs && python3 -m http.server 8000    # pak http://localhost:8000/rozpis/
```

Testy pouští i GitHub Action `.github/workflows/rozpis.yml` při každé změně Rozpisu.

## Jak to vzniklo

Tým: doménový analytik (specifikace služeb a 14 pravidel kolizí podle Planning Center, ChurchTools
a Elvanta, osekaná na malý sbor), architekt (co jde jen nad GitHubem, bezpečnost tokenů, GDPR),
designér (převod Otázek na tělo na aplikaci – stavy tvarem místo barvy, mikrocopy v hlasu značky)
a vývoj. Zadání a rozhodnutí jsou shrnutá výš.
