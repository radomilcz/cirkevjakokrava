// Data a kam se ukládají.
//
// Celý rozpis je jeden JSON. Bydlí buď jen v tomhle prohlížeči (ukázka, zkoušení), nebo
// v souboru v SOUKROMÉM repu na GitHubu – aplikace ho čte a zapisuje přes REST API
// s osobním tokenem vedoucího. Na veřejném webu žádná jména ani telefony nejsou.
//
// Když dva lidi upravují naráz, GitHub druhé uložení odmítne (jiné sha). Pak se načte
// čerstvá verze a změny se sloučí po záznamech: co jsem změnil já, vezmu svoje, co změnil
// druhý, vezmu jeho. Přepíše se jen to, co jsme změnili oba – a to dostane přednost moje.

export const KOLEKCE = ['sluzby', 'tymy', 'mista', 'domacnosti', 'lide', 'sablony', 'udalosti'];

export function prazdna() {
  return {
    verze: 1,
    nastaveni: { nazev: 'Církev jako kráva', adresa: '' },
    sluzby: [], tymy: [], kombinace: [], mista: [], domacnosti: [], lide: [], sablony: [], udalosti: [],
  };
}

export function normalizuj(data) {
  const zaklad = prazdna();
  const vysledek = { ...zaklad, ...(data || {}) };
  vysledek.nastaveni = { ...zaklad.nastaveni, ...(vysledek.nastaveni || {}) };
  for (const k of [...KOLEKCE, 'kombinace']) if (!Array.isArray(vysledek[k])) vysledek[k] = [];
  return vysledek;
}

export function noveId(predpona = 'x') {
  const bajty = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bajty);
  return predpona + Array.from(bajty, (b) => (b % 36).toString(36)).join('');
}

export const kopie = (x) => JSON.parse(JSON.stringify(x));

// ---------- slučování ----------

const stejne = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sId = (pole) => Array.isArray(pole) && pole.every((x) => x && typeof x === 'object' && 'id' in x);

function slucZaznam(z, moje, jejich) {
  const vysledek = {};
  const klice = new Set([...Object.keys(moje || {}), ...Object.keys(jejich || {})]);
  for (const k of klice) {
    const b = z ? z[k] : undefined;
    const m = moje[k];
    const j = jejich[k];
    let hodnota;
    if (stejne(b, m)) hodnota = j;
    else if (stejne(b, j)) hodnota = m;
    else if (sId(m) && sId(j)) hodnota = slucPole(sId(b) ? b : [], m, j);
    else hodnota = m;
    if (hodnota !== undefined) vysledek[k] = hodnota;
  }
  return vysledek;
}

/** Třícestné sloučení seznamu záznamů s `id`. Pořadí drží jejich verze, moje nové jdou na konec. */
export function slucPole(zaklad, moje, jejich) {
  const z = new Map((zaklad || []).map((x) => [x.id, x]));
  const m = new Map((moje || []).map((x) => [x.id, x]));
  const j = new Map((jejich || []).map((x) => [x.id, x]));
  const poradi = [...j.keys(), ...[...m.keys()].filter((id) => !j.has(id))];
  const vysledek = [];
  for (const id of poradi) {
    const b = z.get(id);
    const mm = m.get(id);
    const jj = j.get(id);
    const mojeZmena = !stejne(b, mm);
    const jejichZmena = !stejne(b, jj);
    let x;
    if (!mojeZmena) x = jj;
    else if (!jejichZmena) x = mm;
    else if (mm && jj) x = slucZaznam(b, mm, jj);
    else x = mm;                  // jeden smazal, druhý upravil – upravené přežije, když jsem to já
    if (x) vysledek.push(x);
  }
  return vysledek;
}

export function sluc(zaklad, moje, jejich) {
  zaklad = normalizuj(zaklad);
  moje = normalizuj(moje);
  jejich = normalizuj(jejich);
  const vysledek = slucZaznam(zaklad, moje, jejich);
  for (const k of KOLEKCE) vysledek[k] = slucPole(zaklad[k], moje[k], jejich[k]);
  // dvojice služeb nemají id – vezmi tu verzi, která se změnila
  vysledek.kombinace = stejne(zaklad.kombinace, moje.kombinace) ? jejich.kombinace : moje.kombinace;
  return normalizuj(vysledek);
}

// ---------- úložiště ----------

const KLIC_DATA = 'rozpis-data';
const KLIC_PRIPOJENI = 'rozpis-github';

function zkus(fn, nahradni) {
  try { return fn(); } catch { return nahradni; }
}

