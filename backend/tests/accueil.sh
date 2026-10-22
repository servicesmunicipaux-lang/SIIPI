#!/usr/bin/env bash
# =============================================================================
# Jalon D, lot D2 — l'accueil du portail communal (GET /communes/{id}/accueil).
# docs/specs_metier/SPEC_D_pret_a_presenter.md, D2.
#
# L'écran d'arrivée du directeur : ce qui va bien, ce qui demande une action, et
# où il en est du constat du jour. Rien n'y est recalculé : la route réunit les
# indicateurs des 5 axes, les registres de « Ma commune dans SIIPI », les écarts
# de « À vérifier » et les entretiens dus.
#
# Elle commence par ce que la plateforme REFUSE : une lecture sans compte, par un
# citoyen ou un prestataire, par le directeur d'une autre commune (introuvable,
# jamais « refusé » : un refus renseignerait sur l'existence), d'une commune
# qui n'existe pas. Puis ce que l'écran ne doit JAMAIS dire : un total, un
# pourcentage, un zéro à la place d'une donnée absente, un indicateur « au-dessus
# de l'objectif » sans objectif atteint, un indicateur non renseigné rangé parmi
# ce qui va bien. Enfin le parcours : une commune vide, puis alimentée — circuits
# attendus et constat posé, déclarations (objectif atteint ou non), entretien en
# retard, écart bloquant.
#
# Tout se passe dans deux communes de test, avec des comptes temporaires ; la
# campagne prouve en partant qu'aucune commune réelle n'a reçu de ligne.
#
#   docker compose exec -T api npm run test:accueil
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
# req <méthode> <chemin> [corps] [jeton] : le code HTTP, la réponse dans $T/r.json.
req() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" ${4:+-H "Authorization: Bearer $4"} \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}
jour() { date -u -d "$1 days" +%Y-%m-%d; }

A=test_accueil_a   # la commune qui n'a rien saisi
B=test_accueil_b   # la commune alimentée
ESSAI_C="'$A','$B'"
. tests/outils/comptes_temporaires.sh
. tests/outils/communes_essai.sh
. tests/outils/base_reelle.sh
nettoyer_c() {
  effacer_communes_essai "$ESSAI_C"
  retirer_comptes_temporaires
  effacer_communes_essai "$ESSAI_C"
}
nettoyer_c
trap 'nettoyer_c; rm -rf "$T"' EXIT
releve_base_reelle

commune_essai "$A" "TEST Commune A de l'accueil"
commune_essai "$B" "TEST Commune B de l'accueil"
compte_temporaire admin_commune "$A" "Directeur A de l'accueil"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$B" "Directeur B de l'accueil"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire gestionnaire_prestataire "$A" "Prestataire de l'accueil"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire citoyen "$A" "Citoyen de l'accueil"; T_C=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire super_admin_fnct "" "Agent FNCT de l'accueil"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_P" ] && [ -n "$T_C" ] && [ -n "$T_F" ] \
  || { echo "API injoignable sur $API, ou comptes temporaires refusés" >&2; exit 1; }

# Le jour à Tunis, et le jour de la semaine (1 = lundi … 7 = dimanche), lus en base : règle 1.3.
JOUR=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date")
ISODOW=$(sql "SELECT extract(isodow FROM (now() AT TIME ZONE 'Africa/Tunis'))::int")
AUTRE_JOUR=$((ISODOW % 7 + 1))
AN=${JOUR%%-*}

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme REFUSE"
chk "sans compte : 401" 401 "$(req GET "/communes/$A/accueil")"
chk "un citoyen n'a pas l'accueil d'une commune : 403" 403 "$(req GET "/communes/$A/accueil" "" "$T_C")"
chk "un prestataire non plus : 403" 403 "$(req GET "/communes/$A/accueil" "" "$T_P")"
chk "le directeur de B ne lit pas l'accueil de A : 404, pas 403 (un refus révélerait son existence)" 404 \
    "$(req GET "/communes/$A/accueil" "" "$T_B")"
chk "le directeur de A ne lit pas celui de B : 404" 404 "$(req GET "/communes/$B/accueil" "" "$T_A")"
chk "une commune qui n'existe pas : 404" 404 "$(req GET "/communes/test_accueil_inconnue/accueil" "" "$T_F")"

# -----------------------------------------------------------------------------
echo
echo "2. Une commune qui n'a rien saisi : pas de tableau de zéros"
chk "le directeur de A lit son accueil" 200 "$(req GET "/communes/$A/accueil" "" "$T_A")"
chk "elle est dite vide : l'écran ouvre le parcours de démarrage" True "$(val "d['commune_vide']")"
chk "rien ne va bien — ni objectif atteint, ni indicateur calculé, ni registre tenu" "0|0|0" \
    "$(val "'|'.join(str(len(d['va_bien'][k])) for k in ('objectif_atteint','calcules','registres'))")"
