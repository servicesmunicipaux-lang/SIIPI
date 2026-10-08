#!/usr/bin/env bash
# =============================================================================
# Lot 18.1 — le registre communal des acteurs informels (migration 064).
# Projet de décret sur le tri à la source, art. 13.1 — NON EN VIGUEUR : tout
# s'écrit derrière le paramètre national `cadre_secteur_informel_actif`.
#
# Elle commence par ce que la plateforme REFUSE :
#   - toute écriture au registre tant que le cadre n'est pas en vigueur, par
#     l'API puis par la base elle-même ;
#   - la mise en vigueur par un admin communal, ou sans le texte qui la fonde ;
#   - des faits non datés, ou datés dans l'avenir ; une catégorie inconnue ;
#   - une démarche hors de son ordre : accompagnement sans démarche entamée,
#     démarche entamée sans pièce, interruption sans motif, date qui recule,
#     étape après une formalisation, étape réécrite.
# Puis : le pseudonyme attribué par la base, la catégorie impliquée par les
# faits, l'écart montré dans « À vérifier » sans être corrigé, le retrait
# logique d'une étape, la suspension du cadre (lecture conservée).
#
# Données fictives : une commune de test, effacée en partant ; le paramètre
# national est rétabli dans l'état trouvé.
#
#   docker compose exec -T api npm run test:acteurs-informels
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
TC=test_acteurs_181

