#!/usr/bin/env bash
# =============================================================================
# Module 4 — Personnel. Tests sur l'effectif réel du service propreté de
# Dar Chaabane El Fehri : 60 ouvriers, 1 technicien principal, et une masse
# salariale de 1 324 500 TND en 2024.
#
# CE QUE CES TESTS VÉRIFIENT EN PREMIER, ET POURQUOI. Avant toute
# fonctionnalité, ils vérifient ce que la base NE contient PAS. Un module du
# personnel se juge d'abord à ce qu'il a refusé de stocker : le registre source
# porte treize colonnes de rémunération pour soixante personnes nommées, et
# rien de tout cela ne doit pouvoir entrer, ni par une colonne, ni par une
# route, ni par un contrat d'API (décret-loi n° 2022-54).
#
#   docker compose run --rm api npm run test:module4
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Siipi2026!\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
sql()  { $PSQL -c "$1" 2>/dev/null | tr -d ' '; }
sqlr() { $PSQL -c "$1" 2>/dev/null; }
code() { curl -s -o /tmp/siipi_m4.json -w '%{http_code}' "$@"; }
val()  { python3 -c "import json;print(json.load(open('/tmp/siipi_m4.json'))$1)" 2>/dev/null || echo erreur; }
nb()   { python3 -c "import json;print(len(json.load(open('/tmp/siipi_m4.json'))))" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

COMMUNE=$(sql "SELECT id FROM communes WHERE name ILIKE '%Chaâbane%' OR name ILIKE '%Chaabane%' OR id LIKE '%dar_chaabane%' OR id LIKE '%dar-chaabane%' ORDER BY length(name) LIMIT 1")
if [ -z "$COMMUNE" ]; then
  echo "Dar Chaabane absente. Lancer : npm run seed && npm run seed:dar-chaabane" >&2
  exit 1
fi
if [ "$(sql "SELECT count(*) FROM personnel WHERE commune_id='$COMMUNE' AND matricule LIKE 'DCF-%'")" = "0" ]; then
  echo "Effectif non chargé. Lancer : npm run seed:personnel" >&2
  exit 1
fi

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id='$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
[ -n "$DIR_EMAIL" ] || DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }

AUTRE=$(sql "SELECT id FROM communes WHERE id <> '$COMMUNE' ORDER BY id LIMIT 1")

nettoyer() {
  $PSQL -c "DELETE FROM presences       WHERE personnel_id IN (SELECT id FROM personnel WHERE matricule LIKE 'TEST-M4%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM circuit_equipe  WHERE personnel_id IN (SELECT id FROM personnel WHERE matricule LIKE 'TEST-M4%');" >/dev/null 2>&1
  $PSQL -c "DELETE FROM personnel       WHERE matricule LIKE 'TEST-M4%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM effectifs_service WHERE annee = 1999;" >/dev/null 2>&1
}
nettoyer

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la base REFUSE de stocker (décret-loi 2022-54)"
# Le seul test vraiment important du module. Si l'une de ces colonnes apparaît
# un jour, la plateforme sera devenue un fichier de paie sans que personne ne
# l'ait décidé.
for col in cin numero_cin telephone tel adresse salaire remuneration \
           salaire_base prime indemnite maladie sante diagnostic handicap; do
  chk "personnel n'a pas de colonne « $col »" 0 \
      "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name='personnel' AND column_name='$col'")"
done
chk "effectifs_service n'a aucune clé vers une personne" 0 \
    "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name='effectifs_service' AND column_name LIKE '%personnel%'")"

# Une liste noire ne protège que de ce qu'on a pensé à interdire. Celle-ci est
# une liste BLANCHE : le jour où quelqu'un ajoute une colonne à l'une de ces
# trois tables — pour une bonne raison ou par habitude — ce test tombe, et
# l'ajout devient une décision consciente au lieu d'un glissement.
chk "les colonnes de « personnel » sont exactement celles prévues" \
    "actif,affectation,classe,commune_id,created_at,date_depart,date_recrutement,deleted_at,deleted_by,echelon,fonction,grade,id,matricule,nom_complet,observation,permis,service,statut,updated_at" \
    "$(sql "SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_name='personnel'")"
chk "les colonnes de « effectifs_service » sont exactement celles prévues" \
    "annee,commune_id,created_at,effectif_contractuels,effectif_encadrement,effectif_ouvriers,id,masse_salariale_ouvriers_tnd,masse_salariale_tnd,observation,saisi_par,service,source,updated_at" \
    "$(sql "SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_name='effectifs_service'")"
