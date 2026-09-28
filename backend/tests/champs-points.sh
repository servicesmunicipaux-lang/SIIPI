#!/usr/bin/env bash
# =============================================================================
# Champs libres, étiquettes et actions planifiées — Jalon 6 (B3.4, B3.5).
#
# LE TEST DE VALIDATION DE LA FEUILLE DE ROUTE : une commune ajoute un champ
# « accès camion », le renseigne sur trente points, filtre dessus et exporte —
# sans intervention. Puis ce qui rendrait ce tableau trompeur : une valeur
# d'un autre type que le champ, un lot appliqué à moitié, une étiquette ou une
# action d'une autre commune, un choix retiré alors qu'il est encore utilisé.
#
#   docker compose exec -T api npm run test:champs-points
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
val()  { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
# req <méthode> <chemin> [corps JSON] [jeton] — rend le code HTTP, corps dans $T/r.json.
req() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" -H "Authorization: Bearer ${4:-$T_DIR}" \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}
jour() { date -u -d "$1 days" +%Y-%m-%d; }
# Nombre de points de la commune rendus par la liste, avec des filtres.
nb() { req GET "/circuits/points?communeId=$COMMUNE&$1" >/dev/null; val "len(d)"; }
# Liste JSON d'identifiants : ids <début> <nombre>
ids() { python3 -c "import json;l=open('$T/points').read().split();print(json.dumps(l[$1:$1+$2]))"; }
un()  { python3 -c "l=open('$T/points').read().split();print(l[$1])"; }

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")

nettoyer() {
  $PSQL -c "DELETE FROM actions_planifiees WHERE titre LIKE 'TEST-J6%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM circuits WHERE nom LIKE 'TEST-J6%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM champs_points WHERE libelle LIKE 'TEST-J6%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM etiquettes_points WHERE nom LIKE 'TEST-J6%';" >/dev/null 2>&1
}
nettoyer

# Deux circuits de test : 40 arrêts sur le premier, 5 sur le second.
req POST /circuits "{\"communeId\":\"$COMMUNE\",\"nom\":\"TEST-J6 Circuit A\",\"joursPassage\":[1,3,5]}" >/dev/null
C_A=$(val "d['id']")
req POST /circuits "{\"communeId\":\"$COMMUNE\",\"nom\":\"TEST-J6 Circuit B\",\"joursPassage\":[2,4]}" >/dev/null
C_B=$(val "d['id']")
: > "$T/points"
for i in $(seq 1 40); do
  req POST "/circuits/$C_A/points" "{\"nom\":\"TEST-J6 A$i\",\"lat\":36.$((4500+i)),\"lng\":10.$((7500+i))}" >/dev/null
  val "d['id']" >> "$T/points"
done
for i in $(seq 1 5); do
  req POST "/circuits/$C_B/points" "{\"nom\":\"TEST-J6 B$i\",\"lat\":36.$((4600+i)),\"lng\":10.$((7600+i))}" >/dev/null
  val "d['id']" >> "$T/points"
done
TOTAL=$(nb "")

# -----------------------------------------------------------------------------
echo
echo "1. La commune ajoute ses colonnes"
chk "le champ « accès camion » (oui/non) se crée" 201 \
    "$(req POST "/points/champs?communeId=$COMMUNE" '{"libelle":"TEST-J6 Accès camion","libelleAr":"TEST-J6 دخول الشاحنة","type":"oui_non"}')"
F_ACCES=$(val "d['id']")
chk "un second champ du même libellé (casse près) est refusé" 409 \
    "$(req POST "/points/champs?communeId=$COMMUNE" '{"libelle":"test-j6 accès CAMION","type":"texte"}')"
chk "une liste sans choix est refusée" 400 \
    "$(req POST "/points/champs?communeId=$COMMUNE" '{"libelle":"TEST-J6 Vide","type":"liste"}')"
chk "des choix sur un champ qui n'est pas une liste sont refusés" 400 \
    "$(req POST "/points/champs?communeId=$COMMUNE" '{"libelle":"TEST-J6 Faux","type":"texte","options":["a"]}')"
req POST "/points/champs?communeId=$COMMUNE" '{"libelle":"TEST-J6 Nombre de bacs","type":"nombre"}' >/dev/null
F_BACS=$(val "d['id']")
req POST "/points/champs?communeId=$COMMUNE" '{"libelle":"TEST-J6 État du bac","type":"liste","options":["bon","abîmé","absent"]}' >/dev/null
F_ETAT=$(val "d['id']")
req POST "/points/champs?communeId=$COMMUNE" '{"libelle":"TEST-J6 Remarque","type":"texte"}' >/dev/null
F_REM=$(val "d['id']")
req POST "/points/champs?communeId=$COMMUNE" '{"libelle":"TEST-J6 Visite","type":"date"}' >/dev/null
F_VISITE=$(val "d['id']")
req GET "/points/champs?communeId=$COMMUNE" >/dev/null
chk "les cinq champs sont listés, dans l'ordre de création" "TEST-J6 Accès camion|TEST-J6 Visite" \
    "$(val "'|'.join([c['libelle'] for c in d if c['libelle'].startswith('TEST-J6')][i] for i in (0,-1))")"

echo
echo "2. LE TEST DE VALIDATION — renseigné sur trente points, filtré, exporté"
chk "« non » posé d'un coup sur trente points" "200|30" \
    "$(req POST /points/lot "{\"pointIds\":$(ids 0 30),\"attributs\":{\"$F_ACCES\":\"non\"}}")|$(val "d['modifies']")"
chk "« oui » sur dix autres" "200|10" \
    "$(req POST /points/lot "{\"pointIds\":$(ids 30 10),\"attributs\":{\"$F_ACCES\":true}}")|$(val "d['modifies']")"
chk "la valeur est rangée en booléen, pas en texte" "false" \
    "$(sql "SELECT attributs -> '$F_ACCES' FROM points_collecte WHERE id='$(un 0)'")"
chk "le filtre « accès camion = non » rend les trente points" 30 "$(nb "champId=$F_ACCES&valeur=non")"
chk "« = oui » en rend dix" 10 "$(nb "champId=$F_ACCES&valeur=oui")"
chk "« renseigné » quarante, « vide » le reste de la commune" "40|$((TOTAL-40))" \
    "$(nb "champId=$F_ACCES")|$(nb "champId=$F_ACCES&operateur=vide")"
curl -s -o "$T/f.csv" -H "Authorization: Bearer $T_DIR" "$API/circuits/points?communeId=$COMMUNE&champId=$F_ACCES&valeur=non&format=csv"
chk "l'export CSV reprend la sélection : trente lignes" 30 \
    "$(python3 -c "print(len(open('$T/f.csv',encoding='utf-8-sig').read().strip().splitlines())-1)")"
chk "avec la colonne « accès camion », à « non » sur chaque ligne" "1|1" \
    "$(python3 -c "
import csv
r=list(csv.reader(open('$T/f.csv',encoding='utf-8-sig'),delimiter=';'))
i=r[0].index('TEST-J6 Accès camion')
print('1|'+('1' if all(l[i]=='non' for l in r[1:]) else '0'))")"
chk "et la colonne des étiquettes" 1 "$(python3 -c "print(1 if 'Étiquettes' in open('$T/f.csv',encoding='utf-8-sig').readline() else 0)")"
curl -s -o "$T/f.xlsx" -H "Authorization: Bearer $T_DIR" "$API/circuits/points?communeId=$COMMUNE&champId=$F_ACCES&valeur=non&format=xlsx&langue=ar"
chk "l'export Excel en arabe prend le libellé arabe du champ" 1 \
    "$(python3 -c "
import zipfile
z=zipfile.ZipFile('$T/f.xlsx')
print(1 if any('دخول الشاحنة' in z.read(n).decode('utf-8') for n in z.namelist() if n.endswith('.xml')) else 0)" 2>/dev/null || echo 0)"

echo
echo "3. Une valeur se contrôle contre son champ"
chk "« 3,5 » dans un champ nombre est rangé 3.5" "200|3.5" \
    "$(req PATCH "/points/$(un 0)" "{\"attributs\":{\"$F_BACS\":\"3,5\"}}")|$(val "d['attributs']['$F_BACS']")"
chk "et se retrouve par le filtre numérique" 1 "$(nb "champId=$F_BACS&valeur=3.5")"
chk "« beaucoup » dans un champ nombre est refusé" 400 "$(req PATCH "/points/$(un 1)" "{\"attributs\":{\"$F_BACS\":\"beaucoup\"}}")"
chk "un choix hors de la liste est refusé" 400 "$(req PATCH "/points/$(un 1)" "{\"attributs\":{\"$F_ETAT\":\"cassé\"}}")"
chk "une date inexistante est refusée" 400 "$(req PATCH "/points/$(un 1)" "{\"attributs\":{\"$F_VISITE\":\"2026-02-30\"}}")"
chk "un champ inconnu est refusé" 400 "$(req PATCH "/points/$(un 1)" '{"attributs":{"00000000-0000-4000-8000-000000000000":"x"}}')"
chk "un lot dont UNE valeur est fausse n'écrit rien" "400|0" \
    "$(req POST /points/lot "{\"pointIds\":$(ids 5 5),\"attributs\":{\"$F_REM\":\"vu\",\"$F_BACS\":\"x\"}}")|$(sql "SELECT count(*) FROM points_collecte WHERE attributs ? '$F_REM'")"
chk "un lot dont UN point est introuvable n'écrit rien" "404|0" \
    "$(req POST /points/lot "{\"pointIds\":$(python3 -c "import json;l=open('$T/points').read().split()[5:8];print(json.dumps(l+['00000000-0000-4000-8000-000000000000']))"),\"attributs\":{\"$F_REM\":\"vu\"}}")|$(sql "SELECT count(*) FROM points_collecte WHERE attributs ? '$F_REM'")"
req POST /points/lot "{\"pointIds\":$(ids 5 3),\"attributs\":{\"$F_REM\":\"Rue étroite, 50%_ de pente\",\"$F_ETAT\":\"abîmé\",\"$F_VISITE\":\"2026-10-01\"}}" >/dev/null
chk "le filtre texte cherche « contient », sans casse ni souci d'accent encodé" 3 "$(nb "champId=$F_REM&valeur=%C3%89TROITE")"
chk "« % » et « _ » s'y cherchent tels quels" "3|0" "$(nb "champId=$F_REM&valeur=50%25_")|$(nb "champId=$F_REM&valeur=5_%25")"
chk "le filtre liste et le filtre date" "3|3" "$(nb "champId=$F_ETAT&valeur=ab%C3%AEm%C3%A9")|$(nb "champId=$F_VISITE&valeur=2026-10-01")"
chk "null efface une case" "200|0" \
    "$(req PATCH "/points/$(un 0)" "{\"attributs\":{\"$F_BACS\":null}}")|$(nb "champId=$F_BACS")"
chk "l'écriture entre dans l'historique du circuit" 1 \
    "$(req GET "/circuits/$C_A/historique" >/dev/null; val "1 if any('attributs' in (h.get('changed_fields') or []) for h in d) else 0")"

echo
echo "4. Les étiquettes"
chk "l'étiquette « déchets verts » se crée" 201 "$(req POST "/points/etiquettes?communeId=$COMMUNE" '{"nom":"TEST-J6 Déchets verts","couleur":"vert"}')"
E_DV=$(val "d['id']")
chk "une couleur hors palette est refusée" 400 "$(req POST "/points/etiquettes?communeId=$COMMUNE" '{"nom":"TEST-J6 X","couleur":"fuchsia"}')"
chk "un doublon est refusé" 409 "$(req POST "/points/etiquettes?communeId=$COMMUNE" '{"nom":"test-j6 DÉCHETS VERTS"}')"
req POST "/points/etiquettes?communeId=$COMMUNE" '{"nom":"TEST-J6 Marché","couleur":"ambre"}' >/dev/null
E_MARCHE=$(val "d['id']")
chk "douze points étiquetés d'un coup, sur deux circuits" 200 \
    "$(req POST /points/lot "{\"pointIds\":$(ids 33 12),\"ajouterEtiquettes\":[\"$E_DV\"]}")"
req POST /points/lot "{\"pointIds\":$(ids 40 5),\"ajouterEtiquettes\":[\"$E_MARCHE\",\"$E_DV\"]}" >/dev/null
chk "poser deux fois la même étiquette ne la double pas" 2 \
    "$(sql "SELECT cardinality(etiquettes) FROM points_collecte WHERE id='$(un 40)'")"
chk "filtre « déchets verts » : 12 ; « déchets verts » ET « marché » : 5" "12|5" \
    "$(nb "etiquettes=$E_DV")|$(nb "etiquettes=$E_DV,$E_MARCHE")"
req POST /points/lot "{\"pointIds\":$(ids 33 2),\"retirerEtiquettes\":[\"$E_DV\"]}" >/dev/null
chk "en retirer deux laisse dix points" 10 "$(nb "etiquettes=$E_DV")"
chk "le compteur de l'étiquette le dit" 10 \
    "$(req GET "/points/etiquettes?communeId=$COMMUNE" >/dev/null; val "next(e['nb_points'] for e in d if e['id']=='$E_DV')")"
chk "étiquette et champ se combinent" 5 "$(nb "etiquettes=$E_DV&champId=$F_ACCES&valeur=oui")"
curl -s -o "$T/e.csv" -H "Authorization: Bearer $T_DIR" "$API/circuits/points?communeId=$COMMUNE&etiquettes=$E_MARCHE&format=csv"
chk "l'export écrit les étiquettes par leur nom" 5 \
    "$(python3 -c "print(sum(1 for l in open('$T/e.csv',encoding='utf-8-sig') if 'TEST-J6 Marché' in l and 'TEST-J6 Déchets verts' in l))")"

echo
echo "5. Une action planifiée sur la sélection"
chk "une fin avant le début est refusée" 400 \
    "$(req POST /points/actions "{\"titre\":\"TEST-J6 X\",\"datePrevue\":\"$(jour 7)\",\"dateFin\":\"$(jour 5)\",\"pointIds\":$(ids 35 1)}")"
chk "la campagne « déchets verts » est planifiée sur les dix points" "201|10|0|planifiee" \
    "$(req POST "/points/actions?communeId=$COMMUNE" "{\"titre\":\"TEST-J6 Campagne déchets verts\",\"datePrevue\":\"$(jour 7)\",\"responsable\":\"Équipe verte\",\"pointIds\":$(ids 35 10)}")|$(val "d['nb_points']")|$(val "d['nb_faits']")|$(val "d['etat']")"
A_DV=$(val "d['id']")
chk "le filtre « action » rend ses points" 10 "$(nb "actionId=$A_DV")"
chk "quatre points pointés « faits »" "200|4" \
    "$(req POST "/points/actions/$A_DV/avancement" "{\"pointIds\":$(ids 35 4),\"fait\":true}")|$(val "d['nb_faits']")"
chk "le détail dit qui et quand" "4|4" \
    "$(req GET "/points/actions/$A_DV" >/dev/null; val "sum(1 for p in d['points'] if p['fait_le'])")|$(val "sum(1 for p in d['points'] if p['fait_par'])")"
chk "un point hors de l'action donne 404, et rien n'est pointé" "404|4" \
    "$(req POST "/points/actions/$A_DV/avancement" "{\"pointIds\":$(ids 0 2),\"fait\":true}")|$(req GET "/points/actions/$A_DV" >/dev/null; val "d['nb_faits']")"
chk "dé-pointer un point" 3 \
    "$(req POST "/points/actions/$A_DV/avancement" "{\"pointIds\":$(ids 35 1),\"fait\":false}" >/dev/null; val "d['nb_faits']")"
chk "ajouter deux points et en retirer un : onze" 11 \
    "$(req POST "/points/actions/$A_DV/points" "{\"ajouter\":$(ids 0 2),\"retirer\":$(ids 44 1)}" >/dev/null; val "d['nb_points']")"
chk "une étiquette posée ensuite n'agrandit pas l'action" 11 \
    "$(req POST /points/lot "{\"pointIds\":$(ids 20 3),\"ajouterEtiquettes\":[\"$E_DV\"]}" >/dev/null; nb "actionId=$A_DV")"
req POST "/points/actions?communeId=$COMMUNE" "{\"titre\":\"TEST-J6 Remplacement de bacs\",\"datePrevue\":\"$(jour -3)\",\"pointIds\":$(ids 5 3)}" >/dev/null
A_BACS=$(val "d['id']")
chk "une action planifiée dont la date est passée est « en retard »" "en_retard" "$(val "d['etat']")"
chk "terminée, elle porte sa date de fin" "200|terminee|1" \
    "$(req PATCH "/points/actions/$A_BACS" '{"statut":"terminee"}')|$(val "d['etat']")|$(val "1 if d['terminee_le'] else 0")"
req GET "/points/actions?communeId=$COMMUNE" >/dev/null
chk "la liste met les actions planifiées d'abord" "TEST-J6 Campagne déchets verts" \
    "$(val "[a['titre'] for a in d if a['titre'].startswith('TEST-J6')][0]")"

echo
echo "6. Le champ évolue sans rien perdre"
chk "son type ne change pas" 400 "$(req PATCH "/points/champs/$F_ACCES" '{"type":"texte"}')"
chk "renommé, il garde ses trente valeurs" "200|30" \
    "$(req PATCH "/points/champs/$F_ACCES" '{"libelle":"TEST-J6 Accès poids lourd"}')|$(nb "champId=$F_ACCES&valeur=non")"
chk "un choix encore utilisé ne se retire pas" 409 "$(req PATCH "/points/champs/$F_ETAT" '{"options":["bon","absent"]}')"
chk "un choix inutilisé, si" "200|bon,abîmé" \
    "$(req PATCH "/points/champs/$F_ETAT" '{"options":["bon","abîmé"]}')|$(val "','.join(d['options'])")"
chk "le compteur de points renseignés" 40 \
    "$(req GET "/points/champs?communeId=$COMMUNE" >/dev/null; val "next(c['nb_renseignes'] for c in d if c['id']=='$F_ACCES')")"

echo
echo "7. Cloisonnement"
AUTRE_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id <> '$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
if [ -n "$AUTRE_EMAIL" ]; then
  T_AUTRE=$(tok "$AUTRE_EMAIL")
  AUTRE_COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$AUTRE_EMAIL'")
  req GET "/points/champs?communeId=$COMMUNE" "" "$T_AUTRE" >/dev/null
  chk "une autre commune ne voit pas ces champs" 0 "$(val "sum(1 for c in d if c['libelle'].startswith('TEST-J6'))")"
  chk "ni ne les modifie (404, jamais 403)" 404 "$(req PATCH "/points/champs/$F_ACCES" '{"libelle":"pirate"}' "$T_AUTRE")"
  chk "ni ne retire une étiquette" 404 "$(req DELETE "/points/etiquettes/$E_DV" "" "$T_AUTRE")"
  chk "ni ne lit une action" 404 "$(req GET "/points/actions/$A_DV" "" "$T_AUTRE")"
  chk "ni ne renseigne ces points" 404 "$(req POST /points/lot "{\"pointIds\":$(ids 0 2),\"attributs\":{}}" "$T_AUTRE")"
  chk "ni ne planifie d'action sur eux" 404 \
      "$(req POST /points/actions "{\"titre\":\"TEST-J6 Pirate\",\"datePrevue\":\"$(jour 1)\",\"pointIds\":$(ids 0 2)}" "$T_AUTRE")"
  req POST "/points/etiquettes?communeId=$AUTRE_COMMUNE" '{"nom":"TEST-J6 Étrangère"}' "$T_AUTRE" >/dev/null
  E_AUTRE=$(val "d['id']")
  chk "l'étiquette d'une autre commune ne se pose pas" 400 \
      "$(req POST /points/lot "{\"pointIds\":$(ids 0 1),\"ajouterEtiquettes\":[\"$E_AUTRE\"]}")"
  chk "ni ne se filtre" 400 "$(nb "etiquettes=$E_AUTRE" >/dev/null; req GET "/circuits/points?communeId=$COMMUNE&etiquettes=$E_AUTRE")"
  chk "même en SQL direct, la base refuse l'étiquette d'une autre commune" 1 \
      "$($PSQL -c "UPDATE points_collecte SET etiquettes = ARRAY['$E_AUTRE']::uuid[] WHERE id = '$(un 0)'" 2>&1 | grep -c ETIQUETTE_AUTRE_COMMUNE)"
  chk "et le rattachement d'un point à l'action d'une autre commune" 1 \
      "$($PSQL -c "INSERT INTO actions_points (action_id, point_id, commune_id) VALUES ('$A_DV', '$(un 0)', '$AUTRE_COMMUNE')" 2>&1 | grep -c ACTION_AUTRE_COMMUNE)"
fi
PREST_EMAIL=$(sql "SELECT email FROM users WHERE role='gestionnaire_prestataire' AND deleted_at IS NULL AND is_active ORDER BY created_at LIMIT 1")
if [ -n "$PREST_EMAIL" ]; then
  T_PREST=$(tok "$PREST_EMAIL")
  chk "un prestataire ne crée pas de champ" 403 "$(req POST "/points/champs?communeId=$COMMUNE" '{"libelle":"TEST-J6 P","type":"texte"}' "$T_PREST")"
  chk "ni ne lit les actions de la commune" 403 "$(req GET "/points/actions?communeId=$COMMUNE" "" "$T_PREST")"
fi

echo
echo "8. Retirer sans effacer"
chk "l'étiquette « marché » se retire" 204 "$(req DELETE "/points/etiquettes/$E_MARCHE")"
chk "elle n'est plus rendue sur les points" 0 \
    "$(req GET "/circuits/$C_B/points" >/dev/null; val "sum(1 for p in d if '$E_MARCHE' in p['etiquettes'])")"
chk "ni filtrable" 400 "$(req GET "/circuits/points?communeId=$COMMUNE&etiquettes=$E_MARCHE")"
chk "mais reste inscrite en base, pour l'historique" 5 "$(sql "SELECT count(*) FROM points_collecte WHERE '$E_MARCHE' = ANY(etiquettes)")"
chk "le champ « remarque » se retire" 204 "$(req DELETE "/points/champs/$F_REM")"
chk "l'export n'en a plus la colonne" 0 \
    "$(curl -s -H "Authorization: Bearer $T_DIR" "$API/circuits/points?communeId=$COMMUNE&circuitId=$C_A&format=csv" | head -1 | grep -c 'TEST-J6 Remarque')"
chk "ses valeurs restent sur les points" 3 "$(sql "SELECT count(*) FROM points_collecte WHERE attributs ? '$F_REM'")"
chk "l'action se retire" "204|404" "$(req DELETE "/points/actions/$A_BACS")|$(req GET "/points/actions/$A_BACS")"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
