#!/usr/bin/env bash
# =============================================================================
# Lot 17.1 — les paramètres communaux étendus (migration 061).
#
# Elle commence par ce que la plateforme REFUSE : une population ou une
# production théorique sans sa source ; une saison sans ses mois, ou des mois
# sans population ; un mois 13 ; une population de saison inférieure à la
# population permanente qu'elle comprend ; une production théorique nulle ou
# absurde ; l'admin d'une autre commune. Puis la règle du lot, recalculée à la
# main : en juillet, le ratio kg/hab/jour sur la population présente diffère
# de celui sur la population permanente, et c'est lui qui est retenu ; la
# saison peut chevaucher l'année ; sans population, pas de ratio — jamais 0.
#
# Une commune de test (recensement : 8 000 habitants), quatre mois de pesées
# de l'an dernier ; effacée en partant.
#
#   docker compose exec -T api npm run test:parametres-communaux
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
# 1 si l'erreur attendue figure dans le message, 0 sinon.
refus() { $PSQL -c "$1" >"$T/err.txt" 2>&1; if grep -q "$2" "$T/err.txt"; then echo 1; else echo 0; fi; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
appel() { # méthode chemin jeton [corps] -> code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3" \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}

T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
DIR_A=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire AND commune_id IS NOT NULL ORDER BY created_at LIMIT 1")
ID_A=$(sql "SELECT id FROM users WHERE email='$DIR_A'")
TC=test_parametres_171

nettoyer() { $PSQL -c "DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1; }
nettoyer
J=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date")
A1=$(( ${J:0:4} - 1 ))
# Recensement : 8 000. Pesées de l'an dernier, chaque mois de 31 jours :
# janvier 31 t, mars 31 t, juillet 186 t, octobre 31 t.
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune saison', 'TEST', 'TEST', 8000);
          INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$ID_A', '$TC');
          INSERT INTO pesees (commune_id, date_pesee, poids_net_kg, vehicule_immat, observation) VALUES
            ('$TC', '$A1-01-12', 31000, 'TEST 171', 'TEST apport'),
            ('$TC', '$A1-03-12', 31000, 'TEST 171', 'TEST apport'),
            ('$TC', '$A1-07-05', 93000, 'TEST 171', 'TEST apport'),
            ('$TC', '$A1-07-20', 93000, 'TEST 171', 'TEST apport'),
            ('$TC', '$A1-10-12', 31000, 'TEST 171', 'TEST apport');" >/dev/null
T_A=$(tok "$DIR_A")
DIR_B=$(sql "SELECT u.email FROM users u WHERE u.role='admin_commune' AND u.deleted_at IS NULL AND u.is_active AND NOT u.mot_de_passe_provisoire AND u.email <> '$DIR_A' AND u.commune_id <> '$TC' AND NOT EXISTS (SELECT 1 FROM utilisateur_communes x WHERE x.user_id = u.id AND x.commune_id = '$TC') ORDER BY u.created_at LIMIT 1")
T_B=$(tok "$DIR_B")
population() { # corps JSON complet
  appel PUT "/communes/$TC/population" "${2:-$T_A}" "$1"
}
corps() { # permanente source saison debut fin theorique source (null pour vide)
  printf '{"populationPermanente":%s,"populationPermanenteSource":%s,"populationSaisonniere":%s,"saisonDebutMois":%s,"saisonFinMois":%s,"productionTheoriqueKgHabJ":%s,"productionTheoriqueSource":%s}' "$@"
}
mois() { val "[m for m in d if m['mois']==$1][0]['$2']"; }
production() { appel GET "/pesees/production-specifique?communeId=$TC&annee=$A1" "${1:-$T_A}"; }

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme refuse"
chk "une population permanente sans sa source : refusée" 400 "$(population "$(corps 10000 null null null null null null)")"
chk "… et refusée par la base" 1 \
    "$(refus "INSERT INTO parametres_commune (commune_id, population_permanente) VALUES ('$TC', 10000);" parametres_population_permanente)"
chk "une population de saison sans ses mois : refusée" 400 "$(population "$(corps null null 30000 null null null null)")"
chk "… et refusée par la base" 1 \
    "$(refus "INSERT INTO parametres_commune (commune_id, saison_debut_mois, saison_fin_mois) VALUES ('$TC', 6, 9);" parametres_saison_complete)"
chk "un mois 13 : refusé" 400 "$(population "$(corps null null 30000 6 13 null null)")"
chk "une population de saison inférieure au recensement (8 000) qu'elle comprend : refusée" 400 \
    "$(population "$(corps null null 5000 6 9 null null)")"
chk "… et refusée par la base" 1 \
    "$(refus "INSERT INTO parametres_commune (commune_id, population_saisonniere, saison_debut_mois, saison_fin_mois) VALUES ('$TC', 5000, 6, 9);" PARAMETRES_SAISON)"
chk "une production théorique nulle : refusée" 400 "$(population "$(corps null null null null null 0 '"TEST"')")"
chk "une production théorique de 7 kg/hab/jour : refusée" 400 "$(population "$(corps null null null null null 7 '"TEST"')")"
chk "une production théorique sans sa source : refusée" 400 "$(population "$(corps null null null null null 0.25 null)")"
chk "… et refusée par la base" 1 \
    "$(refus "INSERT INTO parametres_commune (commune_id, production_theorique_kg_hab_j) VALUES ('$TC', 0.25);" parametres_production_theorique)"
chk "l'admin d'une autre commune ne règle pas ces paramètres" 403 "$(population "$(corps 10000 '"TEST"' null null null null null)" "$T_B")"

# -----------------------------------------------------------------------------
echo
echo "2. Sans réglage : le recensement, dit comme tel ; aucune saison inventée"
# Mars : 31 000 kg / 8 000 hab / 31 j = 0,125 kg/hab/jour.
CODE=$(production)
chk "mars : 0,125 kg/hab/jour sur le recensement" "200|0.125|recensement|8000" \
    "$CODE|$(mois 3 kg_hab_j_permanente)|$(mois 3 source_population)|$(mois 3 population_permanente)"
chk "aucune population de saison déclarée : aucun mois n'est « de saison »" "False|None|None" \
    "$(mois 7 en_saison)|$(mois 7 kg_hab_j_saison)|$(mois 7 population_saisonniere)"
chk "aucun repère théorique : aucun écart (null, pas 0)" "None|None" "$(mois 3 production_theorique)|$(mois 3 ecart_theorique_pct)"
chk "un mois sans pesée n'a pas de ligne" 4 "$(val "len(d)")"

# -----------------------------------------------------------------------------
echo
echo "3. La population présente en saison change le ratio, et l'écran le dit"
CODE=$(population "$(corps 10000 '"TEST estimation communale"' null null null null null)")
chk "la commune retient 10 000 habitants permanents, avec leur source" "200|10000|8000" \
    "$CODE|$(val "d['population_permanente']")|$(val "d['population_recensement']")"
production >/dev/null
chk "mars : 0,100 kg/hab/jour sur la population déclarée" "0.1|declaree" "$(mois 3 kg_hab_j_permanente)|$(mois 3 source_population)"
chk "une saison de 9 000 personnes, sous les 10 000 permanents déclarés : refusée" 400 \
    "$(population "$(corps 10000 '"TEST estimation communale"' 9000 6 9 null null)")"
CODE=$(population "$(corps 10000 '"TEST estimation communale"' 30000 6 9 0.25 '"TEST PCGD"')")
chk "saison de juin à septembre, 30 000 personnes présentes ; repère 0,25 kg/hab/jour" "200|30000|6|9|0.25" \
    "$CODE|$(val "d['population_saisonniere']")|$(val "d['saison_debut_mois']")|$(val "d['saison_fin_mois']")|$(val "d['production_theorique_kg_hab_j']")"
production >/dev/null
# Juillet : 186 000 kg / 31 j = 6 000 kg/jour → 0,600 sur 10 000, 0,200 sur 30 000.
chk "juillet : 0,600 kg/hab/jour sur les permanents, 0,200 sur la population présente" "True|0.6|0.2" \
    "$(mois 7 en_saison)|$(mois 7 kg_hab_j_permanente)|$(mois 7 kg_hab_j_saison)"
chk "… le ratio retenu est celui de la saison, et son écart au repère : −20,0 %" "0.2|-20" \
    "$(mois 7 kg_hab_j_retenu)|$(mois 7 ecart_theorique_pct)"
chk "mars, hors saison : 0,100 retenu, −60,0 % du repère" "False|0.1|-60" \
    "$(mois 3 en_saison)|$(mois 3 kg_hab_j_retenu)|$(mois 3 ecart_theorique_pct)"
chk "octobre, juste après la saison, n'en est pas" False "$(mois 10 en_saison)"

CODE=$(population "$(corps 10000 '"TEST estimation communale"' 30000 11 2 0.25 '"TEST PCGD"')")
production >/dev/null
# Janvier : 31 000 kg / 30 000 / 31 = 0,033.
chk "une saison de novembre à février chevauche l'année : janvier en est" "200|True|0.033" \
    "$CODE|$(mois 1 en_saison)|$(mois 1 kg_hab_j_saison)"
chk "… juillet n'en est plus : 0,600 retenu, +140,0 % du repère" "False|0.6|140" \
    "$(mois 7 en_saison)|$(mois 7 kg_hab_j_retenu)|$(mois 7 ecart_theorique_pct)"

CODE=$(population "$(corps null null null null null null null)")
production >/dev/null
chk "tout effacé : retour au recensement, plus de saison ni de repère" "200|0.125|recensement|False|None" \
    "$CODE|$(mois 3 kg_hab_j_permanente)|$(mois 3 source_population)|$(mois 7 en_saison)|$(mois 3 ecart_theorique_pct)"
$PSQL -c "UPDATE communes SET population = 0 WHERE id = '$TC';" >/dev/null
production >/dev/null
chk "aucune population connue : le tonnage reste, le ratio est null — jamais 0" "31|None|None|None" \
    "$(mois 3 tonnes)|$(mois 3 kg_hab_j_permanente)|$(mois 3 kg_hab_j_retenu)|$(mois 3 source_population)"
CODE=$(production "$T_B")
chk "l'admin d'une autre commune ne lit rien de cette commune" "200|0" "$CODE|$(val "len(d)")"

nettoyer
chk "la commune de test, ses pesées et ses paramètres sont retirés" "0|0" \
    "$(sql "SELECT (SELECT count(*) FROM communes WHERE id='$TC')||'|'||(SELECT count(*) FROM parametres_commune WHERE commune_id='$TC')")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