chk "les colonnes de « presences » sont exactement celles prévues" \
    "circuit_id,commune_id,created_at,id,jour,motif_absence,observation,personnel_id,present,saisi_par,updated_at,voyage" \
    "$(sql "SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_name='presences'")"
# Le vocabulaire des absences est la deuxième porte d'entrée possible d'une
# donnée de santé. Elle est fermée par une contrainte, pas par une convention.
chk "« maladie » n'est pas un motif d'absence acceptable" 1 \
    "$(sqlr "DO \$\$ BEGIN
               INSERT INTO presences (commune_id, personnel_id, present, motif_absence)
               VALUES ('$COMMUNE', (SELECT id FROM personnel WHERE commune_id='$COMMUNE' LIMIT 1), false, 'maladie');
               RAISE EXCEPTION 'ACCEPTE';
             EXCEPTION WHEN check_violation THEN NULL; END \$\$;" >/dev/null 2>&1 && echo 1 || echo 0)"

# -----------------------------------------------------------------------------
echo
echo "2. L'effectif réel est chargé tel qu'il est"
chk "soixante ouvriers" 60 \
    "$(sql "SELECT count(*) FROM personnel WHERE commune_id='$COMMUNE' AND matricule LIKE 'DCF-0%'")"
chk "un seul cadre technique" 1 \
    "$(sql "SELECT count(*) FROM personnel WHERE commune_id='$COMMUNE' AND fonction='encadrement'")"
chk "vingt-six agents en classe 4" 26 \
    "$(sql "SELECT count(*) FROM personnel WHERE commune_id='$COMMUNE' AND classe=4")"
chk "vingt en classe 5" 20 \
    "$(sql "SELECT count(*) FROM personnel WHERE commune_id='$COMMUNE' AND classe=5")"
chk "huit en classe 6" 8 \
    "$(sql "SELECT count(*) FROM personnel WHERE commune_id='$COMMUNE' AND classe=6")"
chk "trois en classe 7 et trois en classe 8" "3|3" \
    "$(sql "SELECT count(*) FILTER (WHERE classe=7)||'|'||count(*) FILTER (WHERE classe=8) FROM personnel WHERE commune_id='$COMMUNE'")"
# Les noms sont fabriqués : aucun ne doit ressembler à un patronyme du registre.
chk "aucun nom du registre réel n'a été chargé" 0 \
    "$(sql "SELECT count(*) FROM personnel WHERE commune_id='$COMMUNE' AND (nom_complet LIKE '%بنزايد%' OR nom_complet LIKE '%الوائلي%' OR nom_complet LIKE '%بنعمر%')")"
# Soixante et une lignes de pointage dont trois portent le même nom, c'est un
# écran que personne ne peut remplir : le technicien ne sait pas qui il coche.
# Le générateur de noms fictifs avait ce défaut ; ce test l'empêche de revenir.
chk "les soixante et un noms sont tous différents" 61 \
    "$(sql "SELECT count(DISTINCT nom_complet) FROM personnel WHERE commune_id='$COMMUNE' AND matricule LIKE 'DCF-%'")"
# La fonction est déduite, pas relevée. La base doit le dire elle-même.
chk "la déduction des fonctions est signalée en base" 60 \
    "$(sql "SELECT count(*) FROM personnel WHERE commune_id='$COMMUNE' AND observation LIKE '%déduite%'")"

# -----------------------------------------------------------------------------
echo
echo "3. La masse salariale du service"
chk "quatre exercices chargés" 4 \
    "$(sql "SELECT count(*) FROM effectifs_service WHERE commune_id='$COMMUNE'")"
chk "2024 : 1 324 500 TND" "1324500.000" \
    "$(sql "SELECT masse_salariale_tnd FROM effectifs_service WHERE commune_id='$COMMUNE' AND annee=2024")"
chk "2021 : 1 168 566 TND" "1168566.000" \
    "$(sql "SELECT masse_salariale_tnd FROM effectifs_service WHERE commune_id='$COMMUNE' AND annee=2021")"
# 2021 n'a pas de détail nominatif au dossier : l'effectif reste à zéro plutôt
# que de recopier celui de 2022, ce qui inventerait une stabilité non observée.
chk "l'effectif 2021, inconnu, n'est pas inventé" 0 \
    "$(sql "SELECT effectif_ouvriers FROM effectifs_service WHERE commune_id='$COMMUNE' AND annee=2021")"
chk "chaque exercice porte sa source" 4 \
    "$(sql "SELECT count(*) FROM effectifs_service WHERE commune_id='$COMMUNE' AND source IS NOT NULL")"
