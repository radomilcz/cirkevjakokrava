#!/usr/bin/env python3
"""Sestaví stránku otazky.cirkevjakokrava.cz ze src/.

Výstup: docs/ (GitHub Pages)
  index.html + assets/ (fonty, ikony, náhled sdílení) + otazky-na-telo.pdf

Zdroj otázek je jeden – src/otazky.txt. Z něj se sází web i A4: tisková
podoba stránky je v šabloně jako @media print, PDF je její výtisk. Když se
otázka změní v txt, změní se na obou místech.

Placeholdery v šabloně:
  {{SITE}}                       adresa webu (absolutní odkazy pro og:image, canonical)
  {{BLOKY}}                      bloky otázek ze src/otazky.txt
  {{BLOB_PATHS}}                 křivky otisku (src/assets/otisk-paths.txt)
  {{PDF}}                        název souboru s A4
  {{F_GRANDHEAVY}} {{F_REGULAR}} {{F_NARROWBLACK}} {{F_GRAND}}   fonty (src/fonts/*.woff)

Použití:  python3 build.py
Volitelně:
  python3 build.py --pdf     vysází docs/otazky-na-telo.pdf z hotové stránky (pip install playwright)
  python3 build.py --og      přegeneruje náhled sdílení z hlavičky stránky (pip install playwright pillow)
"""
import argparse, functools, http.server, os, re, shutil, socketserver, sys, threading

SITE = 'https://otazky.cirkevjakokrava.cz'   # doména z docs/CNAME – sdílené odkazy musí být absolutní

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DOCS = os.path.join(ROOT, 'docs')
PDF = 'otazky-na-telo.pdf'

FONTS = {
    '{{F_GRANDHEAVY}}': 'Agrandir-GrandHeavy.woff',
    '{{F_REGULAR}}': 'Agrandir-Regular.woff',
    '{{F_NARROWBLACK}}': 'Agrandir-NarrowBlack.woff',
    '{{F_GRAND}}': 'Agrandir-Grand.woff',
}
# ikony a náhled sdílení – hotové soubory, jen se kopírují (og.jpg dělá --og)
STATIC = ('favicon.svg', 'favicon-32.png', 'icon-180.png', 'og.jpg')

# jednopísmenné předložky a spojky nesmí zůstat na konci řádku (česká sazba)
PREDLOZKY = re.compile(r'(^|[\s„“(>])([KkSsVvZzOoUuAaIi])\s+')


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def nbsp(html):
    """Přilepí jednopísmenná slova k následujícímu – jen v textu, ne uvnitř značek."""
    out = []
    for part in re.split(r'(<[^>]+>)', html):
        out.append(part if part.startswith('<') else PREDLOZKY.sub('\\1\\2\u00a0', part))
    return ''.join(out)


def otisk():
    """Křivky otisku z src/assets/otisk-paths.txt slepené do <path> elementů."""
    paths = [l.strip() for l in read(os.path.join(SRC, 'assets', 'otisk-paths.txt')).splitlines() if l.strip()]
    return ''.join(f'<path d="{d}"/>' for d in paths)


def bloky():
    """Přečte src/otazky.txt a vysází bloky do dvou sloupců.

    Sloupce jsou dva kvůli A4 – na úzkém displeji se z nich stejně stane jeden
    proud, takže pořadí bloků v souboru je zároveň pořadí čtení na mobilu.
    """
    bloky, blok = [], None
    for radek in read(os.path.join(SRC, 'otazky.txt')).splitlines():
        radek = radek.strip()
        if not radek or radek.startswith('#'):
            blok = None if not radek else blok
            continue
        if radek.startswith('- '):
            if blok is None:
                sys.exit('Otázka bez bloku: ' + radek)
            blok[1].append(radek[2:])
        else:
            blok = (radek, [])
            bloky.append(blok)
    if not bloky:
        sys.exit('V src/otazky.txt nejsou žádné bloky.')

    def sekce(i, nazev, otazky):
        li = '\n'.join(f'          <li>{o}</li>' for o in otazky)
        return ('      <section class="block">\n'
                f'        <h2>{nazev} <span class="n">{i}/{len(bloky)}</span></h2>\n'
                f'        <ul>\n{li}\n        </ul>\n'
                '      </section>')

    pul = (len(bloky) + 1) // 2
    sloupce = [bloky[:pul], bloky[pul:]]
    ven = ['  <div class="cols">']
    i = 0
    for sloupec in sloupce:
        ven.append('    <div class="col">')
        for nazev, otazky in sloupec:
            i += 1
            ven.append(sekce(i, nazev, otazky))
        ven.append('    </div>')
    ven.append('  </div>')
    return '\n'.join(ven)


