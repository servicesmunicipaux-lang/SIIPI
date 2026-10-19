#!/usr/bin/env bash
# =============================================================================
# Test du portail national (migration 016).
#
# Vérifie que les agrégats sont justes, que le statut de déploiement reflète
# l'usage réel et non l'installation, et que les moyennes sont bien pondérées
# par la population.
#
# ELLE BÂTIT L'ACTIVITÉ QU'ELLE CONTRÔLE (JC-012). Jusqu'à la v0.15.51, « les
# communes où l'on a travaillé sont actives » se vérifiait sur n'importe quelle
# commune active — en pratique La Marsa, rendue active par les écritures que
# d'autres campagnes y faisaient avec son compte de démonstration ; et la
# provenance des données se qualifiait sur la fiche de La Marsa. Elle bâtit
# désormais deux communes de test : l'une où son directeur temporaire écrit
# (elle doit être active), l'autre où seule la FNCT écrit (elle ne doit pas
# l'être). Elle prouve, pendant qu'elle a ses lignes en base puis en partant,
# qu'aucune commune réelle n'a reçu de ligne (tests/outils/base_reelle.sh).
#
#   docker compose run --rm api npm run test:observatoire
#
# Note : l'API limite les connexions à 20 par quart d'heure et par adresse IP.
# Pour enchaîner les campagnes, démarrer l'API avec AUTH_RATE_LIMIT_MAX=200.
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql() { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
py()  { python3 -c "$1"; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

ACTIVE=test_observatoire_active
FNCT_SEULE=test_observatoire_fnct
ESSAI="'$ACTIVE','$FNCT_SEULE'"
. "$(dirname "$0")/outils/comptes_temporaires.sh"
. "$(dirname "$0")/outils/base_reelle.sh"
nettoyer() {
  $PSQL -c "DELETE FROM audit_log WHERE commune_id IN ($ESSAI);" \
        -c "DELETE FROM access_log WHERE commune_id IN ($ESSAI);" >/dev/null 2>&1
  retirer_comptes_temporaires
  $PSQL -c "DELETE FROM communes WHERE id IN ($ESSAI);" >/dev/null 2>&1
}
nettoyer
trap nettoyer EXIT
releve_base_reelle

T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }

# Les agrégats nationaux sont lus AVANT que la campagne ne pose ses communes de
# test : ce sont ceux des 350 communes réelles.
curl -s "$API/observatoire/gouvernorats" -H "Authorization: Bearer $T_FNCT" -o /tmp/siipi_gouv.json
curl -s "$API/observatoire/deploiement"  -H "Authorization: Bearer $T_FNCT" -o /tmp/siipi_depl.json
N_COMMUNES=$(sql "SELECT count(*) FROM communes WHERE deleted_at IS NULL")

echo
echo "1. Agrégats par gouvernorat"
chk "les 24 gouvernorats sont couverts" 24 \
    "$(py "import json;print(len(json.load(open('/tmp/siipi_gouv.json'))))")"
chk "le total des communes fait bien 350" 350 \
    "$(py "import json;print(sum(g['communes'] for g in json.load(open('/tmp/siipi_gouv.json'))))")"
# Une commune retirée du référentiel (D-FNCT-3, Zarzouna) reste en base mais
# hors de l'API : le témoin compte ce que la politique de lecture laisse voir.
chk "la population totale correspond à la base" "$(sql "SELECT sum(population) FROM communes WHERE deleted_at IS NULL")" \
    "$(py "import json;print(sum(g['population'] for g in json.load(open('/tmp/siipi_gouv.json'))))")"
chk "les entiers arrivent comme nombres, pas comme texte" "int" \
    "$(py "import json;print(type(json.load(open('/tmp/siipi_gouv.json'))[0]['population']).__name__)")"
# Les décimaux aussi : NUMERIC traverse JSON en chaîne, ce qui casse le tri et
# les additions côté interface sans lever la moindre erreur.
chk "les décimaux arrivent comme nombres, pas comme texte" "f" \
    "$(py "import json;d=json.load(open('/tmp/siipi_gouv.json'));print('f' if all(isinstance(g['taux_collecte'],(int,float)) or g['taux_collecte'] is None for g in d) else 'chaine')")"

echo
echo "2. Moyennes pondérées par la population"
# Une moyenne arithmétique et une moyenne pondérée ne coïncident que par hasard :
# si elles sont égales partout, c'est que la pondération n'est pas appliquée.
ARITH=$(sql "SELECT round(avg(collection_rate)::numeric,1) FROM communes WHERE gouvernorat='Tunis'")
PONDEREE=$(py "import json;print(next(g['taux_collecte'] for g in json.load(open('/tmp/siipi_gouv.json')) if g['gouvernorat']=='Tunis'))")
chk "le taux de collecte de Tunis n'est pas une moyenne arithmétique" "different" \
    "$([ "$ARITH" != "$PONDEREE" ] && echo different || echo identique)"
chk "le taux pondéré reste dans une plage plausible" "t" \
    "$(py "v=float('$PONDEREE');print('t' if 50 < v < 100 else 'f')")"

echo
echo "3. Statut de déploiement"
chk "les 350 communes ont un statut" 350 \
    "$(py "import json;print(len(json.load(open('/tmp/siipi_depl.json'))))")"
chk "l'installation ne rend pas toutes les communes actives" "t" \
    "$(py "import json;d=json.load(open('/tmp/siipi_depl.json'));print('t' if sum(1 for c in d if c['statut']=='active') < 350 else 'f')")"
chk "le total des statuts par gouvernorat retombe sur 350" 350 \
    "$(py "import json;d=json.load(open('/tmp/siipi_gouv.json'));print(sum(g['communes_actives']+g['communes_incompletes']+g['communes_desactivees'] for g in d))")"
chk "toutes les communes sont « estimé » par défaut" "$N_COMMUNES" \
    "$(py "import json;print(sum(g['communes_donnees_estimees'] for g in json.load(open('/tmp/siipi_gouv.json'))))")"

# Les deux communes de test : l'une où sa commune écrit, l'autre où seule la FNCT écrit.
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES
            ('$ACTIVE', 'TEST commune active de l''observatoire', 'TEST', 'TEST', 5000),
            ('$FNCT_SEULE', 'TEST commune de l''observatoire, FNCT seule', 'TEST', 'TEST', 5000);" >/dev/null
compte_temporaire admin_commune "$ACTIVE" "Directeur de l'observatoire"
T_DIR=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_DIR" ] || { echo "Le directeur temporaire ne se connecte pas." >&2; exit 1; }
statut() { curl -s "$API/observatoire/deploiement" -H "Authorization: Bearer $T_FNCT" \
             | python3 -c "import sys,json;print(next((c['statut'] for c in json.load(sys.stdin) if c.get('id', c.get('commune_id'))=='$1'), 'absente'))" 2>/dev/null; }

echo
echo "3 bis. Le statut suit l'usage réel, bâti par la campagne"
chk "avant toute écriture, les deux communes de test sont « incomplete »" "incomplete|incomplete" "$(statut "$ACTIVE")|$(statut "$FNCT_SEULE")"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/communes/$ACTIVE" -H "Authorization: Bearer $T_DIR" \
  -H 'Content-Type: application/json' -d '{"notes":"TEST saisie de la commune"}')
chk "la commune écrit sur sa fiche" 200 "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/communes/$FNCT_SEULE" -H "Authorization: Bearer $T_FNCT" \
  -H 'Content-Type: application/json' -d '{"notes":"TEST saisie de la FNCT"}')