chk "la part ouvrière ne peut dépasser le total" 0 \
    "$(sql "SELECT count(*) FROM effectifs_service WHERE masse_salariale_ouvriers_tnd > masse_salariale_tnd")"

chk "GET /personnel/cout répond" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/personnel/cout?communeId=$COMMUNE")"
chk "l'évolution 2024 est calculée, pas saisie" "3.3" "$(val "[3]['evolution_pct']")"
chk "le coût moyen par agent 2024 est cohérent" "21713.115" "$(val "[3]['cout_moyen_agent_tnd']")"

# -----------------------------------------------------------------------------
echo
echo "4. Les routes du module"
chk "GET /personnel répond" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/personnel?communeId=$COMMUNE")"
chk "soixante et un agents rendus" 61 "$(nb)"
chk "l'encadrement est en tête de liste" "encadrement" "$(val "[0]['fonction']")"
chk "GET /personnel/effectif répond" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/personnel/effectif?communeId=$COMMUNE")"
chk "GET /personnel/equipes répond" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/personnel/equipes?communeId=$COMMUNE")"
# La vue « Équipes » signalait les tournées non pourvues sans pouvoir les
# pourvoir : la fonction ne rendait que des COMPTES, jamais l'identifiant des
# affectations — seul moyen d'en clore une. Un écran qui constate un manque
# sans permettre de le combler renvoie vers un formulaire qui n'existe pas.
chk "chaque circuit rend la liste de ses membres" 0 \
    "$(python3 -c "
import json
d = json.load(open('/tmp/siipi_m4.json'))
print(sum(1 for c in d if not isinstance(c.get('membres'), list)))" 2>/dev/null || echo erreur)"
chk "GET /personnel/presences répond" 200 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/personnel/presences?communeId=$COMMUNE")"
# Le piège des routes littérales capturées par « /:id » s'est présenté quatre
# fois dans ce projet. Il se vérifie désormais.
chk "« effectif » n'est pas pris pour un identifiant" 0 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/personnel/effectif?communeId=$COMMUNE" | grep -c '^404$')"
chk "un identifiant inconnu rend bien 404" 404 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/personnel/00000000-0000-0000-0000-000000000000")"
chk "un identifiant mal formé rend 400, pas 500" 400 \
    "$(code -H "Authorization: Bearer $T_DIR" "$API/personnel/pas-un-uuid")"
chk "sans jeton, 401" 401 "$(code "$API/personnel?communeId=$COMMUNE")"

# -----------------------------------------------------------------------------
echo
echo "5. Inscription, affectation, présence"
CREE=$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"nomComplet":"Agent Essai","matricule":"TEST-M4-001","fonction":"chauffeur","classe":5,"echelon":3,"permis":["C"]}' \
  "$API/personnel?communeId=$COMMUNE")
chk "inscription d'un agent" 201 "$CREE"
AGENT=$(val "['id']")
chk "le permis est enregistré" "C" "$(val "['permis'][0]")"

CIRCUIT=$(sql "SELECT id FROM circuits WHERE commune_id='$COMMUNE' AND actif AND deleted_at IS NULL ORDER BY nom LIMIT 1")
chk "affectation à un circuit" 201 \
    "$(code -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"circuitId\":\"$CIRCUIT\",\"role\":\"chauffeur\"}" "$API/personnel/$AGENT/affectations")"
AFFECT=$(val "['id']")

# Un agent d'une autre commune sur ce circuit : la base doit refuser.
if [ -n "$AUTRE" ]; then
  $PSQL -c "INSERT INTO personnel (commune_id, matricule, nom_complet, fonction)
            VALUES ('$AUTRE','TEST-M4-002','Agent Ailleurs','agent');" >/dev/null 2>&1
  ETRANGER=$(sql "SELECT id FROM personnel WHERE matricule='TEST-M4-002'")
  chk "un agent d'une autre commune ne peut être affecté" 1 \
      "$(sqlr "INSERT INTO circuit_equipe (circuit_id, personnel_id) VALUES ('$CIRCUIT','$ETRANGER');" 2>&1 \
         | grep -c 'AFFECTATION_HORS_COMMUNE')"
fi

# Retrait du registre. L'ordre des deux vérifications est l'essentiel : tant
# que l'agent tient un poste, le retrait est REFUSÉ et le message nomme le
# circuit. Retirer en silence un chauffeur affecté laisserait une tournée
# apparemment pourvue par quelqu'un qui n'est plus au registre — l'écran
# mentirait sans rien signaler.
chk "un agent encore affecté ne peut être retiré" 409 \
    "$(code -X DELETE -H "Authorization: Bearer $T_DIR" "$API/personnel/$AGENT")"
