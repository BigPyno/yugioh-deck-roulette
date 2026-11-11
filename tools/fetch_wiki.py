"""Scarica da Yugipedia il wikitext delle pagine personaggio di ogni gioco DS/PSP.

Salva in cache/wiki/<categoria>.json la lista dei membri e in cache/pages.json
il wikitext di tutte le pagine (titolo -> testo).
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
API = "https://yugipedia.com/api.php"
UA = "DeckRouletteLocal/0.1 (uso personale, script locale)"

GAMES = {
    "NT": "Yu-Gi-Oh! Nightmare Troubadour",
    "SC": "Yu-Gi-Oh! GX Spirit Caller",
    "WC07": "Yu-Gi-Oh! World Championship 2007",
    "WC08": "Yu-Gi-Oh! World Championship 2008",
    "WC09": "Yu-Gi-Oh! 5D's World Championship 2009: Stardust Accelerator",
    "WC10": "Yu-Gi-Oh! 5D's World Championship 2010: Reverse of Arcadia",
    "WC11": "Yu-Gi-Oh! 5D's World Championship 2011: Over the Nexus",
    "TF1": "Yu-Gi-Oh! GX Tag Force",
    "TF2": "Yu-Gi-Oh! GX Tag Force 2",
    "TF3": "Yu-Gi-Oh! GX Tag Force 3",
    "TF4": "Yu-Gi-Oh! 5D's Tag Force 4",
    "TF5": "Yu-Gi-Oh! 5D's Tag Force 5",
    "TF6": "Yu-Gi-Oh! 5D's Tag Force 6",
    "TFS": "Yu-Gi-Oh! ARC-V Tag Force Special",
}


def api(params):
    params = {**params, "format": "json", "formatversion": "2"}
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print("  retry", attempt, e)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(url)


def category_members(cat):
    out, cont = [], {}
    while True:
        d = api({"action": "query", "list": "categorymembers", "cmtitle": "Category:" + cat,
                 "cmlimit": "500", "cmnamespace": "0", **cont})
        out += [m["title"] for m in d["query"]["categorymembers"]]
        if "continue" not in d:
            return out
        cont = {"cmcontinue": d["continue"]["cmcontinue"]}
        time.sleep(1)


def main():
    members = {}
    for code, name in GAMES.items():
        members[code] = category_members(name + " characters")
        print(code, len(members[code]))
        time.sleep(1)
    (CACHE / "members.json").write_text(json.dumps(members, indent=1, ensure_ascii=False), "utf-8")

    pages_file = CACHE / "pages.json"
    pages = json.loads(pages_file.read_text("utf-8")) if pages_file.exists() else {}
    todo = sorted({t for ts in members.values() for t in ts} - set(pages))
    print("da scaricare:", len(todo))
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        d = api({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                 "titles": "|".join(batch), "redirects": "1"})
        redirects = {r["from"]: r["to"] for r in d["query"].get("redirects", [])}
        texts = {}
        for p in d["query"]["pages"]:
            if "revisions" in p:
                texts[p["title"]] = p["revisions"][0]["slots"]["main"]["content"]
        for t in batch:
            pages[t] = texts.get(redirects.get(t, t), "")
        pages_file.write_text(json.dumps(pages, ensure_ascii=False), "utf-8")
        print(f"  {i + len(batch)}/{len(todo)}")
        time.sleep(1.5)


if __name__ == "__main__":
    main()