export class Lokalni {
  constructor() { this.popis = 'Ukázka v tomhle prohlížeči'; this.druh = 'lokalni'; }

  async nacti() {
    const text = zkus(() => localStorage.getItem(KLIC_DATA), null);
    return text ? normalizuj(JSON.parse(text)) : null;
  }

  async uloz(data) {
    zkus(() => localStorage.setItem(KLIC_DATA, JSON.stringify(data)));
    return data;
  }

  zapomen() { zkus(() => localStorage.removeItem(KLIC_DATA)); }
}

export class Konflikt extends Error {}
export class ChybaGithubu extends Error {
  constructor(zprava, status) { super(zprava); this.status = status; }
}

function naBase64(text) {
  const bajty = new TextEncoder().encode(text);
  let binarni = '';
  for (let i = 0; i < bajty.length; i += 0x8000) binarni += String.fromCharCode(...bajty.subarray(i, i + 0x8000));
  return btoa(binarni);
}

function zBase64(b64) {
  const binarni = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binarni, (c) => c.charCodeAt(0)));
}

export class Github {
  constructor({ vlastnik, repo, cesta = 'rozpis.json', vetev = 'main', token }) {
    Object.assign(this, { vlastnik, repo, cesta, vetev, token });
    this.druh = 'github';
    this.popis = `GitHub · ${vlastnik}/${repo}`;
    this.sha = null;
  }

  get adresa() {
    const cesta = this.cesta.split('/').map(encodeURIComponent).join('/');
    return `https://api.github.com/repos/${encodeURIComponent(this.vlastnik)}/${encodeURIComponent(this.repo)}/contents/${cesta}`;
  }

