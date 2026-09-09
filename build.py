#!/usr/bin/env python3
"""Sestaví prezentaci ze šablony src/manifest.template.html.

Dva výstupy:
  docs/                 web (GitHub Pages / manifest.cirkevjakokrava.cz):
                        index.html + assets/manifest.css, manifest.js, fonty a fotky
                        jako samostatné soubory – prohlížeč je cachuje a stahuje paralelně
  docs/manifest.html    jeden soubor se vším vloženým (base64) – na poslání mailem,
                        otevření z disku, náhled v Claude

Placeholdery v šabloně / CSS:
  {{CSS}} {{JS}}                 obsah src/manifest.css a src/manifest.js (odkaz, nebo inline)
  {{BLOB_PATHS}}                 křivky otisku (src/assets/otisk-paths.txt) – vždy inline, JS je klonuje
  {{HERO}} {{HODNOTY_PHOTO}}     fotky (src/assets/hero.jpg, hodnoty.jpg)
  {{F_GRANDHEAVY}} {{F_REGULAR}} {{F_NARROWBLACK}} {{F_GRAND}}   fonty (src/fonts/*.woff)

Použití:  python3 build.py
Volitelně: python3 build.py --hero cesta/k/nove-fotce.jpg   (zmenší na 2000 px a nahradí hero.jpg)
"""
import argparse, base64, os, re, shutil, sys

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
}


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def data_uri(path, mime):
    with open(path, 'rb') as f:
        return 'data:' + mime + ';base64,' + base64.b64encode(f.read()).decode()


def prepare_hero(source):
    """Zmenší a zkomprimuje fotku do src/assets/hero.jpg (vyžaduje Pillow)."""
    from PIL import Image
    im = Image.open(source).convert('RGB')
    if im.width > 2000:
        im = im.resize((2000, round(2000 * im.height / im.width)), Image.LANCZOS)
    im.save(os.path.join(SRC, 'assets', 'hero.jpg'), 'JPEG', quality=78, optimize=True, progressive=True)
    print('hero.jpg:', im.size)


def wrap(body):
    """Šablona začíná <title> a <meta> – ty patří do <head>, zbytek do <body>."""
    head = re.match(r'(<title>.*?</title>\s*<meta[^>]*>\s*)', body, re.S).group(1)
    rest = body[len(head):]
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

    # --- web: samostatné soubory -------------------------------------------
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
    check(web)
    with open(os.path.join(DOCS, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(wrap(web))

    # --- jeden soubor se vším vloženým -------------------------------------
    css_inline = css
    for key, name in FONTS.items():
        css_inline = css_inline.replace(key, data_uri(os.path.join(SRC, 'fonts', name), 'font/woff'))
    single = (tpl.replace('{{CSS}}', '<style>\n' + css_inline + '</style>')
                 .replace('{{JS}}', '<script>\n' + js + '</script>'))
    for key, name in IMAGES.items():
        single = single.replace(key, data_uri(os.path.join(SRC, 'assets', name), 'image/jpeg'))
    check(single)
    with open(os.path.join(DOCS, 'manifest.html'), 'w', encoding='utf-8') as f:
        f.write(wrap(single))

    kb = lambda p: f'{os.path.getsize(p) / 1024:.0f} kB'
    print('docs/index.html', kb(os.path.join(DOCS, 'index.html')),
          '+ assets (css', kb(os.path.join(assets, 'manifest.css')), ', js', kb(os.path.join(assets, 'manifest.js')), ')')
    print('docs/manifest.html', kb(os.path.join(DOCS, 'manifest.html')), '(vše v jednom)')


def check(html):
    m = re.search(r'\{\{[A-Z_]+\}\}', html)
    if m:
        sys.exit('V šabloně zůstal nenahrazený placeholder: ' + m.group(0))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--hero', help='nová úvodní fotka (zmenší se a nahradí src/assets/hero.jpg)')
    a = ap.parse_args()
    if a.hero:
        prepare_hero(a.hero)
    build()
