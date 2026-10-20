#!/usr/bin/env bash
# =============================================================================
# Couche WaPla — les normales climatiques par gouvernorat (OMM 1991-2020, NOAA).
# DECISIONS_2026-10-16.md, amendement du 20/10/2026 ; SPEC_wapla § 3.1.
#
# Le climat de WaPla est une référence par GOUVERNORAT, saisie par la FNCT à
# partir des feuilles NOAA des normales OMM 1991-2020 (27 stations), chargée en
# base une fois (seed/normalesClimat.ts) et versionnée par sa date d'effet. Un
# gouvernorat sans station reçoit la normale de la station la plus proche :
# elle est « estimée », et l'écran du bilan le dit. La commune peut surcharger
# le climat ; rien ne l'y oblige.
#
# Elle commence par ce que le chargement REFUSE, sans rien écrire : une feuille
# modifiée depuis son téléchargement (SHA-256) ou absente du manifeste, un WMO
# qui ne correspond pas à la station, un bloc absent, une valeur annuelle vide,
# deux périodes mêlées ; dans la correspondance, un gouvernorat absent, inconnu
# ou en double, une station sans feuille, une méthode et un label incohérents,
# une distance saisie qui ne concorde pas avec la distance haversine calculée,
# une distance pour une station du gouvernorat, une normale sans station ; la
# réécriture d'une normale en vigueur. La base refuse les mêmes incohérences
# en SQL direct (migration 082). Puis : chaque gouvernorat couvert, chaque
# ligne avec sa période, sa méthode, ses stations et un label cohérent ;
# Ariana, Ben Arous et Manouba estimées depuis Tunis-Carthage, Sousse depuis
# Monastir, les autres stationnaires ; la distance d'une estimée est la
# distance haversine entre la station et le centre du gouvernorat, recalculée
# ici indépendamment du chargement. Enfin le moteur : un bilan reçoit la
# normale estimée de son gouvernorat, avec sa provenance ; la surcharge de la
# commune l'emporte ; un bilan sans climat n'est jamais « étayé ».
#
# Les feuilles sont FICTIVES, au format NOAA, bâties sur la liste des
# gouvernorats de la base ; la règle de rattachement, elle, est celle qui a été
# décidée. Date d'effet : le 1er janvier de l'année en cours. La table
# nationale est gardée avant le premier geste et rendue ligne pour ligne en
# partant (tests/outils/tables_nationales.sh) : les normales réelles ne
# bougent pas.
#
#   docker compose exec -T api npm run test:normales-climat
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
val()  { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
req() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer ${4:-$T_DIR}" \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}
entree() { val "next((str(x['$2']) for x in d['entrees'] if x['cle'] == '$1'), 'absente')"; }
detail() { val "next((str((x.get('detail') or {}).get('$2')) for x in d['entrees'] if x['cle'] == '$1'), 'absente')"; }
# charger <jeu> [options] : le chargement sur le jeu $T/<jeu>, sa sortie dans $T/charge.txt ; rend son code.
charger() {
  local jeu=$1; shift
  npx tsx seed/normalesClimat.ts --dossier "$T/$jeu/noaa" --manifeste "$T/$jeu/manifest.csv" \
      --correspondance "$T/$jeu/mapping.csv" "$@" > "$T/charge.txt" 2>&1
  echo $?
}
lignes_normales() { sql "SELECT count(*) FROM wapla.facteurs_reference"; }
# normale <gouvernorat> <colonnes> : la ligne de précipitations en vigueur à la date fictive.
normale() {
  $PSQL -c "SELECT $2 FROM wapla.facteurs_reference
             WHERE gouvernorat = '$1' AND code = 'precipitations_annuelles_mm' AND date_effet = '$DATE_FICTIVE' AND retire_le IS NULL" 2>/dev/null
}

TC=test_normales_climat
TC2=test_normales_sans_climat
ESSAI_C="'$TC','$TC2'"
EX=$(TZ=Africa/Tunis date +%Y)
DATE_FICTIVE="$EX-01-01"
. tests/outils/comptes_temporaires.sh
. tests/outils/communes_essai.sh
. tests/outils/base_reelle.sh
. tests/outils/tables_nationales.sh
nettoyer_c() {
  effacer_communes_essai "$ESSAI_C"
  retirer_comptes_temporaires
  effacer_communes_essai "$ESSAI_C"
}
# La table des normales est nationale : gardée entière avant le premier geste.
garder_tables_nationales wapla.facteurs_reference
nettoyer_c
trap 'nettoyer_c; rm -rf "$T"' EXIT
rendre_tables_nationales_en_sortie
releve_base_reelle

# Les gouvernorats du référentiel, lus dans la base.
$PSQL -c "SELECT DISTINCT gouvernorat FROM communes
           WHERE deleted_at IS NULL AND NOT est_demo AND id NOT LIKE 'test%' AND gouvernorat IS NOT NULL
           ORDER BY 1" > "$T/gouvernorats.txt" 2>/dev/null
NB_GOUV=$(grep -c . "$T/gouvernorats.txt")
$PSQL -F ';' -c "SELECT gouvernorat, ST_Y(ST_Centroid(ST_Collect(boundary_geom))), ST_X(ST_Centroid(ST_Collect(boundary_geom)))
                   FROM communes WHERE deleted_at IS NULL AND NOT est_demo AND id NOT LIKE 'test%' AND boundary_geom IS NOT NULL
                  GROUP BY gouvernorat" > "$T/centres.txt" 2>/dev/null
for g in Ariana 'Ben Arous' Manouba Sousse Tunis Monastir; do
  grep -qx "$g" "$T/gouvernorats.txt" || { echo "Le référentiel n'a pas le gouvernorat « $g » : lancer d'abord npm run seed." >&2; exit 1; }
done

# Les jeux : un jeu juste ($T/ok), et une copie fautive pour chaque refus.
python3 - "$T" <<'PYEOF'
import hashlib, math, os, shutil, sys
d = sys.argv[1]
# Le témoin des distances : haversine sur 6 371 km, du centre du gouvernorat à la station.
centres = {l.split(';')[0]: (float(l.split(';')[1]), float(l.split(';')[2]))
           for l in open(f'{d}/centres.txt', encoding='utf-8').read().splitlines() if l.strip()}
def dm(t):
    deg, mn, h = t.split('|'); v = int(deg) + int(mn) / 60
    return -v if h in 'SW' else v
def haversine(g, lat, lon):
    la1, lo1 = centres[g]; la2, lo2 = dm(lat), dm(lon)
    a = math.sin(math.radians(la2 - la1) / 2) ** 2 + math.cos(math.radians(la1)) * math.cos(math.radians(la2)) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    return round(2 * 6371 * math.asin(math.sqrt(a)), 1)
gouv = [l.rstrip('\n') for l in open(f'{d}/gouvernorats.txt', encoding='utf-8') if l.strip()]

# La règle de rattachement décidée : sans station, la plus proche.
ESTIMEES = {'Ariana': 'TUNIS_CARTHAGE', 'Ben Arous': 'TUNIS_CARTHAGE', 'Manouba': 'TUNIS_CARTHAGE', 'Sousse': 'MONASTIR'}
# Les deux stations voisines portent leurs coordonnées réelles (en-tête de leur feuille NOAA).
COORD = {'TUNIS_CARTHAGE': ('36|50|N', '10|14|E'), 'MONASTIR': ('35|40|N', '10|45|E')}
STATIONS_NOMMEES = {'Tunis': ('TUNIS_CARTHAGE', '60715', '350', '19'), 'Monastir': ('MONASTIR', '60740', '300', '19.5')}

def feuille(station, wmo, apy, aty, periode='1991-2020', sans_bloc=None, annuel_vide=None):
    lat, lon = COORD.get(station, ('34|00|N', '09|00|E'))
    l = [f'"Word Meteorological Organization Climate Normals for {periode}",,,,,,,,,,,,,,,,',
         '"Single Station Data Sheet For Oll Climatological Surface Parameters",,,,,,,,,,,,,,,,', ',,,,,,,,,,,,,,,,',
         '"Station Header Record",,,,,,,,,,,,,,,,', ',,,,,,,,,,,,,,,,', '"Country name",TUNISIA,,,,,,,,,,,,,,,',
         f'Station_Name,{station},,,,,,,,,,,,,,,', ',,,,,,,,,,,,,,,,', 'WMO_Number,Latitude,Longitude,Station_Height,,,,,,,,,,,,,',
         f'{wmo},{lat},{lon},3,,,,,,,,,,,,,', ',,,,,,,,,,,,,,,,']
    blocs = [(1, 'Precipitation_Total', 'mm', 'Sum    ', 4, apy), (2, 'Number_of_Days_with_Precipitation_>=_1_mm', 'count', 'Count  ', 5, '61.5'),
             (3, 'Daily_Maximum_Temperature', 'Deg_C', 'Mean   ', 1, '24.8'), (4, 'Daily_Minimum_Temperature', 'Deg_C', 'Mean   ', 1, '14.8'),
             (5, 'Daily_Mean_Temperature', 'Deg_C', 'Mean   ', 1, aty)]
    for code, nom, unite, calcul, ncalc, annuel in blocs:
        if code == sans_bloc:
            continue
        if code == annuel_vide:
            annuel = ''
        l += [',,,,,,,,,,,,,,,,', 'Parameter_Code,Parameter_Name,Units,,,,,,,,,,,,,,', f'{code},{nom},{unite},,,,,,,,,,,,,,', ',,,,,,,,,,,,,,,,',
              'WMO_Number,Parameter_Code,Calculation_Name,Calculation_Code,January,February,March,April,May,June,July,August,September,October,November,December,Annual',
              f'{wmo}, {code},{calcul}, {ncalc},' + ','.join(['   10.0'] * 12) + f',{annuel}',
              f'{wmo},{code},NOY,98,' + ','.join(['30'] * 12) + ',']
    return '\n'.join(l) + '\n'

def ecrire_jeu(nom, feuilles, mapping, manifeste_override=None):
    j = f'{d}/{nom}'
    os.makedirs(f'{j}/noaa', exist_ok=True)
    manif = ['fichier;sha256;url;date_telechargement;source;wmo;station']
    for fichier, (station, wmo, texte) in feuilles.items():
        open(f'{j}/noaa/{fichier}', 'w', encoding='utf-8', newline='\n').write(texte)
        h = hashlib.sha256(texte.encode('utf-8')).hexdigest()
        manif.append(f'{fichier};{h};https://example.test/noaa/{fichier};2026-10-20;TEST fictif NOAA;{wmo};{station}')
    if manifeste_override:
        manif = manifeste_override(manif)
    open(f'{j}/manifest.csv', 'w', encoding='utf-8', newline='\n').write('\n'.join(manif) + '\n')
    open(f'{j}/mapping.csv', 'w', encoding='utf-8', newline='\n').write(
        'gouvernorat;wmo;station;methode_rattachement;distance_km;label\n' + '\n'.join(';'.join(x) for x in mapping) + '\n')

feuilles, mapping = {}, []
for i, g in enumerate(gouv):
    if g in ESTIMEES:
        continue
    station, wmo, apy, aty = STATIONS_NOMMEES.get(g, (f'TEST_STATION_{i}', str(99000 + i), str(200 + 10 * i), f'{15 + 0.1 * i:.1f}'))
    feuilles[f'{station}_{wmo}.csv'] = (station, wmo, feuille(station, wmo, apy, aty))
    mapping.append([g, wmo, station, 'station_unique', '', 'stationnaire'])
# La distance d'Ariana est donnée, et juste ; les autres sont laissées au calcul.
attendues = {}
for g, station in ESTIMEES.items():
    wmo = STATIONS_NOMMEES['Tunis' if station == 'TUNIS_CARTHAGE' else 'Monastir'][1]
    attendues[g] = haversine(g, *COORD[station])
    mapping.append([g, wmo, station, 'plus_proche_voisin', str(attendues[g]) if g == 'Ariana' else '', 'estimee'])
open(f'{d}/distances_attendues.txt', 'w', encoding='utf-8').write(''.join(f'{g};{v}\n' for g, v in attendues.items()))
# Une station qu'aucun gouvernorat ne retient : permise (27 stations, 24 gouvernorats).
feuilles['TEST_STATION_LIBRE_99999.csv'] = ('TEST_STATION_LIBRE', '99999', feuille('TEST_STATION_LIBRE', '99999', '100', '20'))
ecrire_jeu('ok', feuilles, mapping)

def variante(nom, feuilles_v=None, mapping_v=None, manifeste_override=None):
    ecrire_jeu(nom, feuilles_v or feuilles, mapping_v or mapping, manifeste_override)

tunis = 'TUNIS_CARTHAGE_60715.csv'
# Une feuille modifiée APRÈS son entrée au manifeste.
variante('empreinte')
open(f'{d}/empreinte/noaa/{tunis}', 'a', encoding='utf-8').write(',,,,\n')
# Une feuille de plus, absente du manifeste.
variante('hors_manifeste')
open(f'{d}/hors_manifeste/noaa/TEST_INTRUSE_99998.csv', 'w', encoding='utf-8').write(feuille('TEST_INTRUSE', '99998', '100', '20'))
# Le manifeste annonce un autre WMO pour la feuille de Tunis-Carthage.
variante('wmo', manifeste_override=lambda m: [x.replace(';60715;TUNIS_CARTHAGE', ';60716;TUNIS_CARTHAGE') for x in m])
f = dict(feuilles); f[tunis] = ('TUNIS_CARTHAGE', '60715', feuille('TUNIS_CARTHAGE', '60715', '350', '19', sans_bloc=1)); variante('sans_bloc', f)
f = dict(feuilles); f[tunis] = ('TUNIS_CARTHAGE', '60715', feuille('TUNIS_CARTHAGE', '60715', '350', '19', annuel_vide=5)); variante('annuel_vide', f)
f = dict(feuilles); f[tunis] = ('TUNIS_CARTHAGE', '60715', feuille('TUNIS_CARTHAGE', '60715', '350', '19', periode='1981-2010')); variante('periodes', f)
variante('gouv_absent', mapping_v=[x for x in mapping if x[0] != 'Tunis'])
variante('gouv_inconnu', mapping_v=mapping + [['TEST-Atlantide', '60715', 'TUNIS_CARTHAGE', 'station_unique', '', 'stationnaire']])
variante('gouv_double', mapping_v=mapping + [mapping[0]])
variante('station_sans_feuille', mapping_v=[(x if x[0] != 'Tunis' else ['Tunis', '60799', 'TEST_FANTOME', 'station_unique', '', 'stationnaire']) for x in mapping])
variante('distance_fausse', mapping_v=[(x if x[0] != 'Ariana' else ['Ariana', '60715', 'TUNIS_CARTHAGE', 'plus_proche_voisin', str(round(attendues['Ariana'] + 10, 1)), 'estimee']) for x in mapping])
variante('distance_station_unique', mapping_v=[(x if x[0] != 'Tunis' else ['Tunis', '60715', 'TUNIS_CARTHAGE', 'station_unique', '5', 'stationnaire']) for x in mapping])
variante('estimee_sans_station', mapping_v=[(x if x[0] != 'Ariana' else ['Ariana', '60715', '', 'plus_proche_voisin', '', 'estimee']) for x in mapping])
variante('label_incoherent', mapping_v=[(x if x[0] != 'Tunis' else ['Tunis', '60715', 'TUNIS_CARTHAGE', 'station_unique', '', 'estimee']) for x in mapping])
change = dict(feuilles); change[tunis] = ('TUNIS_CARTHAGE', '60715', feuille('TUNIS_CARTHAGE', '60715', '360', '19')); variante('change', change)
PYEOF

echo
echo "1. Le chargement refuse, et n'écrit rien"
AVANT=$(lignes_normales)
refuse() {  # $1 = libellé, $2 = jeu, $3 = ce que le message doit dire
  local code
  code=$(charger "$2" --date-effet "$DATE_FICTIVE")
  chk "$1 : refusé, en le disant, et rien n'est écrit" "1|1|$AVANT" \
      "$code|$(grep -c -- "$3" "$T/charge.txt" | head -1)|$(lignes_normales)"
}
refuse "une feuille modifiée depuis son téléchargement" empreinte "empreinte SHA-256"
refuse "une feuille absente du manifeste" hors_manifeste "absente(s) du manifeste"
refuse "un WMO qui ne correspond pas à la station" wmo "le manifeste dit TUNIS_CARTHAGE (WMO 60716)"
refuse "le bloc des précipitations absent" sans_bloc "Precipitation_Total (paramètre 1, « Sum ») est absent"
refuse "la température annuelle vide" annuel_vide "Daily_Mean_Temperature, colonne Annual vide"
refuse "deux périodes mêlées" periodes "plusieurs périodes"
refuse "un gouvernorat sans station" gouv_absent "gouvernorat(s) sans station"
refuse "un gouvernorat que le référentiel ne connaît pas" gouv_inconnu "n'est pas un gouvernorat du référentiel"
refuse "un gouvernorat en double" gouv_double "figure deux fois"
refuse "une station qu'aucune feuille ne porte" station_sans_feuille "aucune feuille pour la station TEST_FANTOME"
refuse "une distance saisie qui ne concorde pas avec la distance haversine" distance_fausse "la distance haversine entre la station TUNIS_CARTHAGE"
refuse "une distance pour une station du gouvernorat" distance_station_unique "n'a de sens que pour une station voisine"
refuse "une normale estimée sans station" estimee_sans_station "aucune station"
refuse "un label incohérent avec la méthode" label_incoherent "ne va pas avec la méthode station_unique"

echo
echo "2. La base refuse les mêmes incohérences (migration 082)"
G_REF=$(head -1 "$T/gouvernorats.txt")
refus_sql() { $PSQL -c "INSERT INTO wapla.facteurs_reference (code, gouvernorat, valeur, source, date_effet, periode, methode_rattachement, stations_utilisees, distance_km, label)
                        VALUES ('temperature_moyenne_c', '$G_REF', 18, 'TEST', '2099-01-01', $1);" 2>&1 | grep -c "$2" | head -1; }
chk "station unique et label « estimee » : refusé" 1 "$(refus_sql "'1991-2020', 'station_unique', ARRAY['TEST'], NULL, 'estimee'" facteurs_reference_label_coherent)"
chk "plus proche voisin sans distance : refusé" 1 "$(refus_sql "'1991-2020', 'plus_proche_voisin', ARRAY['TEST'], NULL, 'estimee'" facteurs_reference_distance)"
chk "une provenance à moitié dite (label sans méthode) : refusé" 1 "$(refus_sql "NULL, NULL, NULL, NULL, 'estimee'" facteurs_reference_provenance_complete)"
chk "une liste de stations vide : refusé" 1 "$(refus_sql "'1991-2020', 'station_unique', ARRAY[]::text[], NULL, 'stationnaire'" facteurs_reference_stations)"

echo
echo "3. Le chargement : chaque gouvernorat, sa provenance"
chk "à blanc (--essai) : la date d'effet suit la période — 1er janvier 2021 —, et rien n'est écrit" "0|1|$AVANT" \
    "$(charger ok --essai)|$(grep -c "ESSAI, rien n'est écrit — période 1991-2020, date d'effet 2021-01-01" "$T/charge.txt")|$(lignes_normales)"
chk "le jeu fictif se charge" 0 "$(charger ok --date-effet "$DATE_FICTIVE")"
chk "deux valeurs par gouvernorat du référentiel ($NB_GOUV)" "$((AVANT + 2 * NB_GOUV))" "$(lignes_normales)"
chk "chaque ligne a sa période, sa méthode, ses stations et un label cohérent" 0 \
    "$(sql "SELECT count(*) FROM wapla.facteurs_reference WHERE date_effet = '$DATE_FICTIVE'
             AND NOT (periode = '1991-2020' AND cardinality(stations_utilisees) >= 1
                      AND ((methode_rattachement = 'station_unique' AND label = 'stationnaire')
                        OR (methode_rattachement = 'plus_proche_voisin' AND label = 'estimee' AND distance_km IS NOT NULL)))")"
for g in Ariana 'Ben Arous' Manouba; do
  chk "$g : estimée, plus proche voisin, depuis Tunis-Carthage, distance renseignée" "estimee|plus_proche_voisin|{TUNIS_CARTHAGE}|true" \
      "$(normale "$g" "label||'|'||methode_rattachement||'|'||stations_utilisees::text||'|'||(distance_km IS NOT NULL)")"
done
chk "Sousse : estimée, depuis Monastir" "estimee|plus_proche_voisin|{MONASTIR}|true" \
    "$(normale Sousse "label||'|'||methode_rattachement||'|'||stations_utilisees::text||'|'||(distance_km IS NOT NULL)")"
chk "les $((NB_GOUV - 4)) autres : stationnaires, station unique" "$((NB_GOUV - 4))" \
    "$(sql "SELECT count(DISTINCT gouvernorat) FROM wapla.facteurs_reference WHERE date_effet = '$DATE_FICTIVE'
             AND gouvernorat NOT IN ('Ariana', 'Ben Arous', 'Manouba', 'Sousse') AND label = 'stationnaire' AND methode_rattachement = 'station_unique'")"
chk "la distance d'une estimée : la distance haversine, recalculée ici (Ariana donnée, les trois autres calculées)" \
    "$(tr '\n' ' ' < "$T/distances_attendues.txt")" \
    "$(for g in Ariana 'Ben Arous' Manouba Sousse; do printf '%s;%s ' "$g" "$(normale "$g" distance_km)"; done)"
chk "une estimée porte la valeur de sa station" "350|19" \
    "$(normale Ariana valeur)|$($PSQL -c "SELECT valeur FROM wapla.facteurs_reference WHERE gouvernorat = 'Ariana' AND code = 'temperature_moyenne_c' AND date_effet = '$DATE_FICTIVE'")"
chk "la source dit la station, son WMO, la période et l'adresse" "INM/OMM-NOAA, normales 1991-2020, station TUNIS_CARTHAGE (WMO 60715) — https://example.test/noaa/TUNIS_CARTHAGE_60715.csv" \
    "$(normale Ariana source)"
chk "rejoué, il ne change rien" "0|$((AVANT + 2 * NB_GOUV))|1" \
    "$(charger ok --date-effet "$DATE_FICTIVE")|$(lignes_normales)|$(grep -c '0 valeur(s) ajoutée(s)' "$T/charge.txt")"
chk "une normale en vigueur ne se réécrit pas : refusé, la valeur reste" "1|1|350" \
    "$(charger change --date-effet "$DATE_FICTIVE")|$(grep -c 'ne se réécrit pas' "$T/charge.txt")|$(normale Tunis valeur)"

# -----------------------------------------------------------------------------
commune_essai "$TC" "TEST commune des normales climatiques"
commune_essai "$TC2" "TEST commune sans normales climatiques"
# La première dans un gouvernorat à normale estimée ; la seconde reste dans le
# gouvernorat « TEST », qui n'en a aucune.
$PSQL -c "UPDATE communes SET gouvernorat = 'Ariana' WHERE id = '$TC';" >/dev/null
compte_temporaire admin_commune "$TC" "Directeur des normales"; T_DIR=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$TC2" "Directeur sans normales"; T_DIR2=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_DIR" ] && [ -n "$T_DIR2" ] || { echo "API injoignable sur $API, ou comptes temporaires refusés" >&2; exit 1; }

echo
echo "4. Une commune n'écrit pas de normale"
chk "un directeur : 403" 403 \
    "$(req POST /wapla/facteurs-reference "{\"code\":\"temperature_moyenne_c\",\"gouvernorat\":\"Ariana\",\"valeur\":30,\"source\":\"TEST\",\"dateEffet\":\"$DATE_FICTIVE\"}")"

# Les entrées que la commune saisit pour que le bilan se calcule, et soit étayé
# s'il a son climat : les cinq clés, puis les quinze entrées comptées hors climat.
saisir() {  # $1 = bilan, $2 = jeton
  local c v
  for c in waste_in:1000 tc_1:0.5 tc_4:0 tc_5:0 tc_22:0 \
           tc_2:0.1 tc_6:0.5 tc_35:0 ghg_1:900 cost_1:100000 cost_5:50000 \
           ghg_5:0.1 ghg_6:0.55 ghg_14:0.1 ghg_15:0.55 ghg_3:0.1 ghg_11:0.1 ghg_18:0.1 ghg_4:0.8 ghg_19:0; do
    v=$(req PUT "/wapla/bilans/$1/entrees/${c%%:*}" "{\"valeur\":${c#*:}}" "$2")
    [ "$v" = 200 ] || echo "  (saisie de ${c%%:*} : $v)"
  done
}

echo
echo "5. Un bilan reçoit la normale estimée de son gouvernorat, avec sa provenance"
chk "la commune ouvre son bilan" 201 "$(req POST "/wapla/bilans?communeId=$TC" "{\"exercice\":$EX}")"
BILAN=$(val "d['id']")
chk "précipitations : la normale du gouvernorat, en référence nationale" "350|reference_tunisienne" "$(entree APY valeur)|$(entree APY provenance)"
chk "température : idem" "19|reference_tunisienne" "$(entree ATY valeur)|$(entree ATY provenance)"
chk "le détail dit : estimée, station voisine, distance, période" "estimee|plus_proche_voisin|['TUNIS_CARTHAGE']|$(grep '^Ariana;' "$T/distances_attendues.txt" | cut -d';' -f2)|1991-2020|Ariana" \
    "$(detail APY label)|$(detail APY methode_rattachement)|$(detail APY stations_utilisees)|$(detail APY distance_km)|$(detail APY periode)|$(detail APY gouvernorat)"
saisir "$BILAN" "$T_DIR"
chk "le calcul passe, étayé, climat renseigné, classe climatique 3" "200|etaye|True|3" \
    "$(req POST "/wapla/bilans/$BILAN/calcul")|$(val "d['niveau']")|$(val "d['fiabilite']['climat_renseigne']")|$(val "d['resultat']['climat']['classe']")"

echo
echo "6. La météo locale de la commune l'emporte"
chk "la commune saisit 1 200 mm : saisie de la commune" "200|1200|saisie_commune" \
    "$(req PUT "/wapla/bilans/$BILAN/entrees/APY" '{"valeur":1200}')|$(entree APY valeur)|$(entree APY provenance)"
chk "recalculé : classe climatique 6 (19 °C, plus de 1 000 mm), toujours étayé" "200|6|etaye" \
    "$(req POST "/wapla/bilans/$BILAN/calcul")|$(val "d['resultat']['climat']['classe']")|$(val "d['niveau']")"

echo
echo "7. Sans climat, un bilan n'est jamais étayé"
chk "dans un gouvernorat sans normales, le bilan n'a pas de climat" "201|absente|absente" \
    "$(req POST "/wapla/bilans?communeId=$TC2" "{\"exercice\":$EX}" "$T_DIR2")|$(entree APY valeur)|$(entree ATY valeur)"
BILAN2=$(val "d['id']")
chk "l'amorce le dit" t \
    "$(req GET "/wapla/amorce?communeId=$TC2&exercice=$EX" "" "$T_DIR2" >/dev/null; val "'t' if next(x for x in d['entrees'] if x['cle'] == 'APY')['manque'] else 'f'")"
saisir "$BILAN2" "$T_DIR2"
chk "les mêmes saisies, sous le seuil des valeurs par défaut : indicatif, climat non renseigné, sans classe" "200|indicatif|False|None" \
    "$(req POST "/wapla/bilans/$BILAN2/calcul" "" "$T_DIR2")|$(val "d['niveau']")|$(val "d['fiabilite']['climat_renseigne']")|$(val "d['resultat']['climat']['classe']")"
chk "… alors que seules les deux entrées du climat restent par défaut (2 sur 17, sous le seuil)" "2|17|True" \
    "$(val "len(d['fiabilite']['comptees_par_defaut'])")|$(val "d['fiabilite']['comptees']")|$(val "d['fiabilite']['part_par_defaut'] < d['fiabilite']['seuil']")"
# Les agrégats ne se lisent que sous le rôle de la FNCT : il est posé pour la session.
chk "et il n'entre pas dans les agrégats de la FNCT" 0 \
    "$($PSQL -c "SELECT set_config('app.role', 'super_admin_fnct', false)" \
             -c "SELECT count(*) FROM wapla.bilans_agregeables($EX) WHERE commune_id = '$TC2'" 2>/dev/null | tail -1)"

echo
echo "Aucune commune réelle n'a reçu de ligne ; la table nationale est rendue"
base_reelle_intacte "pendant la campagne"
nettoyer_c
chk "ses communes de test et ses comptes temporaires sont effacés" "0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
rendre_tables_nationales
tables_nationales_rendues "en partant"
base_reelle_intacte "en partant"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