chk "et le refus nomme le circuit" 1 \
    "$(python3 -c "
import json
print(1 if 'affecté' in json.load(open('/tmp/siipi_m4.json')).get('error','') else 0)" 2>/dev/null || echo erreur)"

chk "pointage : présent" 200 \
    "$(code -X PUT -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"personnelId\":\"$AGENT\",\"present\":true,\"circuitId\":\"$CIRCUIT\"}" "$API/personnel/presences")"
chk "repointer le même jour ne crée pas de doublon" 1 \
    "$(sql "SELECT count(*) FROM presences WHERE personnel_id='$AGENT' AND jour=CURRENT_DATE")"
chk "un présent porteur d'un motif est refusé" 400 \
    "$(code -X PUT -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"personnelId\":\"$AGENT\",\"present\":true,\"motifAbsence\":\"conge\"}" "$API/personnel/presences")"
chk "une absence sans motif est refusée" 400 \
    "$(code -X PUT -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"personnelId\":\"$AGENT\",\"present\":false}" "$API/personnel/presences")"
chk "un motif hors vocabulaire est refusé" 400 \
    "$(code -X PUT -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"personnelId\":\"$AGENT\",\"present\":false,\"motifAbsence\":\"maladie\"}" "$API/personnel/presences")"
chk "pointage en lot" 200 \
    "$(code -X PUT -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "[{\"personnelId\":\"$AGENT\",\"present\":false,\"motifAbsence\":\"conge\"}]" "$API/personnel/presences")"
chk "l'absence a effacé le circuit du pointage" "" \
    "$(sql "SELECT COALESCE(circuit_id::text,'') FROM presences WHERE personnel_id='$AGENT' AND jour=CURRENT_DATE")"

# -----------------------------------------------------------------------------
echo
echo "6. Retirer un agent du registre"
chk "clore l'affectation" 200 \
    "$(code -X PATCH -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"dateFin\":\"$(date +%Y-%m-%d)\"}" "$API/personnel/$AGENT/affectations/$AFFECT")"
chk "l'agent peut alors être retiré" 204 \
    "$(code -X DELETE -H "Authorization: Bearer $T_DIR" "$API/personnel/$AGENT")"
chk "il ne figure plus au registre" 0 \
    "$(sql "SELECT count(*) FROM personnel WHERE id='$AGENT' AND deleted_at IS NULL")"
# Suppression LOGIQUE : le pointage du jour et la tournée déjà faite gardent
# l'agent qui les a faits. Réécrire l'histoire d'un service public parce qu'une
# ligne a été mal tapée serait le contraire d'un registre.
chk "son pointage du jour reste lisible" 1 \
    "$(sql "SELECT count(*) FROM presences WHERE personnel_id='$AGENT'")"
chk "son affectation passée reste lisible" 1 \
    "$(sql "SELECT count(*) FROM circuit_equipe WHERE personnel_id='$AGENT'")"
chk "le retirer une seconde fois rend 404" 404 \
    "$(code -X DELETE -H "Authorization: Bearer $T_DIR" "$API/personnel/$AGENT")"

# On clôt l'affectation, on ne la supprime pas : la tournée passée doit rester
# lisible avec l'équipe qui l'a réellement faite.
chk "clôture d'une affectation" 200 \
    "$(code -X PATCH -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
       -d "{\"dateFin\":\"$(date +%Y-%m-%d)\"}" "$API/personnel/$AGENT/affectations/$AFFECT")"
chk "l'affectation close est conservée" 1 \
    "$(sql "SELECT count(*) FROM circuit_equipe WHERE id='$AFFECT'")"

# -----------------------------------------------------------------------------
echo
echo "7. Les questions que le module pose"
chk "les incohérences de personnel sont remontées" 1 \
    "$(sql "SELECT CASE WHEN count(*) > 0 THEN 1 ELSE 0 END FROM app.incoherences_commune('$COMMUNE') WHERE domaine='personnel'")"
# Les circuits du registre n'ont reçu aucune équipe : c'est vrai, et ça doit se
# voir. C'est précisément l'écart que le dossier laisse ouvert — deux feuilles
# du registre annoncent 48 et 39 agents, la paie en compte 60, et aucun des
# trois chiffres ne dit qui fait quoi.
chk "les circuits sans équipe sont signalés comme bloquants" 1 \
    "$(sql "SELECT CASE WHEN count(*) > 0 THEN 1 ELSE 0 END FROM app.incoherences_commune('$COMMUNE') WHERE gravite='bloquant' AND constat LIKE '%sans aucun agent%'")"