  async volej(url, moznosti = {}, prijmout = 'application/vnd.github+json') {
    let odpoved;
    try {
      odpoved = await fetch(url, {
        cache: 'no-store',      // API posílá max-age=60 – starou verzi se starým sha nechceme
        ...moznosti,
        headers: {
          Accept: prijmout,
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(moznosti.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new ChybaGithubu('Spojení vypadlo. Jsi online?', 0);
    }
    if (odpoved.ok) return odpoved;
    if (odpoved.status === 409) throw new Konflikt('Mezitím to uložil někdo jiný.');
    const zpravy = {
      401: 'GitHub token nepoznal. Neprošlá platnost, nebo překlep?',
      403: 'Token na tohle repo nemá právo (Contents: Read and write).',
      404: 'Repo nebo soubor nenalezen. Sedí vlastník, název a větev? A má token přístup k tomuhle repu?',
      422: 'GitHub uložení odmítl. Zkus stránku načíst znovu.',
    };
    throw new ChybaGithubu(zpravy[odpoved.status] || `GitHub odpověděl ${odpoved.status}.`, odpoved.status);
  }

  /** Vrátí data, nebo null, když soubor ještě neexistuje. */
  async nacti() {
    let odpoved;
    try {
      odpoved = await this.volej(`${this.adresa}?ref=${encodeURIComponent(this.vetev)}`);
    } catch (chyba) {
      if (chyba.status === 404) {
        // neexistuje soubor, nebo celé repo? Rozliší to dotaz na repo.
        const repo = `https://api.github.com/repos/${encodeURIComponent(this.vlastnik)}/${encodeURIComponent(this.repo)}`;
        await this.volej(repo);
        this.sha = null;
        return null;
      }
      throw chyba;
    }
    const soubor = await odpoved.json();
    this.sha = soubor.sha;
    let text;
    if (soubor.encoding === 'base64' && soubor.content) text = zBase64(soubor.content);
    else text = await (await this.volej(`${this.adresa}?ref=${encodeURIComponent(this.vetev)}`, {}, 'application/vnd.github.raw+json')).text();
    return normalizuj(JSON.parse(text));
  }

  async uloz(data, zprava = 'Rozpis: úprava') {
    const telo = {
      message: zprava,
      content: naBase64(`${JSON.stringify(data, null, 1)}\n`),
      branch: this.vetev,
      ...(this.sha ? { sha: this.sha } : {}),
    };
    const odpoved = await this.volej(this.adresa, { method: 'PUT', body: JSON.stringify(telo) });
    this.sha = (await odpoved.json()).content.sha;
    return data;
  }

  // připojení si pamatuje prohlížeč; token buď natrvalo (vlastní zařízení), nebo do zavření okna
  static ulozPripojeni(nastaveni, natrvalo) {
    const { token, ...zbytek } = nastaveni;
    zkus(() => localStorage.setItem(KLIC_PRIPOJENI, JSON.stringify(zbytek)));
    zkus(() => {
      localStorage.removeItem(`${KLIC_PRIPOJENI}-token`);
      sessionStorage.removeItem(`${KLIC_PRIPOJENI}-token`);
      (natrvalo ? localStorage : sessionStorage).setItem(`${KLIC_PRIPOJENI}-token`, token);
    });
  }

  static nactiPripojeni() {
    const zbytek = zkus(() => JSON.parse(localStorage.getItem(KLIC_PRIPOJENI) || 'null'), null);
    if (!zbytek) return null;
    const token = zkus(() => localStorage.getItem(`${KLIC_PRIPOJENI}-token`)
      || sessionStorage.getItem(`${KLIC_PRIPOJENI}-token`), null);
    const natrvalo = zkus(() => !!localStorage.getItem(`${KLIC_PRIPOJENI}-token`), false);
    return { ...zbytek, token: token || '', natrvalo };
  }

  static odpoj() {
    zkus(() => {
      localStorage.removeItem(KLIC_PRIPOJENI);
      localStorage.removeItem(`${KLIC_PRIPOJENI}-token`);
      sessionStorage.removeItem(`${KLIC_PRIPOJENI}-token`);
    });
  }
}

/**
 * Hlídá ukládání: změny se sbírají a po chvilce odejdou jedním commitem.
 * Ukládá se vždy jen jednou naráz. Při konfliktu načte čerstvou verzi, sloučí a zkusí znovu.
 */
export class Synchronizace {
  constructor(uloziste, data, { priZmene, prodleva = 1500 } = {}) {
    this.uloziste = uloziste;
    this.data = data;
    this.zaklad = kopie(data);
    this.priZmene = priZmene || (() => {});
    this.prodleva = prodleva;
    this.popisy = [];
    this.stav = 'ulozeno';
    this.casovac = null;
    this.bezi = null;
  }

  nastavStav(stav, chyba) {
    this.stav = stav;
    this.chyba = chyba;
    this.priZmene({ stav, chyba });
  }

  zmena(popis) {
    if (popis && !this.popisy.includes(popis)) this.popisy.push(popis);
    this.nastavStav('neulozeno');
    clearTimeout(this.casovac);
    this.casovac = setTimeout(() => this.uloz(), this.prodleva);
  }

  async uloz() {
    clearTimeout(this.casovac);
    if (this.bezi) { await this.bezi; if (this.stav !== 'neulozeno') return; }
    this.bezi = this.provedUlozeni().finally(() => { this.bezi = null; });
    return this.bezi;
  }

  async provedUlozeni() {
    const popisy = this.popisy.splice(0);
    const zprava = `Rozpis: ${popisy.slice(0, 3).join(', ') || 'úprava'}${popisy.length > 3 ? ` a ${popisy.length - 3} dalších` : ''}`;
    const snimek = kopie(this.data);
    this.nastavStav('uklada');
    try {
      for (let pokus = 0; pokus < 3; pokus++) {
        try {
          await this.uloziste.uloz(snimek, zprava);
          this.zaklad = snimek;
          this.nastavStav(this.popisy.length ? 'neulozeno' : 'ulozeno');
          if (this.popisy.length) this.zmena();
          return;
        } catch (chyba) {
          if (!(chyba instanceof Konflikt)) throw chyba;
          const jejich = await this.uloziste.nacti();
          const puvodni = kopie(snimek);
          const slouceno = sluc(this.zaklad, snimek, jejich || prazdna());
          Object.keys(snimek).forEach((k) => delete snimek[k]);
          Object.assign(snimek, slouceno);
          this.zaklad = kopie(jejich || prazdna());
          // co mezitím přibylo v aplikaci (po snímku), nesmí sloučení smazat
          this.nahradData(sluc(puvodni, this.data, slouceno));
        }
      }
      throw new ChybaGithubu('Nepovedlo se to sloučit ani na třetí pokus.', 409);
    } catch (chyba) {
      popisy.forEach((p) => { if (!this.popisy.includes(p)) this.popisy.push(p); });
      this.nastavStav('chyba', chyba.message || String(chyba));
    }
  }

  /** Po sloučení: data v aplikaci přepíšeme na místě, ať všechny odkazy zůstanou platné. */
  nahradData(nova) {
    Object.keys(this.data).forEach((k) => delete this.data[k]);
    Object.assign(this.data, nova);
    this.priZmene({ stav: this.stav, nacteno: true });
  }
}
