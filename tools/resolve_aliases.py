"""Risolve i nomi carta non trovati cercando la pagina Yugipedia della carta (con redirect)
e leggendone la password. Scrive cache/aliases.json: nome -> password (int) oppure null
quando la carta non esiste nel gioco reale (carte esclusive dei videogiochi/anime)."""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_wiki import api  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
CACHE = Path(__file__).resolve().parent.parent / "cache"


def base(name):
    return re.sub(r"\s*\([^()]*\)$", "", name).strip()


def main():
    unmatched = [n for n, _ in json.loads((CACHE / "unmatched.json").read_text("utf-8"))]
    alias_file = CACHE / "aliases.json"
    aliases = json.loads(alias_file.read_text("utf-8")) if alias_file.exists() else {}
    todo = [n for n in unmatched if n not in aliases]
    # prima la pagina specifica del gioco (spesso contiene la password), poi quella base
    titles = sorted({base(n) for n in todo} | set(todo))
    info = {}
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        d = api({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                 "titles": "|".join(batch), "redirects": "1"})
        q = d["query"]
        norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
        redir = {x["from"]: x["to"] for x in q.get("redirects", [])}
        texts = {p["title"]: p["revisions"][0]["slots"]["main"]["content"]
                 for p in q["pages"] if "revisions" in p}
        for t in batch:
            t2 = norm.get(t, t)
            t2 = redir.get(t2, t2)
            txt = texts.get(t2)
            if txt is None:
                info[t] = None
                continue
            pw = re.search(r"^\|\s*password\s*=\s*0*(\d+)", txt, re.M)
            info[t] = {"title": t2, "password": int(pw.group(1)) if pw else None}
        print(f"  {i + len(batch)}/{len(titles)}")
        time.sleep(1.5)

    for n in todo:
        val = None
        for t in (n, base(n)):
            r = info.get(t)
            if r and r["password"]:
                val = r["password"]
                break
            if r and not val:
                val = val or ("name:" + base(r["title"]))
        aliases[n] = val
    alias_file.write_text(json.dumps(aliases, indent=1, ensure_ascii=False), "utf-8")
    print("risolti con password:", sum(isinstance(v, int) for v in aliases.values()),
          "solo nome:", sum(isinstance(v, str) for v in aliases.values()),
          "nessuno:", sum(v is None for v in aliases.values()))


if __name__ == "__main__":
    main()
