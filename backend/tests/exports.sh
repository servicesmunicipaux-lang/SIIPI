#!/usr/bin/env bash
# =============================================================================
# Le service d'export unique — Jalon 4 (A3.4, B2.4, B3.6, B5.2.4, C1.4).
#
# LE TEST DE VALIDATION DE LA FEUILLE DE ROUTE : un export rouvert dans un
# tableur affiche les accents arabes et français correctement, et les nombres
# restent des nombres. Vérifié ici sur les octets mêmes des fichiers : BOM et
# UTF-8 pour le CSV, cellules typées dans le XLSX.
#
# Puis ce qu'un export ne doit jamais faire : sortir d'autres lignes que
# l'écran (mêmes filtres, même cloisonnement), exécuter une formule glissée
# dans un champ, ou déguiser une erreur en fichier.
#
#   docker compose exec -T api npm run test:exports
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
sqlt() { $PSQL -c "$1" 2>/dev/null; }
# Télécharge dans $T/f, en-têtes dans $T/h ; rend le code HTTP.
dl() { curl -s -D "$T/h" -o "$T/f" -w '%{http_code}' "$@"; }
entete() { grep -i "^$1:" "$T/h" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

# Lecture d'un fichier téléchargé, sans dépendance : le CSV par le module csv,
# le XLSX en ouvrant l'archive et la feuille XML.
cat > "$T/lire.py" <<'PY'
import csv, io, json, sys, zipfile, xml.etree.ElementTree as ET
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def csv_lignes(chemin):
    brut = open(chemin, 'rb').read()
    return brut.startswith(b'\xef\xbb\xbf'), list(csv.reader(io.StringIO(brut.decode('utf-8-sig')), delimiter=';'))
def xlsx(chemin):
    z = zipfile.ZipFile(chemin)
    if z.testzip() is not None:
        raise SystemExit('archive corrompue')
    feuille = z.read('xl/worksheets/sheet1.xml').decode('utf-8')
    racine = ET.fromstring(feuille)
    # Une case vide n'est pas écrite : chaque cellule est replacée d'après sa
    # référence (« C7 » → colonne 2), sans quoi les colonnes glisseraient.
    def colonne(ref):
        n = 0
        for ch in ref:
            if ch.isalpha(): n = n * 26 + ord(ch) - 64
        return n - 1
    vide = {'t': None, 's': None, 'v': None}
    lignes = []
    for r in racine.find('m:sheetData', NS):
        ligne = []
        for c in r:
            i = colonne(c.get('r'))
            ligne.extend([vide] * (i - len(ligne)))
            t, s = c.get('t'), c.get('s')
            v = c.find('m:v', NS)
            texte = c.find('m:is/m:t', NS)
            ligne.append({'t': t or 'n', 's': s, 'v': (texte.text if texte is not None else (v.text if v is not None else None))})
        lignes.append(ligne)
    largeur = max((len(l) for l in lignes), default=0)
    lignes = [l + [vide] * (largeur - len(l)) for l in lignes]
    return feuille, lignes
cmd, chemin = sys.argv[1], sys.argv[2]
if cmd == 'csv':
    bom, l = csv_lignes(chemin); print(json.dumps({'bom': bom, 'lignes': l}, ensure_ascii=False))
else:
    f, l = xlsx(chemin); print(json.dumps({'rtl': 'rightToLeft="1"' in f, 'formule': '<f>' in f, 'lignes': l}, ensure_ascii=False))
PY
lire() { python3 "$T/lire.py" "$1" "$T/f" > "$T/l.json" 2>"$T/err" || echo '{}' > "$T/l.json"; }
q() { python3 -c "import json;d=json.load(open('$T/l.json'));$1" 2>/dev/null || echo erreur; }

T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")
# La commune de démonstration la mieux fournie : parc et circuits réels.
PARC=$(sql "SELECT commune_id FROM vehicules WHERE deleted_at IS NULL AND valeur_achat_tnd IS NOT NULL GROUP BY commune_id ORDER BY count(*) DESC LIMIT 1")
# Aucun seed ne crée de points de collecte (ils viennent d'un import KML) :
# la campagne pose les siens, sur deux circuits d'une même commune.
POINTS=$(sql "SELECT commune_id FROM circuits WHERE deleted_at IS NULL GROUP BY commune_id HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 1")
C_A=$(sql "SELECT id FROM circuits WHERE commune_id='$POINTS' AND deleted_at IS NULL ORDER BY nom LIMIT 1")
C_B=$(sql "SELECT id FROM circuits WHERE commune_id='$POINTS' AND deleted_at IS NULL ORDER BY nom OFFSET 1 LIMIT 1")

nettoyer() {
  $PSQL -c "DELETE FROM contacts WHERE nom_complet LIKE 'TEST-X%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM points_collecte WHERE nom LIKE 'TEST-X%';" >/dev/null 2>&1
}
nettoyer
$PSQL -c "INSERT INTO points_collecte (circuit_id, commune_id, ordre, nom, type, geom, precision_m) VALUES
  ('$C_A','$POINTS',9001,'TEST-X نقطة اختبار','porte_a_porte', ST_SetSRID(ST_MakePoint(10.75,36.46),4326), 4.5),
  ('$C_A','$POINTS',9002,'TEST-X école','point_noir',      ST_SetSRID(ST_MakePoint(10.76,36.46),4326), 12),
  ('$C_A','$POINTS',9003,'TEST-X marché','porte_a_porte',  ST_SetSRID(ST_MakePoint(10.77,36.46),4326), NULL),
  ('$C_B','$POINTS',9001,'TEST-X rond-point','porte_a_porte', ST_SetSRID(ST_MakePoint(10.78,36.47),4326), 3),
  ('$C_B','$POINTS',9002,'TEST-X souk','point_noir',       ST_SetSRID(ST_MakePoint(10.79,36.47),4326), 7.25);" >/dev/null

# -----------------------------------------------------------------------------
echo
echo "1. Les cinq écrans exportent, dans les deux formats"
for route in "observatoire/gouvernorats?" "observatoire/deploiement?" "trucks?communeId=$PARC&" \
             "circuits/points?communeId=$POINTS&" "contacts?communeId=$COMMUNE&"; do
  jeton="$T_FNCT"; [ "${route#contacts}" != "$route" ] && jeton="$T_DIR"
  chk "/${route%%\?*} en CSV" "200|text/csv; charset=utf-8" \
      "$(dl -H "Authorization: Bearer $jeton" "$API/${route}format=csv")|$(entete content-type)"
  chk "/${route%%\?*} en XLSX, archive intègre" "200|1" \
      "$(dl -H "Authorization: Bearer $jeton" "$API/${route}format=xlsx")|$(lire xlsx; q "print(1 if d.get('lignes') else 0)")"
done
SONDAGE=$(sql "SELECT p.id FROM publications p WHERE p.type='sondage' AND p.deleted_at IS NULL AND EXISTS (SELECT 1 FROM sondage_questions q WHERE q.publication_id=p.id) LIMIT 1")
if [ -n "$SONDAGE" ]; then
  chk "le dépouillement d'un sondage en CSV" 200 "$(dl -H "Authorization: Bearer $T_FNCT" "$API/communication/$SONDAGE/depouillement?format=csv")"
  lire csv
  chk "une ligne par option, comme à l'écran" \
      "$(curl -s -H "Authorization: Bearer $T_FNCT" "$API/communication/$SONDAGE/depouillement" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')" \
      "$(q "print(len(d['lignes'])-1)")"
fi
dl -H "Authorization: Bearer $T_DIR" "$API/contacts?communeId=$COMMUNE&format=csv" >/dev/null
chk "le fichier porte un nom daté, rattaché à la commune" "attachment; filename=\"contacts-$COMMUNE-$(date -u +%Y-%m-%d).csv\"" \
    "$(entete content-disposition)"

echo
echo "2. Les accents arabes et français traversent le fichier"
NOM_AR=$(sqlt "SELECT name_ar FROM communes WHERE name_ar IS NOT NULL AND name_ar <> '' ORDER BY id LIMIT 1")
NOM_FR=$(sqlt "SELECT name FROM communes WHERE name ~ '[éèêàç]' ORDER BY id LIMIT 1")
dl -H "Authorization: Bearer $T_FNCT" "$API/observatoire/deploiement?format=csv" >/dev/null; lire csv
chk "le CSV commence par le BOM UTF-8 (sans lui, Excel lit l'arabe illisible)" True "$(q "print(d['bom'])")"
chk "un nom de commune en arabe est intact dans le CSV" 1 "$(q "print(1 if any('$NOM_AR' in c for l in d['lignes'] for c in l) else 0)")"
if [ -n "$NOM_FR" ]; then
  chk "un nom accentué en français aussi" 1 "$(q "print(1 if any('$NOM_FR' == c for l in d['lignes'] for c in l) else 0)")"
fi
chk "les en-têtes accentués sont intacts" 1 "$(q "print(1 if 'Dernière activité' in d['lignes'][0] else 0)")"
dl -H "Authorization: Bearer $T_FNCT" "$API/observatoire/deploiement?format=xlsx" >/dev/null; lire xlsx
chk "le même nom arabe est intact dans le XLSX" 1 "$(q "print(1 if any(c['v']=='$NOM_AR' for l in d['lignes'] for c in l) else 0)")"
dl -H "Authorization: Bearer $T_FNCT" "$API/observatoire/deploiement?format=xlsx&langue=ar" >/dev/null; lire xlsx
chk "demandé en arabe : en-têtes en arabe" "البلدية" "$(q "print(d['lignes'][0][1]['v'])")"
chk "et feuille de droite à gauche" True "$(q "print(d['rtl'])")"
chk "les statuts codés sortent en libellés arabes, pas en codes" 0 \
    "$(q "print(sum(1 for l in d['lignes'][1:] if l[5]['v'] in ('active','incomplete','desactivee')))")"

echo
echo "3. Les nombres restent des nombres"
# valeur_achat_tnd est un NUMERIC : pg le rend en CHAÎNE. C'est exactement le
# cas qu'un export naïf écrit en texte.
chk "en JSON, la valeur d'achat reste ce qu'elle était (inchangé par le service)" "str" \
    "$(curl -s -H "Authorization: Bearer $T_FNCT" "$API/trucks?communeId=$PARC" | python3 -c "import sys,json;print(type(next(v['valeur_achat_tnd'] for v in json.load(sys.stdin) if v['valeur_achat_tnd'] is not None)).__name__)")"
dl -H "Authorization: Bearer $T_FNCT" "$API/trucks?communeId=$PARC&format=xlsx" >/dev/null; lire xlsx
chk "en XLSX, la colonne « Valeur d'achat » ne contient que des cellules numériques" "0|1" \
    "$(q "i=[c['v'] for c in d['lignes'][0]].index(\"Valeur d'achat (TND)\"); cel=[l[i] for l in d['lignes'][1:] if l[i]['v'] is not None]; print(f\"{sum(1 for c in cel if c['t']!='n')}|{1 if cel else 0}\")")"
chk "et ces nombres se relisent comme des nombres" 1 \
    "$(q "i=[c['v'] for c in d['lignes'][0]].index(\"Valeur d'achat (TND)\"); print(1 if all(float(l[i]['v'])>=0 for l in d['lignes'][1:] if len(l)>i and l[i]['v']) else 0)")"
chk "les dates sont des dates (format date, pas du texte)" 1 \
    "$(q "i=[c['v'] for c in d['lignes'][0]].index('1re mise en circulation'); print(1 if all(l[i]['t']=='n' and l[i]['s']=='2' for l in d['lignes'][1:] if len(l)>i and l[i]['v']) else 0)")"
chk "les états codés sortent en libellés (« En panne », pas « en_panne »)" 0 \
    "$(q "i=[c['v'] for c in d['lignes'][0]].index('État'); print(sum(1 for l in d['lignes'][1:] if l[i]['v'] and '_' in l[i]['v']))")"
dl -H "Authorization: Bearer $T_FNCT" "$API/trucks?communeId=$PARC&format=csv" >/dev/null; lire csv
chk "en CSV, virgule décimale et aucun point : un Excel français y lit un nombre" 1 \
    "$(q "import re; i=d['lignes'][0].index(\"Valeur d'achat (TND)\"); v=[l[i] for l in d['lignes'][1:] if l[i]]; print(1 if v and all(re.fullmatch(r'-?\d+(,\d+)?', x) for x in v) else 0)")"

echo
echo "4. Un export ne sort que ce que l'écran montre"
CIRCUIT=$C_A
N_JSON=$(curl -s -H "Authorization: Bearer $T_FNCT" "$API/circuits/points?communeId=$POINTS&circuitId=$CIRCUIT" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
N_TOUS=$(curl -s -H "Authorization: Bearer $T_FNCT" "$API/circuits/points?communeId=$POINTS" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
dl -H "Authorization: Bearer $T_FNCT" "$API/circuits/points?communeId=$POINTS&circuitId=$CIRCUIT&format=csv" >/dev/null; lire csv
chk "les points filtrés par circuit : autant de lignes que l'écran filtré" "$N_JSON" "$(q "print(len(d['lignes'])-1)")"
chk "et moins que la commune entière (le filtre a bien porté)" 1 "$(python3 -c "print(1 if 0 < $N_JSON < $N_TOUS else 0)")"
dl -H "Authorization: Bearer $T_FNCT" "$API/circuits/points?communeId=$POINTS&type=point_noir&format=csv" >/dev/null; lire csv
chk "le filtre par type aussi, libellé traduit dans le fichier" "$(sql "SELECT count(*) FROM points_collecte p JOIN circuits c ON c.id=p.circuit_id WHERE p.commune_id='$POINTS' AND p.type='point_noir' AND p.deleted_at IS NULL AND c.deleted_at IS NULL")|Point noir" \
    "$(q "print(str(len(d['lignes'])-1)+'|'+','.join(sorted(set(l[4] for l in d['lignes'][1:]))))")"
dl -H "Authorization: Bearer $T_FNCT" "$API/circuits/points?communeId=$POINTS&circuitId=$C_A&format=xlsx" >/dev/null; lire xlsx
chk "un nom de point en arabe et une précision décimale traversent le XLSX" "TEST-X نقطة اختبار|n|4.5" \
    "$(q "l=next(l for l in d['lignes'] if l[3]['v']=='TEST-X نقطة اختبار'); print(l[3]['v']+'|'+l[7]['t']+'|'+l[7]['v'])")"
chk "un identifiant de circuit invalide reste une erreur JSON" "400|application/json" \
    "$(dl -H "Authorization: Bearer $T_FNCT" "$API/circuits/points?communeId=$POINTS&circuitId=nimporte&format=csv")|$(entete content-type | cut -d';' -f1)"

echo
echo "5. Cloisonnement : un fichier n'ouvre rien que la liste n'ouvrait pas"
post() { curl -s -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' -d "$1" "$API/contacts?communeId=$COMMUNE"; }
post '{"nomComplet":"TEST-X Formule","telephone":"+216 71 000 000","notes":"=HYPERLINK(\"http://exemple.test\",\"clic\")","fonction":"-2+3"}' >/dev/null
post '{"nomComplet":"TEST-X Guillemets","email":"g@example.test","organisation":"Société \"Nour\"; filiale","notes":"ligne 1\nligne 2"}' >/dev/null
AUTRE_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id <> '$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
if [ -n "$AUTRE_EMAIL" ]; then
  dl -H "Authorization: Bearer $(tok "$AUTRE_EMAIL")" "$API/contacts?communeId=$COMMUNE&format=csv" >/dev/null; lire csv
  chk "une autre commune qui exporte l'annuaire de celle-ci n'obtient que l'en-tête" 0 "$(q "print(sum(1 for l in d['lignes'][1:] if l and l[0].startswith('TEST-X')))")"
fi
PREST_EMAIL=$(sql "SELECT email FROM users WHERE role='gestionnaire_prestataire' AND deleted_at IS NULL AND is_active ORDER BY created_at LIMIT 1")
if [ -n "$PREST_EMAIL" ]; then
  chk "un prestataire est refusé, en JSON — pas un fichier vide" "403|application/json" \
      "$(dl -H "Authorization: Bearer $(tok "$PREST_EMAIL")" "$API/contacts?communeId=$COMMUNE&format=csv")|$(entete content-type | cut -d';' -f1)"
fi
chk "sans jeton, 401 en JSON" "401|application/json" "$(dl "$API/contacts?communeId=$COMMUNE&format=xlsx")|$(entete content-type | cut -d';' -f1)"
chk "un format inconnu est refusé" "400|application/json" \
    "$(dl -H "Authorization: Bearer $T_DIR" "$API/contacts?communeId=$COMMUNE&format=pdf")|$(entete content-type | cut -d';' -f1)"
chk "le fichier n'est gardé par aucun cache" "no-store" \
    "$(dl -H "Authorization: Bearer $T_DIR" "$API/contacts?communeId=$COMMUNE&format=csv" >/dev/null; entete cache-control)"

echo
echo "6. Ce qu'un champ saisi ne doit jamais devenir dans un tableur"
dl -H "Authorization: Bearer $T_DIR" "$API/contacts?communeId=$COMMUNE&format=csv" >/dev/null; lire csv
chk "une formule glissée dans les notes est neutralisée en CSV" "'=HYPERLINK(\"http://exemple.test\",\"clic\")" \
    "$(q "print(next(l for l in d['lignes'] if l[0]=='TEST-X Formule')[6])")"
chk "de même pour un texte qui commence par - ou +" "'-2+3|'+216 71 000 000" \
    "$(q "l=next(l for l in d['lignes'] if l[0]=='TEST-X Formule'); print(l[3]+'|'+l[4])")"
chk "guillemets, point-virgule et retour à la ligne relus à l'identique" "Société \"Nour\"; filiale|ligne 1
ligne 2" "$(q "l=next(l for l in d['lignes'] if l[0]=='TEST-X Guillemets'); print(l[2]+'|'+l[6])")"
dl -H "Authorization: Bearer $T_DIR" "$API/contacts?communeId=$COMMUNE&format=xlsx" >/dev/null; lire xlsx
chk "en XLSX, aucune cellule n'est une formule" False "$(q "print(d['formule'])")"
chk "la formule y reste un texte, écrit tel quel" "inlineStr|=HYPERLINK(\"http://exemple.test\",\"clic\")" \
    "$(q "l=next(l for l in d['lignes'] if l[0]['v']=='TEST-X Formule'); print(l[6]['t']+'|'+l[6]['v'])")"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