# Un agent peut servir deux circuits le même jour — matin puis après-midi. Ce
# n'est signalé que si les horaires se chevauchent réellement.
chk "deux circuits successifs ne sont PAS signalés comme conflit" 0 \
    "$(sql "SELECT count(*) FROM app.incoherences_commune('$COMMUNE') WHERE constat LIKE '%chevauchent%'")"
# Le permis n'est pas au dossier de la commune : le seed le laisse vide plutôt
# que de le supposer. Dès qu'un chauffeur est affecté, la question doit remonter.
$PSQL -c "INSERT INTO personnel (commune_id, matricule, nom_complet, fonction)
          VALUES ('$COMMUNE','TEST-M4-003','Chauffeur Sans Permis','chauffeur');" >/dev/null 2>&1
SANS_PERMIS=$(sql "SELECT id FROM personnel WHERE matricule='TEST-M4-003'")
$PSQL -c "INSERT INTO circuit_equipe (circuit_id, personnel_id, role)
          VALUES ('$CIRCUIT','$SANS_PERMIS','chauffeur');" >/dev/null 2>&1
chk "un chauffeur sans permis enregistré est signalé" 1 \
    "$(sql "SELECT count(*) FROM app.incoherences_commune('$COMMUNE') WHERE sujet_id='$SANS_PERMIS' AND constat LIKE '%permis%'")"

# -----------------------------------------------------------------------------
echo
echo "8. Cloisonnement"
if [ -n "$AUTRE" ]; then
  code -H "Authorization: Bearer $T_DIR" "$API/personnel?communeId=$AUTRE" >/dev/null
  chk "l'effectif d'une autre commune n'est pas lisible" 0 "$(nb)"
fi
# Le cloisonnement doit tenir au niveau de la BASE, pas seulement de l'API.
# Une route oubliée, un jour, servira une requête sans filtre applicatif ; c'est
# la RLS qui doit refuser, et c'est elle qu'on éprouve ici — en se mettant
# réellement dans la peau de chaque rôle.
if [ -n "$AUTRE" ]; then
  chk "un agent de commune ne voit que SA commune (base)" 1 \
      "$(sql "BEGIN;
                SET LOCAL ROLE siipi_app;
                SELECT set_config('app.role', 'admin_commune', true),
                       set_config('app.commune_id', '$COMMUNE', true),
                       set_config('app.user_id', (SELECT id::text FROM users WHERE commune_id='$COMMUNE' AND role='admin_commune' AND deleted_at IS NULL LIMIT 1), true);
                SELECT CASE WHEN count(*) = 0 THEN 1 ELSE 0 END FROM personnel WHERE commune_id='$AUTRE';
              ROLLBACK;" | tail -1)"
  # Contre-épreuve : le même compte DOIT voir sa propre commune. Sans elle, un
  # cloisonnement qui bloquerait tout le monde passerait pour un succès.
  chk "et il voit bien la sienne (base)" 1 \
      "$(sql "BEGIN;
                SET LOCAL ROLE siipi_app;
                SELECT set_config('app.role', 'admin_commune', true),
                       set_config('app.commune_id', '$COMMUNE', true),
                       set_config('app.user_id', (SELECT id::text FROM users WHERE commune_id='$COMMUNE' AND role='admin_commune' AND deleted_at IS NULL LIMIT 1), true);
                SELECT CASE WHEN count(*) > 0 THEN 1 ELSE 0 END FROM personnel WHERE commune_id='$COMMUNE';
              ROLLBACK;" | tail -1)"
fi
chk "un compte anonyme ne voit aucun agent (base)" 0 \
    "$(sql "BEGIN;
              SET LOCAL ROLE siipi_app;
              SET LOCAL app.role = 'anonyme';
              SELECT count(*) FROM personnel;
            ROLLBACK;" | tail -1)"
chk "un compte anonyme ne voit aucune masse salariale (base)" 0 \
    "$(sql "BEGIN;
              SET LOCAL ROLE siipi_app;
              SET LOCAL app.role = 'anonyme';
              SELECT count(*) FROM effectifs_service;
            ROLLBACK;" | tail -1)"

chk "le contrat d'API ne publie aucun salaire individuel" 0 \
    "$(curl -s "$API/openapi.json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
a=d.get('components',{}).get('schemas',{}).get('Agent',{}).get('properties',{})
interdits={'salaire','remuneration','cin','telephone','adresse','prime','indemnite'}
print(len(interdits & set(a)))" 2>/dev/null || echo erreur)"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