# L'état du cadre à rétablir en partant.
CADRE_AVANT=$($PSQL -c "SELECT valeur||'|'||COALESCE(reference,'') FROM parametres_nationaux WHERE cle='cadre_secteur_informel_actif'")
nettoyer() {
  # barbechas.commune_id est en ON DELETE SET NULL : effacer la commune seule
  # laisserait les acteurs de test orphelins, invisibles de tous.
  $PSQL -c "DELETE FROM barbechas WHERE commune_id = '$TC' OR id_precollecteur LIKE 'TEST-ACT-%';
            DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
}
retablir() {
  local v=${CADRE_AVANT%%|*} r=${CADRE_AVANT#*|}
  $PSQL -c "UPDATE parametres_nationaux SET valeur='${v:-false}', reference=NULLIF('$r','') WHERE cle='cadre_secteur_informel_actif';" >/dev/null 2>&1
}
nettoyer
$PSQL -c "UPDATE parametres_nationaux SET valeur='false', reference=NULL WHERE cle='cadre_secteur_informel_actif';
          INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST acteurs informels', 'TEST', 'TEST', 8000);
          INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$ID_A', '$TC');" >/dev/null
T_A=$(tok "$DIR_A")
DIR_B=$(sql "SELECT u.email FROM users u WHERE u.role='admin_commune' AND u.deleted_at IS NULL AND u.is_active AND NOT u.mot_de_passe_provisoire AND u.email <> '$DIR_A' AND u.commune_id <> '$TC' AND NOT EXISTS (SELECT 1 FROM utilisateur_communes x WHERE x.user_id = u.id AND x.commune_id = '$TC') ORDER BY u.created_at LIMIT 1")
T_B=$(tok "$DIR_B")
[ -n "$T_B" ] || { echo "Il faut un second admin communal hors de la commune de test." >&2; retablir; nettoyer; exit 1; }
J=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date")
jour() { sql "SELECT ((now() AT TIME ZONE 'Africa/Tunis')::date + $1)::text"; }
J30=$(jour -30); J20=$(jour -20); J10=$(jour -10); J5=$(jour -5); J40=$(jour -40); DEMAIN=$(jour 1)
acteur() { # catégorie local achat motorisé [date] -> corps JSON
  printf '{"zone":"TEST-ZONE","vehicleType":"charette","categorie":"%s","disposeLocal":%s,"acheteAuxPairs":%s,"vehiculeMotorise":%s,"faitsRelevesLe":"%s"}' \
    "$1" "$2" "$3" "$4" "${5:-$J10}"
}
faits() { # catégorie local achat motorisé [date]
  printf '{"categorie":"%s","disposeLocal":%s,"acheteAuxPairs":%s,"vehiculeMotorise":%s,"faitsRelevesLe":"%s"}' "$1" "$2" "$3" "$4" "${5:-$J10}"
}
demarche() { # statut date [référence] [observation]
  printf '{"statut":"%s","dateStatut":"%s","reference":%s,"observation":%s}' "$1" "$2" "${3:-null}" "${4:-null}"
}
coherence() { # nombre de lignes du domaine, pour une gravité
  appel GET "/communes/$TC/coherence" "$T_A" >/dev/null
  val "len([l for l in d if l['domaine']=='acteurs_informels' and l['gravite']=='$1'])"
}

# Un acteur inscrit au lot 16.1 (sans catégorie ni faits) : permis cadre fermé.
$PSQL -c "INSERT INTO barbechas (id_precollecteur, zone, commune_id, vehicle_type) VALUES ('TEST-ACT-161', 'TEST-ZONE', '$TC', 'charette');" >/dev/null 2>&1
ANCIEN=$(sql "SELECT id FROM barbechas WHERE id_precollecteur='TEST-ACT-161'")

# -----------------------------------------------------------------------------
echo
echo "1. Cadre pas en vigueur : le registre est fermé en écriture"
chk "une inscription du lot 16.1, sans catégorie ni faits, reste permise" 1 "$(sql "SELECT count(*) FROM barbechas WHERE id='$ANCIEN'")"
CODE=$(appel GET "/acteurs-informels?communeId=$TC" "$T_A")
chk "le registre se lit : cadre inactif, sans référence" "200|False|None|1" \
    "$CODE|$(val "d['cadre_actif']")|$(val "d['reference_cadre']")|$(val "len(d['acteurs'])")"
CODE=$(appel POST "/acteurs-informels?communeId=$TC" "$T_A" "$(acteur pre_collecteur false false false)")
chk "inscrire un acteur : refusé (409), le message dit pourquoi" "409|1" "$CODE|$(val "int('pas en vigueur' in d['error'])")"
CODE=$(appel PUT "/acteurs-informels/$ANCIEN/faits" "$T_A" "$(faits pre_collecteur false false false)")
chk "déclarer catégorie et faits : refusé (409)" 409 "$CODE"
CODE=$(appel POST "/acteurs-informels/$ANCIEN/demarches" "$T_A" "$(demarche demarche_entamee "$J30" '"TEST-REC-0001"')")
chk "inscrire une démarche : refusé (409)" 409 "$CODE"
chk "… la base refuse une catégorie, même au super-utilisateur" 1 \
    "$(refus "UPDATE barbechas SET categorie='pre_collecteur' WHERE id='$ANCIEN';" CADRE_INACTIF)"
chk "… et des faits" 1 \
    "$(refus "UPDATE barbechas SET dispose_local=false, faits_releves_le='$J10' WHERE id='$ANCIEN';" CADRE_INACTIF)"
chk "… et une démarche" 1 \
    "$(refus "INSERT INTO demarches_formalisation (acteur_id, statut, date_statut, reference) VALUES ('$ANCIEN', 'demarche_entamee', '$J30', 'TEST');" CADRE_INACTIF)"
chk "… sans pour autant bloquer le reste d'une fiche du lot 16.1" 1 \
    "$($PSQL -c "UPDATE barbechas SET zone='TEST-ZONE-BIS' WHERE id='$ANCIEN' RETURNING 1;" 2>/dev/null | head -1)"

# -----------------------------------------------------------------------------
echo
echo "2. La mise en vigueur : la FNCT seule, texte cité"
CODE=$(appel GET /observatoire/cadre-secteur-informel "$T_A")
chk "tout compte authentifié lit l'état du cadre" "200|False" "$CODE|$(val "d['actif']")"
CODE=$(appel PUT /observatoire/cadre-secteur-informel "$T_A" '{"actif":true,"reference":"TEST-décret"}')
chk "un admin communal ne met pas le cadre en vigueur (403)" 403 "$CODE"
CODE=$(appel PUT /observatoire/cadre-secteur-informel "$T_FNCT" '{"actif":true}')
chk "la FNCT ne le met pas en vigueur sans citer le texte (400)" 400 "$CODE"
chk "… et la base le refuse aussi" 1 \
    "$(refus "UPDATE parametres_nationaux SET valeur='true', reference=NULL WHERE cle='cadre_secteur_informel_actif';" parametres_nationaux_secteur_informel)"
chk "… comme une valeur qui n'est pas un booléen" 1 \
    "$(refus "UPDATE parametres_nationaux SET valeur='oui', reference='TEST' WHERE cle='cadre_secteur_informel_actif';" parametres_nationaux_secteur_informel)"
CODE=$(appel PUT /observatoire/cadre-secteur-informel "$T_FNCT" '{"actif":true,"reference":"TEST-décret n° 0000-0001, JORT n° 001"}')
chk "la FNCT le met en vigueur, texte cité" "200|True|1" "$CODE|$(val "d['actif']")|$(val "int(d['reference'].startswith('TEST-décret'))")"

# -----------------------------------------------------------------------------
echo
echo "3. L'inscription : ce qui est refusé"
CODE=$(appel POST "/acteurs-informels?communeId=$TC" "$T_A" "$(acteur pre_collecteur false false false "$DEMAIN")")
chk "des faits datés de demain : refusés (400)" 400 "$CODE"
CODE=$(appel POST "/acteurs-informels?communeId=$TC" "$T_A" '{"zone":"TEST-ZONE","categorie":"pre_collecteur","disposeLocal":false,"acheteAuxPairs":false,"vehiculeMotorise":false}')
chk "des faits sans date de relevé : refusés (400)" 400 "$CODE"
CODE=$(appel POST "/acteurs-informels?communeId=$TC" "$T_A" "$(acteur grossiste false false false)")
chk "une catégorie inconnue : refusée (400)" 400 "$CODE"
CODE=$(appel POST "/acteurs-informels?communeId=$TC" "$T_FNCT" "$(acteur pre_collecteur false false false)")
chk "la FNCT n'inscrit pas à la place de la commune (403)" 403 "$CODE"
CODE=$(appel POST "/acteurs-informels?communeId=$TC" "$T_B" "$(acteur pre_collecteur false false false)")
chk "l'admin d'une autre commune n'y inscrit rien (404)" 404 "$CODE"
chk "la base refuse des faits sans date" 1 \
    "$(refus "UPDATE barbechas SET dispose_local=true WHERE id='$ANCIEN';" barbechas_faits_dates)"
chk "… des faits datés dans l'avenir" 1 \
    "$(refus "UPDATE barbechas SET dispose_local=true, faits_releves_le='$DEMAIN' WHERE id='$ANCIEN';" FAITS_AVENIR)"
chk "… une catégorie inconnue" 1 \
    "$(refus "UPDATE barbechas SET categorie='grossiste' WHERE id='$ANCIEN';" barbechas_categorie_valide)"
chk "aucun acteur n'a été inscrit par ces refus" 1 "$(sql "SELECT count(*) FROM barbechas WHERE commune_id='$TC'")"

# -----------------------------------------------------------------------------
echo
echo "4. L'inscription : pseudonyme attribué par la base, catégorie impliquée par les faits"
PREFIXE=$(sql "SELECT split_part(app.prochain_identifiant_acteur('$TC'), '-', 1)")
CODE=$(appel POST "/acteurs-informels?communeId=$TC" "$T_A" "$(acteur pre_collecteur false false false)")
UN=$(val "d['id']")
chk "pré-collecteur, ni local ni achat : inscrit, pseudonyme -I0001, rien d'écart" "201|$PREFIXE-I0001|pre_collecteur|pre_collecteur" \
    "$CODE|$(val "d['id_precollecteur']")|$(val "d['categorie']")|$(val "d['categorie_impliquee']")"
CODE=$(appel POST "/acteurs-informels?communeId=$TC" "$T_A" "$(acteur pre_collecteur false true false)")
DEUX=$(val "d['id']")
chk "déclaré pré-collecteur mais achète à ses pairs : -I0002, les faits impliquent intermédiaire" "201|$PREFIXE-I0002|pre_collecteur|intermediaire" \
    "$CODE|$(val "d['id_precollecteur']")|$(val "d['categorie']")|$(val "d['categorie_impliquee']")"
CODE=$(appel POST "/acteurs-informels?communeId=$TC" "$T_A" "$(acteur intermediaire null null null)")
TROIS=$(val "d['id']")
chk "intermédiaire, faits non renseignés : null reste null, aucune catégorie impliquée" "201|None|None|None" \
    "$CODE|$(val "d['dispose_local']")|$(val "d['achete_aux_pairs']")|$(val "d['categorie_impliquee']")"
chk "le pseudonyme est unique : un même numéro réutilisé est refusé par la base" 1 \
    "$(refus "INSERT INTO barbechas (id_precollecteur, zone, commune_id) VALUES ('$PREFIXE-I0001', 'TEST', '$TC');" barbechas_code_id_key)"
CODE=$(appel GET "/acteurs-informels?communeId=$TC" "$T_A")
chk "le registre ne porte ni nom, ni CIN, ni position, ni rendement" "0" \
    "$(val "len(set(k for a in d['acteurs'] for k in a) & {'nom','nom_complet','cin','empreinte_cin','latitude','longitude','position','collected_total_kg','revenu'})")"
CODE=$(appel GET "/acteurs-informels?communeId=$TC" "$T_B")
chk "l'admin d'une autre commune n'en voit aucun" "200|0" "$CODE|$(val "len(d['acteurs'])")"
CODE=$(appel GET "/acteurs-informels?communeId=$TC" "$T_FNCT")
chk "la FNCT le lit" "200|4" "$CODE|$(val "len(d['acteurs'])")"

# -----------------------------------------------------------------------------
echo
echo "5. La plateforme constate l'écart, elle ne le corrige pas"
$PSQL -c "UPDATE barbechas SET achete_aux_pairs=false, dispose_local=true, faits_releves_le='$J10' WHERE id='$ANCIEN';" >/dev/null 2>&1
chk "déclaré pré-collecteur, faits d'intermédiaire : un avertissement dans « À vérifier »" 1 "$(coherence avertissement)"
chk "… qui nomme l'acteur par son pseudonyme" 1 \
    "$(val "int(any(l['sujet']=='$PREFIXE-I0002' for l in d if l['domaine']=='acteurs_informels'))")"
chk "catégorie non déclarée mais impliquée par les faits : une information" 1 "$(coherence information)"
chk "la catégorie déclarée reste celle que la commune a écrite" pre_collecteur "$(sql "SELECT categorie FROM barbechas WHERE id='$DEUX'")"
CODE=$(appel PUT "/acteurs-informels/$DEUX/faits" "$T_A" "$(faits intermediaire false true false)")
chk "la commune requalifie : l'avertissement disparaît" "200|intermediaire|0" "$CODE|$(val "d['categorie']")|$(coherence avertissement)"
CODE=$(appel PUT "/acteurs-informels/$DEUX/faits" "$T_B" "$(faits pre_collecteur false false false)")
chk "l'admin d'une autre commune ne le requalifie pas (404)" 404 "$CODE"
CODE=$(appel PUT "/acteurs-informels/pas-un-uuid/faits" "$T_A" "$(faits pre_collecteur false false false)")
chk "un identifiant malformé : introuvable (404)" 404 "$CODE"

# -----------------------------------------------------------------------------
echo
echo "6. La démarche de formalisation : un ordre, des pièces, des dates"
d() { appel POST "/acteurs-informels/$UN/demarches" "${2:-$T_A}" "$1"; }
CODE=$(d "$(demarche en_accompagnement "$J30")")
chk "un accompagnement sans démarche entamée : refusé (409)" "409|1" "$CODE|$(val "int(d['error'][0].isupper())")"
CODE=$(d "$(demarche formalisee "$J30")")
chk "une formalisation sans démarche entamée : refusée (409)" 409 "$CODE"
CODE=$(d "$(demarche demarche_entamee "$J30")")
chk "une démarche entamée sans sa pièce : refusée (400)" "400|1" "$CODE|$(val "int('référence' in d['error'])")"
CODE=$(d "$(demarche interrompue "$J30" null '"abc"')")
chk "une interruption sans motif suffisant : refusée (400)" 400 "$CODE"
CODE=$(d "$(demarche demarche_entamee "$DEMAIN" '"TEST-REC-0001"')")
chk "une étape datée de demain : refusée (400)" 400 "$CODE"
CODE=$(d "$(demarche demarche_entamee "$J30" '"TEST-REC-0001"')" "$T_B")
chk "l'admin d'une autre commune n'y inscrit rien (404)" 404 "$CODE"
CODE=$(d "$(demarche demarche_entamee "$J30" '"TEST-REC-0001"')")
chk "démarche entamée, pièce citée : inscrite" "201|1" "$CODE|$(val "len(d)")"
CODE=$(d "$(demarche en_accompagnement "$J40")")
chk "une étape antérieure à la dernière : refusée (400), la date est dite" "400|1" "$CODE|$(val "int('/' in d['error'])")"
CODE=$(d "$(demarche en_accompagnement "$J20")")
chk "accompagnement : inscrit" "201|2" "$CODE|$(val "len(d)")"
CODE=$(d "$(demarche formalisee "$J10")")
FORMALISEE=$(val "[e['id'] for e in d if e['statut']=='formalisee'][0]")
chk "formalisée : inscrite" "201|3" "$CODE|$(val "len(d)")"
CODE=$(d "$(demarche interrompue "$J5" null '"TEST motif d’arrêt"')")
chk "plus rien après une démarche formalisée (409)" 409 "$CODE"
appel GET "/acteurs-informels?communeId=$TC" "$T_A" >/dev/null
chk "le registre montre la dernière étape et sa date" "formalisee|$J10" \
    "$(val "[a for a in d['acteurs'] if a['id']=='$UN'][0]['derniere_demarche']")|$(val "[a for a in d['acteurs'] if a['id']=='$UN'][0]['date_derniere_demarche']")"
chk "une étape ne se réécrit pas, même au super-utilisateur" 1 \
    "$(refus "UPDATE demarches_formalisation SET statut='interrompue', observation='TEST réécriture' WHERE id='$FORMALISEE';" DEMARCHE_FIGEE)"
chk "l'application n'a aucun droit de modifier ni d'effacer une étape" "false|false" \
    "$(sql "SELECT has_table_privilege('siipi_app','demarches_formalisation','UPDATE')||'|'||has_table_privilege('siipi_app','demarches_formalisation','DELETE')")"
CODE=$(appel GET "/acteurs-informels/$UN/demarches" "$T_B")
chk "l'admin d'une autre commune ne lit pas la démarche (404)" 404 "$CODE"
CODE=$(appel DELETE "/acteurs-informels/$UN/demarches/$FORMALISEE" "$T_B")
chk "… ni n'en retire une étape (404)" 404 "$CODE"
CODE=$(appel DELETE "/acteurs-informels/$UN/demarches/$FORMALISEE" "$T_A")
chk "la commune retire une étape saisie à tort (204)" 204 "$CODE"
chk "… retrait logique : l'étape reste en base, datée et imputée" "1|1" \
    "$(sql "SELECT count(*) FILTER (WHERE deleted_at IS NOT NULL)||'|'||count(*) FILTER (WHERE deleted_by IS NOT NULL) FROM demarches_formalisation WHERE id='$FORMALISEE'")"
CODE=$(d "$(demarche interrompue "$J5" null '"TEST motif d’arrêt"')")
chk "l'interruption, motivée, suit alors l'accompagnement" "201|3|interrompue" "$CODE|$(val "len(d)")|$(val "d[-1]['statut']")"
CODE=$(appel GET "/acteurs-informels/$UN/demarches" "$T_FNCT")
chk "la FNCT lit la démarche : trois étapes, la retirée n'y figure pas" "200|3|0" "$CODE|$(val "len(d)")|$(val "len([e for e in d if e['statut']=='formalisee'])")"

# -----------------------------------------------------------------------------
echo
echo "7. Le cadre suspendu : l'écriture se referme, la lecture demeure"
CODE=$(appel PUT /observatoire/cadre-secteur-informel "$T_FNCT" '{"actif":false}')
chk "la FNCT suspend le cadre" "200|False" "$CODE|$(val "d['actif']")"
CODE=$(appel POST "/acteurs-informels?communeId=$TC" "$T_A" "$(acteur pre_collecteur false false false)")
chk "inscrire : de nouveau refusé (409)" 409 "$CODE"
CODE=$(appel PUT "/acteurs-informels/$TROIS/faits" "$T_A" "$(faits pre_collecteur false false false)")
chk "requalifier : refusé (409)" 409 "$CODE"
CODE=$(appel POST "/acteurs-informels/$TROIS/demarches" "$T_A" "$(demarche demarche_entamee "$J5" '"TEST-REC-0002"')")
chk "inscrire une démarche : refusé (409)" 409 "$CODE"
CODE=$(appel GET "/acteurs-informels?communeId=$TC" "$T_A")
chk "le registre et ses démarches se lisent toujours" "200|False|4|interrompue" \
    "$CODE|$(val "d['cadre_actif']")|$(val "len(d['acteurs'])")|$(val "[a for a in d['acteurs'] if a['id']=='$UN'][0]['derniere_demarche']")"
chk "« À vérifier » ne parle plus d'un cadre qui n'est pas en vigueur" "0|0" "$(coherence avertissement)|$(coherence information)"

retablir
nettoyer
chk "la commune de test, ses acteurs et leurs démarches sont retirés" "0|0|0" \
    "$(sql "SELECT (SELECT count(*) FROM communes WHERE id='$TC')||'|'||(SELECT count(*) FROM barbechas WHERE commune_id='$TC' OR id_precollecteur LIKE 'TEST-ACT-%')||'|'||(SELECT count(*) FROM demarches_formalisation WHERE commune_id='$TC')")"
chk "le cadre est rendu dans l'état trouvé" "$CADRE_AVANT" \
    "$($PSQL -c "SELECT valeur||'|'||COALESCE(reference,'') FROM parametres_nationaux WHERE cle='cadre_secteur_informel_actif'")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
