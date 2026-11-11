"""Estrae i deck dei personaggi dai wikitext Yugipedia e li collega ai codici carta.

Input:  cache/pages.json, cache/members.json, cache/cardinfo.json (YGOPRODeck),
        cache/aliases.json (opzionale: nome Yugipedia -> nome YGOPRODeck)
Output: app/data/decks.js  (window.DECK_DATA = {...})
        cache/unmatched.json (carte senza codice, per diagnosi)
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
OUT = ROOT / "app" / "data"

GAMES = [  # codice, nome, piattaforma, anno
    ("NT", "Yu-Gi-Oh! Nightmare Troubadour", "DS", 2005),
    ("SC", "Yu-Gi-Oh! GX Spirit Caller", "DS", 2006),
    ("WC07", "Yu-Gi-Oh! World Championship 2007", "DS", 2007),
    ("WC08", "Yu-Gi-Oh! World Championship 2008", "DS", 2007),
    ("WC09", "Yu-Gi-Oh! 5D's World Championship 2009: Stardust Accelerator", "DS", 2009),
    ("WC10", "Yu-Gi-Oh! 5D's World Championship 2010: Reverse of Arcadia", "DS", 2010),
    ("WC11", "Yu-Gi-Oh! 5D's World Championship 2011: Over the Nexus", "DS", 2011),
    ("TF1", "Yu-Gi-Oh! GX Tag Force", "PSP", 2006),
    ("TF2", "Yu-Gi-Oh! GX Tag Force 2", "PSP", 2007),
    ("TF3", "Yu-Gi-Oh! GX Tag Force 3", "PSP", 2008),
    ("TF4", "Yu-Gi-Oh! 5D's Tag Force 4", "PSP", 2009),
    ("TF5", "Yu-Gi-Oh! 5D's Tag Force 5", "PSP", 2010),
    ("TF6", "Yu-Gi-Oh! 5D's Tag Force 6", "PSP", 2011),
    ("TFS", "Yu-Gi-Oh! ARC-V Tag Force Special", "PSP", 2015),
]

# Riconoscimento del gioco dal titolo di sezione
HEADING_GAME = [
    (r"\bTag Force Special\b", "TFS"),
    (r"\bTag Force 6\b", "TF6"), (r"\bTag Force 5\b", "TF5"), (r"\bTag Force 4\b", "TF4"),
    (r"\bTag Force 3\b", "TF3"), (r"\bTag Force 2\b", "TF2"), (r"^Tag Force$", "TF1"),
    (r"World Championship 2011|Over the Nexus", "WC11"),
    (r"World Championship 2010|Reverse of Arcadia", "WC10"),
    (r"World Championship 2009|Stardust Accelerator", "WC09"),
    (r"World Championship 2008", "WC08"), (r"World Championship 2007", "WC07"),
    (r"Nightmare Troubadour", "NT"), (r"Spirit Caller", "SC"),
]
# Sezioni di altri giochi da ignorare
OTHER_GAME = re.compile(r"World Championship 2006|World Duel Carnival|V Jump|Tag Force Evolution|"
                        r"Duel Links|Master Duel|Legacy of the Duelist|Duelist of the Roses|"
                        r"Forbidden Memories|Duel Monsters|Power of Chaos|Online|Cross Duel|"
                        r"Rush Duel|Saga|Reshef|Eternal Duelist Soul|Dungeon Dice|Capsule Monster|"
                        r"Destiny Board|Duelists of the Roses|Falsebound|Sacred Cards|Dark Duel|"
                        r"Stairway|Card Almanac|Tag Duel|Ultimate Masters|Wheelie|Duel Terminal",
                        re.I)
# Suffisso di link che identifica il gioco (es. "Cobra Jar (World Championship 2011)")
LINK_GAME = [(code, re.compile(r"\((?:[^)]*\b)?" + pat + r"[^)]*\)$")) for pat, code in [
    ("World Championship 2011", "WC11"), ("World Championship 2010", "WC10"),
    ("World Championship 2009", "WC09"), ("World Championship 2008", "WC08"),
    ("World Championship 2007", "WC07"), ("Nightmare Troubadour", "NT"), ("Spirit Caller", "SC")]]

EXTRA_FRAMES = {"fusion", "synchro", "xyz", "link", "fusion_pendulum", "synchro_pendulum",
                "xyz_pendulum"}
HEAD_RE = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$")
LINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")


def clean_heading(h):
    h = re.sub(r"<[^>]+>", "", h)
    h = re.sub(r"\[\[(?:[^\]|]+\|)?([^\]]+)\]\]", r"\1", h)
    return h.replace("''", "").strip()


def norm(s):
    s = s.replace("’", "'").replace("–", "-").replace("—", "-").replace(" ", " ")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def load_cards():
    data = json.loads((CACHE / "cardinfo.json").read_text("utf-8"))["data"]
    by_name = {}
    for c in data:
        info = (c.get("misc_info") or [{}])[0]
        rec = {
            "id": c["id"], "name": c["name"], "frame": c.get("frameType", ""),
            "type": c.get("humanReadableCardType", c.get("type", "")),
            "md": "Master Duel" in (info.get("formats") or []),
        }
        by_name.setdefault(norm(c["name"]), rec)
        by_name[("#id", c["id"])] = rec
        for img in c.get("card_images") or []:  # artwork alternativi hanno id propri
            by_name.setdefault(("#id", img["id"]), rec)
        for alt in ("beta_name", "treated_as"):
            if info.get(alt):
                by_name.setdefault(norm(info[alt]), rec)
    return by_name


def find_card(target, display, cards, aliases):
    cands = []
    for s in (target, display):
        if not s:
            continue
        s = s.strip()
        cands.append(s)
        stripped = re.sub(r"\s*\([^()]*\)$", "", s)
        if stripped != s:
            cands.append(stripped)
    for s in cands:
        rec = cards.get(norm(s))
        if rec:
            return rec
    a = aliases.get(target.strip())
    if isinstance(a, int):
        return cards.get(("#id", a))
    if isinstance(a, str) and a.startswith("name:"):
        return cards.get(norm(a[5:]))
    return None


def parse_decklist(body):
    """body: testo del template senza '{{Decklist' e '}}'. Ritorna (campi, sezioni)."""
    fields, sections, cur = {}, defaultdict(list), None
    for line in body.split("\n"):
        m = re.match(r"^\s*\|\s*([^=\n|]+?)\s*=\s*(.*)$", line)
        if m and not line.lstrip().startswith("*"):
            key, val = m.group(1).strip(), m.group(2).strip()
            cur = key
            if val:
                fields[key] = val
            continue
        if line.lstrip().startswith("*") and cur:
            item = line.lstrip()[1:].strip()
            lm = LINK_RE.search(item)
            if not lm:
                continue
            rest = item[lm.end():]
            qm = re.search(r"[x×]\s*(\d+)", rest)
            qty = int(qm.group(1)) if qm else 1
            sections[cur].append((lm.group(1).strip(), (lm.group(2) or "").strip(), qty))
    return fields, sections


def strip_wiki(s):
    s = re.sub(r"\{\{\s*Ruby\s*\|([^|{}]*)\|[^{}]*\}\}", r"\1", s or "", flags=re.I)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:[^\]|]+\|)?([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"<[^>]+>", " ", s).replace("''", "")
    return re.sub(r"\s+", " ", s).strip()


def character_name(title):
    return re.sub(r"\s*\((?:Tag Force|World Championship|Nightmare Troubadour|Spirit Caller|"
                  r"character|Spirit Caller character|World Championship character)[^)]*\)$",
                  "", title).strip()


def main():
    pages = json.loads((CACHE / "pages.json").read_text("utf-8"))
    members = json.loads((CACHE / "members.json").read_text("utf-8"))
    alias_file = CACHE / "aliases.json"
    aliases = json.loads(alias_file.read_text("utf-8")) if alias_file.exists() else {}
    cards = load_cards()

    page_games = defaultdict(list)
    for g, ts in members.items():
        for t in ts:
            page_games[t].append(g)

    decks = defaultdict(list)
    unmatched = Counter()
    seen = set()
    for title in sorted(pages):
        txt = pages[title]
        if "{{Decklist" not in txt and "{{decklist" not in txt:
            continue
        stack = {}
        lines = txt.split("\n")
        i = 0
        while i < len(lines):
            line = lines[i]
            m = HEAD_RE.match(line)
            if m:
                lv = len(m.group(1))
                stack = {k: v for k, v in stack.items() if k < lv}
                stack[lv] = clean_heading(m.group(2))
                i += 1
                continue
            if not line.strip().lower().startswith("{{decklist"):
                i += 1
                continue
            # raccoglie il template fino alla chiusura bilanciata
            depth, buf = 0, []
            while i < len(lines):
                buf.append(lines[i])
                depth += lines[i].count("{{") - lines[i].count("}}")
                i += 1
                if depth <= 0:
                    break
            body = "\n".join(buf)
            body = body[body.lower().find("{{decklist") + 10:]
            body = body[: body.rfind("}}")]
            heads = [stack[k] for k in sorted(stack)]

            # gioco dal titolo di sezione
            game, variant = None, None
            for idx, h in enumerate(heads):
                for pat, code in HEADING_GAME:
                    if re.search(pat, h):
                        game = code
                        rest = [x for x in heads[idx + 1:] if x]
                        variant = " - ".join(rest) or None
                        break
                if game:
                    break
            if not game and any(OTHER_GAME.search(h) for h in heads):
                continue
            fields, sections = parse_decklist(body)
            if not game:
                # dai suffissi dei link, altrimenti dall'unica categoria della pagina
                votes = Counter()
                for items in sections.values():
                    for tgt, _, _ in items:
                        for code, rx in LINK_GAME:
                            if rx.search(tgt):
                                votes[code] += 1
                if votes:
                    game = votes.most_common(1)[0][0]
                elif len(page_games[title]) == 1:
                    game = page_games[title][0]
                else:
                    continue
                if game not in page_games[title] and page_games[title]:
                    pass

            main_d, extra_d, side_d, card_list = [], [], [], []
            miss = []
            for sec, items in sections.items():
                is_side = sec.startswith("side")
                for tgt, disp, qty in items:
                    rec = find_card(tgt, disp, cards, aliases)
                    shown = disp or re.sub(r"\s*\([^()]*\)$", "", tgt)
                    if not rec:
                        unmatched[tgt] += 1
                        miss.append(shown)
                        alt = None
                        sm = re.match(r"Speed Spell - (.+)$", shown)
                        if sm:  # equivalente "normale" della Speed Spell, se esiste
                            alt = find_card(sm.group(1), "", cards, aliases)
                        card_list.append({"n": shown, "q": qty, "s": "side" if is_side else "main",
                                          "id": None, "md": False, "t": sec, "alt": alt})
                        continue
                    zone = "side" if is_side else ("extra" if rec["frame"] in EXTRA_FRAMES else "main")
                    (side_d if zone == "side" else extra_d if zone == "extra" else main_d).extend(
                        [rec["id"]] * qty)
                    card_list.append({"n": rec["name"], "q": qty, "s": zone, "id": rec["id"],
                                      "md": rec["md"], "t": rec["type"]})
            if not card_list:
                continue
            char = character_name(title)
            name = strip_wiki(fields.get("name", "")) or "(senza nome)"
            key = (game, char, name, variant, tuple(sorted(main_d + extra_d)))
            if key in seen:
                continue
            seen.add(key)
            decks[game].append({
                "char": char,
                "variant": variant,
                "name": name,
                "ja": strip_wiki(fields.get("ja_name", "")) or None,
                "level": strip_wiki(fields.get("level", "")) or None,
                "page": title,
                "main": main_d, "extra": extra_d, "side": side_d,
                "cards": card_list,
                "missing": miss,
            })

    # formato compatto: tabella carte condivisa + deck con righe [chiave, quantità, zona]
    card_table = {}
    zone_code = {"main": "m", "extra": "e", "side": "s"}

    def lvl_key(v):
        m = re.match(r"\d+", v or "")
        return int(m.group()) if m else 99

    out = {"generated": __import__("datetime").date.today().isoformat(), "cards": card_table,
           "games": []}
    for code, name, plat, year in GAMES:
        ds = sorted(decks.get(code, []), key=lambda d: (d["char"].lower(), d["variant"] or "",
                                                        lvl_key(d["level"]), d["name"]))
        compact = []
        for d in ds:
            rows = []
            for c in d["cards"]:
                if c["id"]:
                    card_table[str(c["id"])] = [c["n"], c["t"], 1 if c["md"] else 0]
                    rows.append([c["id"], c["q"], zone_code[c["s"]]])
                else:
                    row = [c["n"], c["q"], zone_code[c["s"]]]
                    alt = c.get("alt")
                    if alt:
                        card_table[str(alt["id"])] = [alt["name"], alt["type"], 1 if alt["md"] else 0]
                        row.append(alt["id"])
                    rows.append(row)
            e = {"c": d["char"], "n": d["name"], "p": d["page"], "k": rows}
            for src, dst in (("variant", "v"), ("ja", "j"), ("level", "l")):
                if d[src]:
                    e[dst] = d[src]
            compact.append(e)
        out["games"].append({"code": code, "name": name, "platform": plat, "year": year,
                             "decks": compact})
        nmiss = sum(1 for d in ds if d["missing"])
        print(f"{code:5} {len(ds):4} deck  ({nmiss} con carte non trovate)")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "decks.js").write_text("window.DECK_DATA = " + json.dumps(out, ensure_ascii=False,
                                  separators=(",", ":")) + ";\n", "utf-8")
    (CACHE / "unmatched.json").write_text(json.dumps(unmatched.most_common(), indent=1,
                                          ensure_ascii=False), "utf-8")
    total = sum(unmatched.values())
    print("carte non trovate (occorrenze/distinte):", total, len(unmatched))


if __name__ == "__main__":
    main()