chk "aucun entretien, aucun écart, aucun circuit attendu" "0|0|0|0" \
    "$(val "'|'.join(map(str,(len(d['a_agir']['entretiens']),len(d['a_agir']['a_verifier']),d['constat']['attendus'],d['constat']['saisis'])))")"
chk "les indicateurs non renseignés sont nommés, pas comptés à zéro" True "$(val "len(d['a_agir']['non_renseignes']) > 0")"
chk "la réponse porte le jour de Tunis" "$JOUR" "$(val "d['jour']")"
chk "et ne porte ni total, ni pourcentage, ni note" "a_agir|annee|commune_vide|constat|jour|va_bien" \
    "$(val "'|'.join(sorted(d.keys()))")"
chk "la FNCT lit l'accueil de A, comme le directeur" "200|True" "$(req GET "/communes/$A/accueil" "" "$T_F")|$(val "d['commune_vide']")"

# -----------------------------------------------------------------------------
echo
echo "3. Le constat du jour : les circuits attendus aujourd'hui, et ceux dont le constat est posé"
C1=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage, actif) VALUES ('$B', 'TEST accueil circuit du jour', ARRAY[$ISODOW]::smallint[], true) RETURNING id")
$PSQL -c "INSERT INTO circuits (commune_id, nom, jours_passage, actif) VALUES ('$B', 'TEST accueil circuit d un autre jour', ARRAY[$AUTRE_JOUR]::smallint[], true);" >/dev/null
$PSQL -c "INSERT INTO circuits (commune_id, nom, jours_passage, actif) VALUES ('$B', 'TEST accueil circuit inactif', ARRAY[$ISODOW]::smallint[], false);" >/dev/null
req GET "/communes/$B/accueil" "" "$T_B" >/dev/null
chk "un seul circuit est attendu : ni celui d'un autre jour, ni l'inactif" "1|0" "$(val "str(d['constat']['attendus'])+'|'+str(d['constat']['saisis'])")"
chk "la commune n'est plus vide dès qu'elle a un circuit" False "$(val "d['commune_vide']")"
$PSQL -c "INSERT INTO controles_terrain (circuit_id, commune_id, date_controle, etat) VALUES ('$C1', '$B', '$JOUR', 'fait');" >/dev/null
req GET "/communes/$B/accueil" "" "$T_B" >/dev/null
chk "le constat posé : 1 saisi sur 1 attendu" "1|1" "$(val "str(d['constat']['attendus'])+'|'+str(d['constat']['saisis'])")"
chk "et le registre des contrôles du mois est tenu — il va bien" True "$(val "'controles' in [r['code'] for r in d['va_bien']['registres']]")"
chk "un registre jamais tenu n'y figure pas (pas de pesée, pas de zéro)" False "$(val "'pesees' in [r['code'] for r in d['va_bien']['registres']]")"

# -----------------------------------------------------------------------------
echo
echo "4. Les indicateurs : objectif atteint, calculé, ou non renseigné"
DECL="/kpi/declarations/$B/$AN"
chk "la commune déclare trois indicateurs (un taux de 100 %, un taux de 95 %, un ratio à sa cible)" 200 \
    "$(req PUT "$DECL" '{"valeurs":{"M2-1":{"valeur":100},"M2-4":{"valeur":95},"M1-1":{"valeur":30,"cible":30}}}' "$T_B")"
req GET "/communes/$B/accueil" "" "$T_B" >/dev/null
# M1-2 n'est pas déclaré : il est MESURÉ, depuis le constat posé plus haut (tous les circuits du jour faits).
chk "les deux déclarés qui atteignent leur objectif, et l'indicateur mesuré du constat, sont dits atteints" "M1-1|M1-2|M2-1"     "$(val "'|'.join(sorted(i['code'] for i in d['va_bien']['objectif_atteint']))")"
chk "l'indicateur mesuré vient bien du registre, non d'une déclaration" "mesure" "$(val "next(i['source'] for i in d['va_bien']['objectif_atteint'] if i['code'] == 'M1-2')")"
chk "celui à 95 % est calculé, sans être dit atteint" "True|False" \
    "$(val "str('M2-4' in [i['code'] for i in d['va_bien']['calcules']])+'|'+str('M2-4' in [i['code'] for i in d['va_bien']['objectif_atteint']])")"
