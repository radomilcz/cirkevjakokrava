#!/usr/bin/env python3
"""Builds the side-by-side comparison page: thoughts list | main text | Prigl-tone text, aligned by section."""
import glob, html, json, re, sys

S = "/tmp/claude-0/-home-user-cirkevjakokrava/45b5d411-1217-55c3-b7d2-a57b15182c4f/scratchpad"
REPO = "/home/user/cirkevjakokrava/src/obsah/koncepty"
HERE = S + "/vedle"

ORDER = [("intro", "Úvod"), ("proc", "Proč to děláme"), ("A", "Opora A"), ("B", "Opora B"), ("C", "Opora C"),
         ("tyden", "Jak to vypadá v týdnu"), ("ramecek", "Rámeček"), ("hranice", "Hranice"),
         ("kapsa", "Do kapsy / Shrnutí"), ("zrcadlo", "Zrcadlo")]


def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"<em>\1</em>", t)
    return t


def key_for(heading, level, seen_intro):
    h = heading.strip()
    m = re.match(r"([ABC])\.", h)
    if m:
        return m.group(1)
    low = h.lower()
    if low.startswith("proč"):
        return "proc"
    if low.startswith("jak to vypadá"):
        return "tyden"
    if low.startswith("do kapsy") or low.startswith("shrnutí"):
        return "kapsa"
    if low.startswith("zrcadlo"):
        return "zrcadlo"
    if low.startswith("hranice"):
        return "hranice"
    if low.startswith("na čem to stojí"):
        return None
    if low.startswith("výchozí") or not seen_intro:
        return "intro"
    return None


def parse(path):
    lines = open(path, encoding="utf-8").read().splitlines()
    title = lines[0][2:].strip() if lines and lines[0].startswith("# ") else ""
    sub = ""
    secs = {k: {"heading": "", "blocks": []} for k, _ in ORDER}
    cur, seen_intro, para = None, False, []

    def flush():
        if para and cur:
            text = " ".join(x.strip() for x in para).strip()
            if text:
                secs[cur]["blocks"].append({"t": "p", "h": inline(text)})
        para.clear()

    i = 1
    while i < len(lines):
        ln = lines[i]
        if not sub and re.fullmatch(r"\*\*.+\*\*", ln.strip()) and cur is None:
            sub = inline(ln.strip()[2:-2]); i += 1; continue
        m = re.match(r"(#{2,3}) (.+)", ln)
        if m:
            flush()
            k = key_for(m.group(2), len(m.group(1)), seen_intro)
            if k:
                cur = k
                if k == "intro":
                    seen_intro = True
                secs[k]["heading"] = inline(m.group(2))
            i += 1; continue
        if ln.startswith(">"):
            flush()
            q = []
            while i < len(lines) and lines[i].startswith(">"):
                q.append(lines[i][1:].strip()); i += 1
            parts, buf = [], []
            for x in q:
                if not x:
                    if buf: parts.append(" ".join(buf)); buf = []
                else:
                    buf.append(x)
            if buf: parts.append(" ".join(buf))
            secs["ramecek"]["heading"] = "Rámeček"
            for pt in parts:
                secs["ramecek"]["blocks"].append({"t": "p", "h": inline(pt)})
            continue
        if re.match(r"\s*(- |\* |\d+\. )", ln):
            flush()
            item = re.sub(r"^\s*(- |\* |\d+\. )", "", ln).strip()
            if cur:
                is_label = re.fullmatch(r"\*\*[^*]+:\*\*", item) is not None
                secs[cur]["blocks"].append({"t": "lbl" if is_label else "li", "h": inline(item)})
            i += 1; continue
        if not ln.strip():
            flush(); i += 1; continue
        para.append(ln); i += 1
    flush()
    return {"title": title, "sub": sub, "secs": secs}


values = []
for n in range(1, 11):
    nn = "%02d" % n
    main = glob.glob(f"{REPO}/hodnota-{nn}-*.md")[0]
    cols = {"myslenky": f"{S}/myslenky/hodnota-{nn}.md", "hlavni": main, "prigl": f"{S}/pokus3/hodnota-{nn}.md"}
    v = {"n": n}
    for c, p in cols.items():
        try:
            v[c] = parse(p)
        except (FileNotFoundError, IndexError):
            v[c] = None
    try:
        items = []
        for ln in open(f"{S}/hodnotne/hodnota-{nn}.md", encoding="utf-8"):
            if ln.startswith("- "):
                items.append({"h": inline(ln[2:].strip())})
        try:
            vs = json.load(open(f"{S}/hodnotne/verse-{nn}.json", encoding="utf-8"))
            texts = json.load(open(f"{S}/hodnotne/verse-texts.json", encoding="utf-8"))
            for it, vv in zip(items, vs):
                r = vv.get("ref")
                if r and texts.get(r, {}).get("text"):
                    it["verse"] = {"ref": r.replace("1. Petrova", "1. Petrův"), "text": texts[r]["text"], "url": texts[r]["url"]}
        except FileNotFoundError:
            pass
        v["hodnotne"] = items
    except FileNotFoundError:
        v["hodnotne"] = []
    values.append(v)

data = {"order": ORDER, "values": values}
tpl = open(f"{HERE}/template.html", encoding="utf-8").read()
out = tpl.replace("/*DATA*/null", json.dumps(data, ensure_ascii=False))
open(f"{HERE}/vedle.html", "w", encoding="utf-8").write(out)
print("ok", sum(1 for v in values if v["myslenky"]), "thought lists")
