#!/usr/bin/env python3
"""Pose une question personnalisée dans Cultivons-nous, pour une date précise.

Usage :
  python3 question-perso.py 2026-12-25 questions/noel.json          # verifie puis ecrit
  python3 question-perso.py 2026-12-25 questions/noel.json --test   # verifie seulement
  python3 question-perso.py 2026-12-25 questions/noel.json --fixe   # garde l'ordre du JSON

Par defaut les propositions sont melangees et 'ok' est recalcule, pour que la
bonne reponse ne tombe pas toujours sur la meme lettre. Le melange est derive
de l'identifiant de la question, donc --test montre l'ordre qui sera ecrit.
"""
import json, random, re, subprocess, sys, datetime, zoneinfo

SECRET = "Cultivons-26-2dkwq0"
TZ = zoneinfo.ZoneInfo("America/Toronto")
CATS = {"musique","culture_generale","art_litterature","tv_cinema","actu_politique",
        "sport","jeux_videos","histoire","geographie","science","gastronomie"}

def die(m): print("✗ " + m); sys.exit(1)

date, path = sys.argv[1], sys.argv[2]
test = "--test" in sys.argv

if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date): die(f"date invalide : {date} (attendu AAAA-MM-JJ)")
try: d = datetime.date.fromisoformat(date)
except ValueError: die(f"date inexistante : {date}")

q = json.load(open(path, encoding="utf-8"))
for k in ("t","c","ok"): 
    if k not in q: die(f"champ obligatoire manquant : {k}")
if not isinstance(q["c"], list) or not 2 <= len(q["c"]) <= 4:
    die(f"'c' doit contenir 2 a 4 propositions (recu : {len(q.get('c',[]))})")
if not isinstance(q["ok"], int) or not 0 <= q["ok"] < len(q["c"]):
    die(f"'ok' doit etre un indice valide de 'c' (0..{len(q['c'])-1})")
if len(set(q["c"])) != len(q["c"]): die("propositions en double")
q.setdefault("cat", ""); q.setdefault("dif", ""); q.setdefault("id", f"perso-{date}")
if q["cat"] and q["cat"] not in CATS:
    print(f"⚠ categorie inconnue '{q['cat']}' -> affichera « Culture générale »")

if "--fixe" in sys.argv:
    print("· ordre du JSON conserve (--fixe)")
else:
    bonne = q["c"][q["ok"]]
    melange = list(q["c"])
    random.Random(q["id"]).shuffle(melange)
    q["c"], q["ok"] = melange, melange.index(bonne)
    print("· propositions melangees (reproductible, derive de l'id)")

aujourdhui = datetime.datetime.now(TZ).date()
if d < aujourdhui: die(f"date passee ({date}), l'emplacement est fige")
if d == aujourdhui: print("⚠ c'est aujourd'hui : la case est probablement deja prise")

ref = f"/{SECRET}/jours/{date}/question"
occupe = subprocess.run(["firebase","database:get",ref],capture_output=True,text=True).stdout.strip()
if occupe and occupe != "null": die(f"une question existe deja pour le {date} — ecriture impossible")

print(f"✓ valide — {date} ({d.strftime('%A %d %B %Y')}), case libre")
print(f"  « {q['t']} »")
for i,c in enumerate(q["c"]): print(f"    {'ABCD'[i]}. {c}" + ("   <-- bonne reponse" if i==q["ok"] else ""))
if test: print("\n(--test : rien n'a ete ecrit)"); sys.exit(0)

p = subprocess.run(["firebase","database:set",ref,"-f"],input=json.dumps(q,ensure_ascii=False),
                   capture_output=True,text=True)
if p.returncode != 0:
    die("echec de l'ecriture : " + (p.stderr.strip() or p.stdout.strip()))

relu = subprocess.run(["firebase","database:get",ref],capture_output=True,text=True).stdout.strip()
if not relu or relu == "null":
    die("la case est toujours vide : rien n'a ete ecrit")
if json.loads(relu).get("t") != q["t"]:
    die("relecture incoherente : " + relu)
print("✓ ecrit et verifie en base")