chk "tout indicateur dit atteint a atteint son objectif (taux 1)" True \
    "$(val "all(i['taux_atteinte'] is not None and i['taux_atteinte'] >= 1 for i in d['va_bien']['objectif_atteint'])")"
chk "tout ce qui va bien porte une valeur et une source — jamais un indicateur sans source" True \
    "$(val "all(i['valeur'] is not None and i['source'] in ('mesure','declare') for i in d['va_bien']['objectif_atteint'] + d['va_bien']['calcules'])")"
chk "un indicateur non déclaré (M3-2) reste « non renseigné »" True "$(val "'M3-2' in [i['code'] for i in d['a_agir']['non_renseignes']]")"
chk "il n'est jamais rangé parmi ce qui va bien" False \
    "$(val "'M3-2' in [i['code'] for i in d['va_bien']['objectif_atteint'] + d['va_bien']['calcules']]")"
chk "un indicateur déclaré sort des non renseignés" False "$(val "'M2-1' in [i['code'] for i in d['a_agir']['non_renseignes']]")"
chk "ce que B a déclaré n'apparaît pas chez A (cloisonnement)" "0|True" \
    "$(req GET "/communes/$A/accueil" "" "$T_A" >/dev/null; val "str(len(d['va_bien']['objectif_atteint'])+len(d['va_bien']['calcules']))+'|'+str(d['commune_vide'])")"

# -----------------------------------------------------------------------------
echo
echo "5. Les entretiens dus"
req POST "/trucks?communeId=$B" '{"registration":"TEST-A 001","type":"benne_tasseuse","etat":"en_service"}' "$T_B" >/dev/null
V1=$(val "d['id']")
req POST "/trucks?communeId=$B" '{"registration":"TEST-A 002","type":"camion","etat":"en_service"}' "$T_B" >/dev/null
V2=$(val "d['id']")
chk "un plan dont l'échéance est passée s'enregistre" 201 \
    "$(req POST /maintenance/plans "{\"vehiculeId\":\"$V1\",\"type\":\"vidange\",\"libelle\":\"Vidange en retard\",\"intervalleJours\":180,\"referenceDate\":\"$(jour -200)\"}" "$T_B")"
chk "un plan à jour s'enregistre" 201 \
    "$(req POST /maintenance/plans "{\"vehiculeId\":\"$V2\",\"type\":\"vidange\",\"libelle\":\"Vidange à jour\",\"intervalleJours\":180,\"referenceDate\":\"$JOUR\"}" "$T_B")"
req GET "/communes/$B/accueil" "" "$T_B" >/dev/null
chk "l'entretien en retard demande une action" "1|en_retard|TEST-A 001" \
    "$(val "str(len(d['a_agir']['entretiens']))+'|'+d['a_agir']['entretiens'][0]['statut']+'|'+d['a_agir']['entretiens'][0]['registration']")"
chk "le plan à jour n'y figure pas : « a_jour » n'a rien à dire" False \
    "$(val "any(e['registration'] == 'TEST-A 002' for e in d['a_agir']['entretiens'])")"

# -----------------------------------------------------------------------------
echo
echo "6. Un écart bloquant : un circuit confié à un engin en panne"
$PSQL -c "UPDATE circuits SET vehicule_id = '$V2' WHERE id = '$C1';" >/dev/null
$PSQL -c "UPDATE vehicules SET etat = 'en_panne', etat_depuis = '$JOUR' WHERE id = '$V2';" >/dev/null
req GET "/communes/$B/accueil" "" "$T_B" >/dev/null
chk "« À vérifier » le dit, bloquant, au domaine des circuits" True \
    "$(val "any(e['gravite'] == 'bloquant' and e['domaine'] == 'circuits' for e in d['a_agir']['a_verifier'])")"
chk "chaque écart dit ce qu'il y a à faire — la plateforme constate, elle ne corrige pas" True \
    "$(val "all(e['quoi_faire'] for e in d['a_agir']['a_verifier'])")"
chk "la même lecture par la FNCT donne le même accueil" "200|True" \
    "$(req GET "/communes/$B/accueil" "" "$T_F")|$(val "any(e['gravite'] == 'bloquant' for e in d['a_agir']['a_verifier'])")"

# -----------------------------------------------------------------------------
echo
echo "Aucune commune réelle n'a reçu de ligne"
base_reelle_intacte "pendant la campagne"
nettoyer_c
chk "ses communes de test et leurs lignes, et ses comptes temporaires, sont effacés" "0|0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM circuits WHERE commune_id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM vehicules WHERE commune_id IN ($ESSAI_C)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs
' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