chk "la FNCT écrit sur la fiche de l'autre" 200 "$CODE"
chk "la commune où l'on a travaillé est active" "active" "$(statut "$ACTIVE")"
chk "une écriture de la FNCT ne rend pas une commune active" "incomplete" "$(statut "$FNCT_SEULE")"

echo
echo "4. Provenance des données"
CODE=$(curl -s -o /tmp/b.json -w '%{http_code}' -X PATCH "$API/observatoire/communes/$ACTIVE/provenance" \
  -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' -d '{"donneesSource":"declare"}')
chk "la FNCT peut qualifier la provenance d'une commune" 200 "$CODE"
chk "la qualification est enregistrée" "declare" "$(sql "SELECT donnees_source FROM communes WHERE id='$ACTIVE'")"
chk "l'auteur de la qualification est tracé" "t" \
    "$(sql "SELECT donnees_qualifiees_par IS NOT NULL FROM communes WHERE id='$ACTIVE'")"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/observatoire/communes/$FNCT_SEULE/provenance" \
  -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' -d '{"donneesSource":"mesure"}')
chk "une commune ne peut pas qualifier les données d'une autre" "t" \
    "$([ "$CODE" != "200" ] && echo t || echo f)"

echo
echo "5. Accès"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/observatoire/gouvernorats")
chk "le tableau de bord est refusé sans jeton" 401 "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/observatoire/gouvernorats" -H "Authorization: Bearer $T_DIR")
chk "une commune peut comparer les gouvernorats (émulation)" 200 "$CODE"

echo
echo "6. Aucune commune réelle n'a reçu de ligne (JC-012)"
base_reelle_intacte "pendant la campagne"
nettoyer
chk "ses communes de test et son directeur sont effacés" "0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
