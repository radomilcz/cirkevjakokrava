#!/usr/bin/env python3
"""Sestaví prezentaci ze šablony src/manifest.template.html.

Výstup: docs/ (GitHub Pages / manifest.cirkevjakokrava.cz)
  index.html + assets/manifest.css, manifest.js, fonty a fotky jako samostatné
  soubory – prohlížeč je cachuje a stahuje paralelně.

Placeholdery v šabloně / CSS:
  {{SITE}}                       adresa webu (absolutní odkazy pro og:image, canonical)
  {{CSS}} {{JS}}                 odkazy na assets/manifest.css a assets/manifest.js
  {{BLOB_PATHS}}                 křivky otisku (src/assets/otisk-paths.txt) – vždy inline, JS je klonuje
  {{HERO}} {{HODNOTY_PHOTO}} {{KRAVA}}   fotky (src/assets/hero.jpg, hodnoty.jpg, krava.png)
  – náhled sdílení a ikony (src/assets/og.jpg, favicon.svg, favicon-32.png, icon-180.png)
    se jen kopírují; generují se zvlášť, viz níže
  {{F_GRANDHEAVY}} {{F_REGULAR}} {{F_NARROWBLACK}} {{F_GRAND}}   fonty (src/fonts/*.woff)

Použití:  python3 build.py
Volitelně:
  python3 build.py --hero cesta/k/nove-fotce.jpg  zmenší na 2000 px a nahradí hero.jpg (pip install pillow)
  python3 build.py --og                           přegeneruje náhled sdílení z úvodního slajdu (pip install playwright)
  python3 build.py --icons                        přegeneruje PNG ikony z favicon.svg (pip install playwright)
"""
import argparse, os, re, shutil, sys

SITE = 'https://manifest.cirkevjakokrava.cz'   # doména z docs/CNAME – sdílené odkazy musí být absolutní

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DOCS = os.path.join(ROOT, 'docs')

FONTS = {
    '{{F_GRANDHEAVY}}': 'Agrandir-GrandHeavy.woff',
    '{{F_REGULAR}}': 'Agrandir-Regular.woff',
    '{{F_NARROWBLACK}}': 'Agrandir-NarrowBlack.woff',
    '{{F_GRAND}}': 'Agrandir-Grand.woff',
}
IMAGES = {
    '{{HERO}}': 'hero.jpg',
    '{{HODNOTY_PHOTO}}': 'hodnoty.jpg',
    '{{KRAVA}}': 'krava.png',
}
# náhled sdílení a ikony – hotové soubory, jen se kopírují do docs/assets/
STATIC = ('og.jpg', 'favicon.svg', 'favicon-32.png', 'icon-180.png')


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def prepare_hero(source):
    """Zmenší a zkomprimuje fotku do src/assets/hero.jpg (vyžaduje Pillow)."""
    from PIL import Image
    im = Image.open(source).convert('RGB')
    if im.width > 2000:
        im = im.resize((2000, round(2000 * im.height / im.width)), Image.LANCZOS)
    im.save(os.path.join(SRC, 'assets', 'hero.jpg'), 'JPEG', quality=78, optimize=True, progressive=True)
    print('hero.jpg:', im.size)


HEAD_END = '<!--/head-->'


