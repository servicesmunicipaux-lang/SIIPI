#!/usr/bin/env bash
# =============================================================================
# Lot S1 — le jumeau numérique (FEUILLE_DE_ROUTE.md § 6bis).
#
# Trois mois d'activité simulée dans une commune de démonstration fictive.
# Un jeu simulé qui se confond avec le réel est pire que pas de jeu : la
# campagne commence donc par ce que la plateforme REFUSE — charger ou retirer
# sur une commune réelle, une ligne « simulée » hors démonstration, un compte
# qui n'est pas la FNCT.
#
# Ensuite :
#   - chaque indicateur calculé par la plateforme est comparé à celui que
#     recalcule tests/jumeau_attendus.py, depuis le seul fichier du jeu et la
#     définition de l'indicateur — pas depuis le code testé ;
#   - la commune de démonstration n'apparaît dans aucune vue nationale ;
#   - chaque alerte volontaire du jeu se déclenche, puis s'éteint quand on
#     corrige la donnée ;
#   - le chargement rejoué rend exactement le même état ;
#   - le retrait efface tout, et ne touche à rien d'autre.
#
# Exception assumée (CLAUDE.md § 7) : elle travaille sur sa propre commune de
# démonstration, et la retire en partant.
#
#   docker compose exec -T api npm run test:simulation-3mois
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
RACINE="$(cd "$(dirname "$0")/.." && pwd)"
JEU="$RACINE/seed/data/jumeau_3mois.json"

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"${2:-Siipi2026!}\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
# Une requête qui doit échouer : rend 1 si l'erreur attendue est dans le message.
refus() { $PSQL -c "$1" >"$T/err.txt" 2>&1; grep -c "$2" "$T/err.txt" | head -1; }
fnct() { $PSQL -c "SET app.role = 'super_admin_fnct';" -c "$1" 2>&1; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
jeu() { python3 -c "import json;j=json.load(open('$JEU',encoding='utf-8'));print($1)"; }
appel() { # méthode chemin jeton [corps] -> code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3" \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}

T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
DEMO=$(jeu "j['commune']['id']")
REELLE=$(sql "SELECT id FROM communes WHERE id LIKE '%dar_chaabane%' AND NOT est_demo LIMIT 1")
[ -n "$REELLE" ] || REELLE=$(sql "SELECT id FROM communes WHERE NOT est_demo ORDER BY id LIMIT 1")

# Empreinte d'une commune réelle : elle doit sortir de la campagne intacte.
empreinte_reelle() {
  sql "SELECT (SELECT count(*) FROM pesees WHERE commune_id='$REELLE')||'|'||(SELECT count(*) FROM presences WHERE commune_id='$REELLE')
         ||'|'||(SELECT count(*) FROM circuits WHERE commune_id='$REELLE')||'|'||(SELECT count(*) FROM personnel WHERE commune_id='$REELLE')
         ||'|'||(SELECT count(*) FROM tickets WHERE commune_id='$REELLE')"
}
# Empreinte du jeu chargé : le contenu, sans les identifiants ni les horodatages de chargement.
empreinte_jeu() {
  sql "SELECT md5(
         (SELECT string_agg(date_pesee||':'||voyage||':'||poids_net_kg||':'||type_dechet, ',' ORDER BY date_pesee, circuit_id IS NULL, poids_net_kg, voyage) FROM pesees WHERE commune_id='$DEMO')
      || (SELECT string_agg(jour||':'||present||':'||coalesce(motif_absence,''), ',' ORDER BY jour, present, motif_absence) FROM presences WHERE commune_id='$DEMO')
      || (SELECT string_agg(ticket_number||':'||status||':'||created_at||':'||coalesce(resolved_at::text,''), ',' ORDER BY ticket_number) FROM tickets WHERE commune_id='$DEMO')
      || (SELECT string_agg(id||':'||etat||':'||coalesce(motif_immobilisation,''), ',' ORDER BY id) FROM vehicules WHERE commune_id='$DEMO'))"
}

# Partir d'un état connu : un jeu laissé par un essai précédent est retiré.
appel POST /demo/retirer "$T_FNCT" '{}' >/dev/null
AVANT_REELLE=$(empreinte_reelle)
NB_REELLES=$(sql "SELECT count(*) FROM communes WHERE NOT est_demo")

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme refuse"
CODE=$(appel POST /demo/charger "$T_DIR" '{}')
chk "un compte communal ne charge pas le jeu de démonstration" 403 "$CODE"
CODE=$(appel POST /demo/charger "$T_FNCT" "{\"communeId\":\"$REELLE\"}")
chk "charger le jeu sur une commune réelle : refusé (409)" 409 "$CODE"
chk "… et aucune ligne simulée n'y est entrée" 0 "$(sql "SELECT count(*) FROM pesees WHERE commune_id='$REELLE' AND provenance='simule'")"
CODE=$(appel POST /demo/retirer "$T_FNCT" "{\"communeId\":\"$REELLE\"}")
chk "retirer une commune réelle : refusé (409)" 409 "$CODE"
chk "… et la base le refuse aussi, même à la FNCT" 1 \
    "$(fnct "SELECT app.retirer_jeu_demo('$REELLE');" | grep -c 'commune réelle')"
chk "une pesée « simulée » dans une commune réelle : refusée par la base" 1 \
    "$(refus "INSERT INTO pesees (commune_id, date_pesee, voyage, poids_net_kg, observation, vehicule_immat, provenance)
              VALUES ('$REELLE', '2026-06-01', 1, 1000, 'TEST S1', 'TEST', 'simule');" "pas une commune de démonstration")"
chk "une commune réelle ne devient pas une commune de démonstration" 1 \
    "$(refus "UPDATE communes SET est_demo = true WHERE id = '$REELLE';" "ne devient pas")"
PUB_REELLE=$(sql "SELECT id FROM publications WHERE commune_id='$REELLE' LIMIT 1")
if [ -n "$PUB_REELLE" ]; then
  chk "des réponses de sondage simulées sur une publication réelle : refusées par la base" 1 \
      "$(fnct "SELECT app.charger_reponses_demo('$PUB_REELLE', '[{\"question\":1,\"choix\":[0]}]');" | grep -c "pas à une commune de démonstration")"
else
  chk "des réponses de sondage simulées sur une publication réelle : refusées par la base" 1 \
      "$(fnct "SELECT app.charger_reponses_demo(gen_random_uuid(), '[]');" | grep -c "pas à une commune de démonstration")"
fi
chk "seule la FNCT retire un jeu, même en base" 1 \
    "$($PSQL -c "SET app.role = 'admin_commune';" -c "SELECT app.retirer_jeu_demo('$DEMO');" 2>&1 | grep -c 'Seule la FNCT')"

# -----------------------------------------------------------------------------
echo
echo "2. Le chargement"
CODE=$(appel POST /demo/charger "$T_FNCT" '{}')
chk "la FNCT charge le jeu" 201 "$CODE"
chk "la commune de démonstration est marquée comme telle" "t" "$(sql "SELECT est_demo FROM communes WHERE id='$DEMO'")"
for t in vehicules:vehicules personnel:personnel circuits:circuits presences:presences pesees:pesees tickets:tickets fins_de_poste:fins_de_poste fuel_logs:carburant actions_planifiees:nettoyages; do
  table=${t%%:*}; cle=${t#*:}
  chk "$table : autant de lignes que dans le fichier du jeu" "$(jeu "len(j['$cle'])")" "$(val "d['compteurs']['$table']")"
done
chk "chaque ligne du jeu porte provenance = simule" 0 \
    "$(sql "SELECT (SELECT count(*) FROM pesees WHERE commune_id='$DEMO' AND provenance<>'simule')
                 + (SELECT count(*) FROM presences WHERE commune_id='$DEMO' AND provenance<>'simule')
                 + (SELECT count(*) FROM tickets WHERE commune_id='$DEMO' AND provenance<>'simule')
                 + (SELECT count(*) FROM personnel WHERE commune_id='$DEMO' AND provenance<>'simule')")"
$PSQL -c "INSERT INTO incidents (commune_id, type, description, provenance) VALUES ('$DEMO', 'autre', 'TEST S1 saisie de démonstration', 'reel');" >/dev/null 2>&1
chk "une saisie faite pendant une démonstration devient « simulée »" "simule" \
    "$(sql "SELECT provenance FROM incidents WHERE commune_id='$DEMO' AND description='TEST S1 saisie de démonstration'")"
chk "aucun nom réel : tous les matricules sont fictifs (DEMO-)" 0 \
    "$(sql "SELECT count(*) FROM personnel WHERE commune_id='$DEMO' AND matricule NOT LIKE 'DEMO-%'")"
EMPREINTE_1=$(empreinte_jeu)

# -----------------------------------------------------------------------------
echo
echo "3. Chaque indicateur, recalculé hors de l'application"
FIN=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date")
comparer_indicateurs() {
  $PSQL -c "SET app.role = 'super_admin_fnct';" -c \
    "SELECT json_agg(m) FROM (SELECT code, valeur, note FROM app.mesures_kpi(2026) WHERE commune_id='$DEMO'
                              UNION ALL SELECT code, valeur, note FROM app.mesures_kpi_auto(2026) WHERE commune_id='$DEMO') m" \
    >"$T/mesures.json" 2>/dev/null
  python3 "$RACINE/tests/jumeau_attendus.py" "$JEU" "$FIN" "$T/mesures.json" >"$T/comparaison.txt"
}
comparer_indicateurs
while IFS="$(printf '\t')" read -r code attendu obtenu; do
  chk "$code" "$attendu" "$obtenu"
done <"$T/comparaison.txt"
chk "une mesure sans source n'a pas de ligne : M2-2, M1-5, M1-7, coût de maintenance" 0 \
    "$(grep -cE '^(M2-2|M1-5|M1-7|COUT_MAINTENANCE)' "$T/comparaison.txt")"
# Lot 16.3 : la consommation de juillet, engin par engin — litres, km,
# L/100 km, écart au quota — recalculée elle aussi hors de l'application.
$PSQL -c "SET app.role = 'super_admin_fnct';" -c \
  "SELECT json_agg(c) FROM app.consommation_engins('$DEMO', '2026-07-01') c" >"$T/conso.json" 2>/dev/null
python3 "$RACINE/tests/jumeau_attendus.py" "$JEU" --consommation 2026-07 "$T/conso.json" >"$T/conso.txt"
chk "consommation de juillet : huit engins suivis" 8 "$(wc -l <"$T/conso.txt" | tr -d ' ')"
while IFS="$(printf '\t')" read -r immat attendu obtenu; do
  chk "juillet, $immat : litres|km|L/100 km|écart au quota" "$attendu" "$obtenu"
done <"$T/conso.txt"
CODE=$(appel GET "/kpi/5-axes?communeId=$DEMO&annee=2026" "$T_FNCT")
chk "le portail de la commune de démonstration calcule ses 5 axes" "200|$DEMO" "$CODE|$(val "d['commune_id']")"

# -----------------------------------------------------------------------------
echo
echo "4. Hors de toute vue nationale"
CODE=$(appel GET /observatoire/gouvernorats "$T_FNCT")
chk "tableau par gouvernorat : pas de ligne « Démonstration », toutes les communes réelles et elles seules" \
    "200|0|$NB_REELLES" "$CODE|$(val "sum(1 for g in d if g['gouvernorat']=='Démonstration')")|$(val "sum(int(g['communes']) for g in d)")"
appel GET /observatoire/deploiement "$T_FNCT" >/dev/null
chk "déploiement : la commune de démonstration n'y est pas" 0 "$(val "sum(1 for c in d if c['commune_id']=='$DEMO')")"
appel GET /communes "$T_FNCT" >/dev/null
chk "annuaire : absente par défaut" "0|$NB_REELLES" "$(val "sum(1 for c in d if c['id']=='$DEMO')")|$(val "len(d)")"
appel GET '/communes?avecDemo=1' "$T_FNCT" >/dev/null
chk "annuaire avec avecDemo=1 (sélecteur de la FNCT) : présente, et marquée" "1|True" \
    "$(val "sum(1 for c in d if c['id']=='$DEMO')")|$(val "[c['est_demo'] for c in d if c['id']=='$DEMO'][0]")"
appel GET /communes/stats "$T_FNCT" >/dev/null
chk "statistiques nationales : elle n'est pas comptée" "$NB_REELLES" "$(val "d['total_communes']")"
for chemin in /kpi/concours-national /kpi/national /kpi/dma /kpi/alertes; do
  CODE=$(appel GET "$chemin?annee=2026" "$T_FNCT")
  chk "$chemin : répond, sans la commune de démonstration" "200|0" "$CODE|$(grep -c "$DEMO" "$T/r.json")"
done
curl -s -o "$T/r.json" "$API/citoyen/carte"
chk "carte publique nationale : aucune réclamation simulée" 0 "$(val "sum(1 for t in d if t['commune_id']=='$DEMO')")"
curl -s -o "$T/r.json" "$API/citoyen/carte?communeId=$DEMO"
chk "… demandée nommément, la carte de démonstration s'affiche" 1 "$(val "int(len(d) > 0)")"

# -----------------------------------------------------------------------------
echo
echo "5. Chaque alerte du jeu se déclenche, puis s'éteint quand on corrige la donnée"
alertes() {
  fnct "SELECT gravite||'|'||domaine||'|'||sujet||'|'||constat FROM app.incoherences_commune('$DEMO');" >"$T/alertes.txt"
  printf '%s|%s|%s|%s' \
    "$(grep -c '^bloquant|pesees|.*charge utile' "$T/alertes.txt")" \
    "$(grep -c '^bloquant|reclamations|' "$T/alertes.txt")" \
    "$(grep -c '^avertissement|points|Nettoyage — Abattoir' "$T/alertes.txt")" \
    "$(grep -c '^avertissement|parc|.*sans motif' "$T/alertes.txt")"
}
chk "A1 surcharge, A2 réclamation en souffrance, A3 nettoyage oublié, A4 engin sans motif : déclenchées" "1|1|1|1" "$(alertes)"
A4=$(jeu "j['commune']['id']+'-'+[a for a in j['anomalies'] if a['code']=='A4'][0]['vehicule'].lower()")
$PSQL -c "UPDATE pesees SET poids_net_kg = 7400 WHERE commune_id='$DEMO' AND date_pesee='2026-07-14' AND poids_net_kg = 9400;" >/dev/null
chk "A1 corrigée (pesée ramenée sous la charge utile) : éteinte" "0|1|1|1" "$(alertes)"
$PSQL -c "UPDATE tickets SET status='resolu', resolved_at='2026-08-26T10:00:00+01:00' WHERE ticket_number='DEMO-2026-0150';" >/dev/null
chk "A2 corrigée (réclamation résolue) : éteinte" "0|0|1|1" "$(alertes)"
$PSQL -c "UPDATE actions_planifiees SET statut='terminee', terminee_le='2026-08-27T12:00:00+01:00' WHERE commune_id='$DEMO' AND date_prevue='2026-08-27' AND statut='planifiee';" >/dev/null
chk "A3 corrigée (nettoyage fait) : éteinte" "0|0|0|1" "$(alertes)"
$PSQL -c "UPDATE vehicules SET motif_immobilisation='En attente de diagnostic' WHERE id='$A4';" >/dev/null
chk "A4 corrigée (motif renseigné) : éteinte" "0|0|0|0" "$(alertes)"

# -----------------------------------------------------------------------------
echo
echo "6. Le chargement rejoué rend exactement le même état"
CODE=$(appel POST /demo/charger "$T_FNCT" '{}')
chk "rechargement" 201 "$CODE"
chk "même contenu qu'au premier chargement (empreinte des pesées, présences, réclamations, engins)" "$EMPREINTE_1" "$(empreinte_jeu)"
chk "les corrections et la saisie de démonstration ont disparu, les alertes sont revenues" "0|1|1|1|1" \
    "$(sql "SELECT count(*) FROM incidents WHERE commune_id='$DEMO' AND description LIKE 'TEST S1%'")|$(alertes)"
comparer_indicateurs
chk "mêmes indicateurs, toujours conformes au calcul indépendant" 0 \
    "$(awk -F'\t' '$2 != $3' "$T/comparaison.txt" | wc -l | tr -d ' ')"

# -----------------------------------------------------------------------------
echo
echo "7. Le retrait efface tout, et ne touche à rien d'autre"
CODE=$(appel POST /demo/retirer "$T_FNCT" '{}')
chk "la FNCT retire le jeu" "200|True" "$CODE|$(val "d['retiree']")"
chk "la commune de démonstration n'existe plus" 0 "$(sql "SELECT count(*) FROM communes WHERE id='$DEMO'")"
chk "aucune ligne simulée ne reste, nulle part" 0 \
    "$(sql "SELECT (SELECT count(*) FROM pesees WHERE provenance='simule') + (SELECT count(*) FROM presences WHERE provenance='simule')
                 + (SELECT count(*) FROM tickets WHERE provenance='simule') + (SELECT count(*) FROM vehicules WHERE provenance='simule')
                 + (SELECT count(*) FROM personnel WHERE provenance='simule') + (SELECT count(*) FROM circuits WHERE provenance='simule')")"
chk "la commune réelle est intacte (pesées, présences, circuits, agents, réclamations)" "$AVANT_REELLE" "$(empreinte_reelle)"
appel GET /demo "$T_FNCT" >/dev/null
chk "l'écran du mode démo la dit « non chargée »" "False" "$(val "d['chargee']")"
CODE=$(appel POST /demo/retirer "$T_FNCT" '{}')
chk "retirer ce qui n'est plus là ne fait rien, sans erreur" "200|0" "$CODE|$(val "d['lignesEffacees']")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