def build():
    html = read(os.path.join(SRC, 'index.template.html'))
    assets = os.path.join(DOCS, 'assets')
    os.makedirs(os.path.join(assets, 'fonts'), exist_ok=True)
    for key, name in FONTS.items():
        shutil.copy(os.path.join(SRC, 'fonts', name), os.path.join(assets, 'fonts', name))
        html = html.replace(key, 'assets/fonts/' + name)
    for name in STATIC:
        zdroj = os.path.join(SRC, 'assets', name)
        if os.path.exists(zdroj):          # og.jpg vzniká až z hotové stránky, viz --og
            shutil.copy(zdroj, os.path.join(assets, name))
    html = (html.replace('{{BLOB_PATHS}}', otisk())
                .replace('{{BLOKY}}', bloky())
                .replace('{{PDF}}', PDF)
                .replace('{{SITE}}', SITE))
    html = nbsp(html)
    check(html)
    with open(os.path.join(DOCS, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print('docs/index.html', f'{os.path.getsize(os.path.join(DOCS, "index.html")) / 1024:.0f} kB')


# ---------- PDF a náhled sdílení ----------

def chromium(pw):
    """Prohlížeč pro renderování. CHROME_PATH ukáže na vlastní Chromium, když ho playwright nemá svůj."""
    exe = os.environ.get('CHROME_PATH')
    return pw.chromium.launch(executable_path=exe) if exe else pw.chromium.launch()


class Server(socketserver.TCPServer):
    allow_reuse_address = True


def serve():
    """Rozjede docs/ na localhostu a vrátí (adresa, vypni).

    Přes file:// Chromium fonty nenačte, takže by se PDF i náhled sázely
    náhradním písmem – proto i lokální render jede přes HTTP.
    """
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=DOCS)
    httpd = Server(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{httpd.server_address[1]}/', httpd.shutdown


def make_pdf():
    """Vytiskne hotovou stránku do docs/otazky-na-telo.pdf (vyžaduje playwright).

    Tiskne se to, co je v šabloně pod @media print – co vyjede tady, vyjede
    návštěvníkovi i z Ctrl+P.
    """
    from playwright.sync_api import sync_playwright
    index = os.path.join(DOCS, 'index.html')
    if not os.path.exists(index):
        sys.exit('Nejdřív spusť build – PDF se tiskne z docs/index.html.')
    url, vypni = serve()
    out = os.path.join(DOCS, PDF)
    with sync_playwright() as pw:
        br = chromium(pw)
        page = br.new_page()
        page.goto(url)
        page.wait_for_function('document.fonts.status === "loaded"')
        page.pdf(path=out, format='A4', print_background=True,
                 margin={'top': '0', 'right': '0', 'bottom': '0', 'left': '0'})
        br.close()
    vypni()
    print(PDF + ':', f'{os.path.getsize(out) / 1024:.0f} kB')


def make_og():
    """Vyfotí hlavičku stránky do src/assets/og.jpg 1200×630 (vyžaduje playwright a pillow).

    Náhled tak vypadá přesně jako web – stejné písmo, stejný otisk, žádná ruční sazba.
    """
    from playwright.sync_api import sync_playwright
    from PIL import Image
    if not os.path.exists(os.path.join(DOCS, 'index.html')):
        sys.exit('Nejdřív spusť build – náhled se fotí z docs/index.html.')
    url, vypni = serve()
    png = os.path.join(SRC, 'assets', 'og.png')
    with sync_playwright() as pw:
        br = chromium(pw)
        page = br.new_page(viewport={'width': 1200, 'height': 630}, device_scale_factor=2)
        page.goto(url)
        page.wait_for_function('document.fonts.status === "loaded"')
        page.add_style_tag(content='.tools{display:none}')   # tlačítka do náhledu sdílení nepatří
        page.screenshot(path=png)
        br.close()
    vypni()
    im = Image.open(png).convert('RGB').resize((1200, 630), Image.LANCZOS)
    im.save(os.path.join(SRC, 'assets', 'og.jpg'), 'JPEG', quality=82, optimize=True, progressive=True)
    os.remove(png)
    print('og.jpg: 1200×630')


def check(html):
    m = re.search(r'\{\{[A-Z_]+\}\}', html)
    if m:
        sys.exit('V šabloně zůstal nenahrazený placeholder: ' + m.group(0))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf', action='store_true', help='vysází docs/' + PDF)
    ap.add_argument('--og', action='store_true', help='přegeneruje náhled sdílení')
    a = ap.parse_args()
    build()
    if a.og:
        make_og()      # fotí se z hotové stránky, proto až po buildu
        build()        # a znovu, ať se nový náhled zkopíruje do docs/
    if a.pdf:
        make_pdf()