def wrap(body):
    """Vše před značkou <!--/head--> patří do <head>, zbytek do <body>."""
    head, _, rest = body.partition(HEAD_END)
    if not _:
        sys.exit('V šabloně chybí značka ' + HEAD_END)
    return ('<!doctype html>\n<html lang="cs">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + head + '</head>\n<body>\n' + rest + '\n</body>\n</html>\n')


def build():
    tpl = read(os.path.join(SRC, 'manifest.template.html'))
    css = read(os.path.join(SRC, 'manifest.css'))
    js = read(os.path.join(SRC, 'manifest.js'))
    paths = [l.strip() for l in read(os.path.join(SRC, 'assets', 'otisk-paths.txt')).splitlines() if l.strip()]
    blob = ''.join(f'<path d="{d}"/>' for d in paths)
    tpl = tpl.replace('{{BLOB_PATHS}}', blob)

    assets = os.path.join(DOCS, 'assets')
    os.makedirs(os.path.join(assets, 'fonts'), exist_ok=True)
    css_web = css
    for key, name in FONTS.items():
        shutil.copy(os.path.join(SRC, 'fonts', name), os.path.join(assets, 'fonts', name))
        css_web = css_web.replace(key, 'fonts/' + name)          # relativně k assets/manifest.css
    with open(os.path.join(assets, 'manifest.css'), 'w', encoding='utf-8') as f:
        f.write(css_web)
    with open(os.path.join(assets, 'manifest.js'), 'w', encoding='utf-8') as f:
        f.write(js)
    preload = ''.join(f'<link rel="preload" href="assets/fonts/{n}" as="font" type="font/woff" crossorigin>\n'
                      for n in FONTS.values())
    web = (tpl.replace('{{CSS}}', preload + '<link rel="stylesheet" href="assets/manifest.css">')
              .replace('{{JS}}', '<script src="assets/manifest.js"></script>'))
    for key, name in IMAGES.items():
        shutil.copy(os.path.join(SRC, 'assets', name), os.path.join(assets, name))
        web = web.replace(key, 'assets/' + name)
    for name in STATIC:
        shutil.copy(os.path.join(SRC, 'assets', name), os.path.join(assets, name))
    web = web.replace('{{SITE}}', SITE)
    check(web)
    with open(os.path.join(DOCS, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(wrap(web))


    kb = lambda p: f'{os.path.getsize(p) / 1024:.0f} kB'
    print('docs/index.html', kb(os.path.join(DOCS, 'index.html')),
          '+ assets (css', kb(os.path.join(assets, 'manifest.css')), ', js', kb(os.path.join(assets, 'manifest.js')), ')')


# ---------- náhled sdílení a ikony ----------

def chromium(pw):
    """Prohlížeč pro renderování. CHROME_PATH ukáže na vlastní Chromium, když ho playwright nemá svůj."""
    exe = os.environ.get('CHROME_PATH')
    return pw.chromium.launch(executable_path=exe) if exe else pw.chromium.launch()


def make_og():
    """Vyfotí úvodní slajd hotového webu do src/assets/og.jpg 1200×630 (vyžaduje playwright).

    Náhled tak vypadá přesně jako web – stejná fotka, stejné písmo, žádná ruční sazba.
    """
    from playwright.sync_api import sync_playwright
    from PIL import Image
    index = os.path.join(DOCS, 'index.html')
    if not os.path.exists(index):
        sys.exit('Nejdřív spusť build – náhled se fotí z docs/index.html.')
    png = os.path.join(SRC, 'assets', 'og.png')
    with sync_playwright() as pw:
        br = chromium(pw)
        page = br.new_page(viewport={'width': 1200, 'height': 630}, device_scale_factor=2)
        page.goto('file://' + index)
        page.add_style_tag(content=(
            '*{animation-duration:0s!important;animation-delay:0s!important;'
            'transition-duration:0s!important;transition-delay:0s!important}'
            '.progress,.counter,.rail,.hint,.next{display:none!important}'))
        page.wait_for_timeout(2500)                 # ať se dotáhnou fonty i fotka
        page.screenshot(path=png)
        br.close()
    im = Image.open(png).convert('RGB').resize((1200, 630), Image.LANCZOS)
    im.save(os.path.join(SRC, 'assets', 'og.jpg'), 'JPEG', quality=82, optimize=True, progressive=True)
    os.remove(png)
    print('og.jpg: 1200×630')


ICONS = {
    'favicon-32.png': (32, None),            # panel prohlížeče – průhledné rohy nevadí
    'icon-180.png': (180, '#3b2f2f'),        # plocha na iOS – průhlednost by zčernala, proto podklad
}


def make_icons():
    """Vyrenderuje PNG ikony ze src/assets/favicon.svg (vyžaduje playwright).

    Zdrojem je ručně kreslené SVG, tenhle krok z něj jen udělá rastry pro místa,
    kde SVG nestačí: starší Safari a plochu na iOS.
    """
    from playwright.sync_api import sync_playwright
    svg = read(os.path.join(SRC, 'assets', 'favicon.svg'))
    with sync_playwright() as pw:
        br = chromium(pw)
        for name, (size, bg) in ICONS.items():
            page = br.new_page(viewport={'width': size, 'height': size})
            # SVG se vkládá do stránky, ne otevírá jako soubor – takhle jde nastavit podklad
            page.set_content('<style>html,body{margin:0;background:%s}'
                             'svg{display:block;width:100vw;height:100vh}</style>%s' % (bg or 'transparent', svg))
            page.screenshot(path=os.path.join(SRC, 'assets', name), omit_background=bg is None)
            page.close()
        br.close()
    print('ikony:', ', '.join(ICONS))


def check(html):
    m = re.search(r'\{\{[A-Z_]+\}\}', html)
    if m:
        sys.exit('V šabloně zůstal nenahrazený placeholder: ' + m.group(0))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--hero', help='nová úvodní fotka (zmenší se a nahradí src/assets/hero.jpg)')
    ap.add_argument('--og', action='store_true', help='přegeneruje náhled sdílení z úvodního slajdu')
    ap.add_argument('--icons', action='store_true', help='přegeneruje favicon a ikonu na plochu')
    a = ap.parse_args()
    if a.hero:
        prepare_hero(a.hero)
    if a.icons:
        make_icons()
    build()
    if a.og:
        make_og()      # fotí se z hotového webu, proto až po buildu
        build()        # a znovu, ať se nový náhled zkopíruje do docs/
