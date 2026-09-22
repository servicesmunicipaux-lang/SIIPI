#!/usr/bin/env bash
# =============================================================================
# Test du portail national (migration 016).
#
# Vérifie que les agrégats sont justes, que le statut de déploiement reflète
# l'usage réel et non l'installation, et que les moyennes sont bien pondérées
# par la population.
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
    -d "{\"email\":\"$1\",\"password\":\"Siipi2026!\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql() { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
py()  { python3 -c "$1"; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

T_FNCT=$(tok admin.national@siipi.tn)
T_MARSA=$(tok directeur.marsa@siipi.tn)
[ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }

curl -s "$API/observatoire/gouvernorats" -H "Authorization: Bearer $T_FNCT" -o /tmp/siipi_gouv.json
curl -s "$API/observatoire/deploiement"  -H "Authorization: Bearer $T_FNCT" -o /tmp/siipi_depl.json

echo
echo "1. Agrégats par gouvernorat"
chk "les 24 gouvernorats sont couverts" 24 \
    "$(py "import json;print(len(json.load(open('/tmp/siipi_gouv.json'))))")"
chk "le total des communes fait bien 350" 350 \
    "$(py "import json;print(sum(g['communes'] for g in json.load(open('/tmp/siipi_gouv.json'))))")"
chk "la population totale correspond à la base" "$(sql "SELECT sum(population) FROM communes")" \
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
chk "les communes où l'on a travaillé sont actives" "t" \
    "$(py "import json;d=json.load(open('/tmp/siipi_depl.json'));print('t' if any(c['statut']=='active' for c in d) else 'f')")"
chk "le total des statuts par gouvernorat retombe sur 350" 350 \
    "$(py "import json;d=json.load(open('/tmp/siipi_gouv.json'));print(sum(g['communes_actives']+g['communes_incompletes']+g['communes_desactivees'] for g in d))")"

echo
echo "4. Provenance des données"
chk "toutes les communes sont « estimé » par défaut" "$(sql "SELECT count(*) FROM communes")" \
    "$(py "import json;print(sum(g['communes_donnees_estimees'] for g in json.load(open('/tmp/siipi_gouv.json'))))")"
CODE=$(curl -s -o /tmp/b.json -w '%{http_code}' -X PATCH "$API/observatoire/communes/tunis_la_marsa/provenance" \
  -H "Authorization: Bearer $T_FNCT" -H 'Content-Type: application/json' -d '{"donneesSource":"declare"}')
chk "la FNCT peut qualifier la provenance d'une commune" 200 "$CODE"
chk "la qualification est enregistrée" "declare" "$(sql "SELECT donnees_source FROM communes WHERE id='tunis_la_marsa'")"
chk "l'auteur de la qualification est tracé" "t" \
    "$(sql "SELECT donnees_qualifiees_par IS NOT NULL FROM communes WHERE id='tunis_la_marsa'")"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$API/observatoire/communes/sfax_sfax_ville_medina/provenance" \
  -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' -d '{"donneesSource":"mesure"}')
chk "une commune ne peut pas qualifier les données d'une autre" "t" \
    "$([ "$CODE" != "200" ] && echo t || echo f)"
$PSQL -c "UPDATE communes SET donnees_source='estime', donnees_qualifiees_le=NULL, donnees_qualifiees_par=NULL WHERE id='tunis_la_marsa'" >/dev/null 2>&1

echo
echo "5. Accès"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/observatoire/gouvernorats")
chk "le tableau de bord est refusé sans jeton" 401 "$CODE"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API/observatoire/gouvernorats" -H "Authorization: Bearer $T_MARSA")
chk "une commune peut comparer les gouvernorats (émulation)" 200 "$CODE"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
