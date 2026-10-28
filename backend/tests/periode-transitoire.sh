#!/usr/bin/env bash
# =============================================================================
# Lot I3 — la période transitoire du secteur informel (18.3 ; migration 093 ;
# décisions du 28/10/2026).
#
# Elle commence par ce que la plateforme REFUSE : une étape ou un agrément tant
# que le cadre est éteint ; une étape sans démarche entamée, antérieure à elle,
# datée de demain, hors de la liste nationale du jour de l'étape, inscrite deux
# fois ; un agrément pour un pré-collecteur, sans organisme, à l'échéance
# antérieure à la délivrance, délivré demain ; une étape ou un agrément réécrits ;
# toute écriture de la FNCT, d'un prestataire, du directeur d'une autre commune ;
# la vue nationale à un directeur.
#
# Puis les règles du lot :
#   - SANS DATE DE DÉPART, AUCUN ÉTAT ni aucun avis de période ; avec elle, les
#     états (peut exercer, formalisé, sans démarche) ; après la fin, « à
#     régulariser » — un avertissement, jamais un blocage ; la fin de la période
#     se vérifie contre un calcul de dates écrit ici ;
#   - la situation se rejoue à une date, sur les règles de cette date ;
#   - l'agrément est enregistré, jamais délivré : son échéance s'annonce 60 jours
#     avant, son expiration se signale, un écart avec la durée en vigueur à sa
#     délivrance se montre sans être corrigé ;
#   - un intermédiaire sans étalonnage après son échéance est signalé ;
#   - le bilan de la conversion (déclaré) est recalculé par un témoin
#     indépendant (periode_transitoire_attendus.py) : jour de Tunis, taux du
#     jour de chaque livraison, poids moyen d'un voyage pesé du même mois ;
#   - la FNCT ne voit aucun compte de 1 à 4 acteurs, ni dans la vue nationale,
#     ni dans le bilan d'une commune ; aucun rang.
#
# Communes et comptes de test seulement. Les tables nationales touchées
# (interrupteur, règles, redevance, listes) sont gardées avant le premier geste
# et rendues ligne entière en partant.
#
#   docker compose exec -T api npm run test:periode-transitoire
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
TEMOIN="$(dirname "$0")/periode_transitoire_attendus.py"

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

A=test_transition_a
B=test_transition_b
C=test_transition_c
ESSAI="'$A','$B','$C'"
REGLES="'informel_debut_periode_transitoire','informel_duree_periode_transitoire_mois','informel_delai_etalonnage_mois','informel_duree_agrement_mois','redevance_anged'"
T_FNCT=$(tok admin.national@siipi.tn)
[ -n "$T_FNCT" ] || { echo "API injoignable sur $API" >&2; exit 1; }
. "$(dirname "$0")/outils/comptes_temporaires.sh"
. "$(dirname "$0")/outils/communes_essai.sh"
. "$(dirname "$0")/outils/base_reelle.sh"
. "$(dirname "$0")/outils/tables_nationales.sh"
MOTIF_RETRAIT='TEST campagne periode-transitoire'
# Une valeur nationale retirée ne se « dé-retire » pas : la base l'interdit, et
# c'est voulu. Celles que la campagne a retirées le temps de son passage sont
# rendues ici, le déclencheur levé le temps d'une transaction, ses propres
# valeurs effacées d'abord ; rendre_tables_nationales fait le reste, ligne entière.
nettoyer() {
  $PSQL -c "DELETE FROM barbechas WHERE commune_id IN ($ESSAI) OR id_precollecteur LIKE 'TEST-TR-%';" >/dev/null 2>&1
  $PSQL -c "BEGIN;
            DELETE FROM valeurs_parametres_nationaux WHERE code IN ($REGLES) AND reference LIKE 'TEST %';
            ALTER TABLE valeurs_parametres_nationaux DISABLE TRIGGER trg_controler_valeur_parametre;
            UPDATE valeurs_parametres_nationaux SET retire_le = NULL, retire_par = NULL, motif_retrait = NULL
             WHERE motif_retrait = '$MOTIF_RETRAIT';
            ALTER TABLE valeurs_parametres_nationaux ENABLE TRIGGER trg_controler_valeur_parametre;
            COMMIT;" >/dev/null 2>&1
  effacer_communes_essai "$ESSAI"
}
nettoyer
trap 'nettoyer; retirer_comptes_temporaires; rm -rf "$T"' EXIT
garder_tables_nationales parametres_nationaux valeurs_parametres_nationaux elements_listes_nationales
rendre_tables_nationales_en_sortie
releve_base_reelle

commune_essai "$A" "TEST Commune de la transition"
commune_essai "$B" "TEST Autre commune de la transition"
commune_essai "$C" "TEST Commune sans acteur"
$PSQL -c "UPDATE communes SET gouvernorat = 'TEST-TR-G1' WHERE id = '$A';
          UPDATE communes SET gouvernorat = 'TEST-TR-G2' WHERE id IN ('$B', '$C');" >/dev/null
compte_temporaire admin_commune "$A" "Directeur de la transition"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$B" "Directeur de l'autre commune"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire gestionnaire_prestataire "$A" "Prestataire de la commune"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
J=$(sql "SELECT app.jour_tunis()")
jour() { sql "SELECT (app.jour_tunis() + $1)::text"; }
fr() { python3 -c "import datetime,sys;print(datetime.date.fromisoformat(sys.argv[1]).strftime('%d/%m/%Y'))" "$1"; }
fin() { python3 "$TEMOIN" fin "$1" "$2"; }
J400=$(jour -400); J30=$(jour -30); J25=$(jour -25); J20=$(jour -20); J18=$(jour -18); J15=$(jour -15)
J10=$(jour -10); J5=$(jour -5); J3=$(jour -3); J2=$(jour -2); J1=$(jour -1); DEMAIN=$(jour 1); J40=$(jour 40)

# Les règles de la campagne : les valeurs en vigueur des paramètres de l'article
# 13 et de la redevance sont retirées le temps de la campagne (rendues ligne
# entière en partant), puis celles de la campagne posées — sans date de départ.
$PSQL -c "UPDATE parametres_nationaux SET valeur = 'false', reference = NULL WHERE cle = 'cadre_secteur_informel_actif';
          UPDATE valeurs_parametres_nationaux SET retire_le = now(), motif_retrait = '$MOTIF_RETRAIT'
           WHERE code IN ($REGLES) AND retire_le IS NULL;
          INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_nombre, provisoire, reference) VALUES
            ('informel_duree_periode_transitoire_mois', '$J400', 36, false, 'TEST durée'),
            ('informel_delai_etalonnage_mois', '$J400', 6, false, 'TEST délai'),
            ('informel_duree_agrement_mois', '$J400', 24, false, 'TEST agrément'),
            ('redevance_anged', '2025-02-01', 6.516, true, 'TEST provisoire'),
            ('redevance_anged', '2025-04-01', 7, false, 'TEST barème');" >/dev/null
# Les acteurs et leurs démarches : posés en base, le cadre le temps de le faire
# (la catégorie et la démarche sont le lot 18.1, éprouvé par sa campagne).
$PSQL -c "UPDATE parametres_nationaux SET valeur = 'true', reference = 'TEST cadre' WHERE cle = 'cadre_secteur_informel_actif';
          INSERT INTO barbechas (id_precollecteur, zone, commune_id, categorie, dispose_local, achete_aux_pairs, faits_releves_le) VALUES
            ('TEST-TR-P1', 'TEST', '$A', 'pre_collecteur', false, false, '$J30'),
            ('TEST-TR-P2', 'TEST', '$A', 'pre_collecteur', false, false, '$J30'),
            ('TEST-TR-P3', 'TEST', '$A', 'pre_collecteur', false, false, '$J30'),
            ('TEST-TR-P4', 'TEST', '$A', 'pre_collecteur', false, false, '$J30'),
            ('TEST-TR-P5', 'TEST', '$A', 'pre_collecteur', false, false, '$J30'),
            ('TEST-TR-I1', 'TEST', '$A', 'intermediaire', true, true, '$J30'),
            ('TEST-TR-I2', 'TEST', '$A', 'intermediaire', true, true, '$J30'),
            ('TEST-TR-B1', 'TEST', '$B', 'pre_collecteur', false, false, '$J30'),
            ('TEST-TR-B2', 'TEST', '$B', 'pre_collecteur', false, false, '$J30');" >/dev/null
acteur() { sql "SELECT id FROM barbechas WHERE id_precollecteur = '$1'"; }
P1=$(acteur TEST-TR-P1); P2=$(acteur TEST-TR-P2); P3=$(acteur TEST-TR-P3); P4=$(acteur TEST-TR-P4); P5=$(acteur TEST-TR-P5)
I1=$(acteur TEST-TR-I1); I2=$(acteur TEST-TR-I2); B1=$(acteur TEST-TR-B1)
for X in "$P1" "$P2" "$P3" "$P4" "$I1" "$I2"; do
  $PSQL -c "INSERT INTO demarches_formalisation (commune_id, acteur_id, statut, date_statut, reference)
            VALUES ('$A', '$X', 'demarche_entamee', '$J20', 'TEST-RECEPISSE');" >/dev/null
done
$PSQL -c "INSERT INTO demarches_formalisation (commune_id, acteur_id, statut, date_statut) VALUES ('$A', '$P4', 'formalisee', '$J5');
          UPDATE parametres_nationaux SET valeur = 'false', reference = NULL WHERE cle = 'cadre_secteur_informel_actif';" >/dev/null
jalon() { # acteur code date [jeton] -> code HTTP
  appel POST "/periode-transitoire/acteurs/$1/jalons" "${4:-$T_A}" "{\"jalonCode\":\"$2\",\"dateJalon\":\"$3\",\"reference\":\"TEST-ATTESTATION\"}"
}
agrement() { # acteur référence délivrance échéance [jeton] [organisme] -> code HTTP
  appel POST "/periode-transitoire/acteurs/$1/agrements" "${5:-$T_A}" \
    "{\"organisme\":\"${6:-TEST Agence nationale}\",\"reference\":\"$2\",\"dateDelivrance\":\"$3\",\"dateEcheance\":\"$4\"}"
}
situation() { appel GET "/periode-transitoire?communeId=$A${1:+&date=$1}" "${2:-$T_A}"; }
etat() { val "[a['etat'] for a in d['acteurs'] if a['id_precollecteur']=='$1'][0]"; }
avis() { # début du constat -> nombre d'avis de la commune A qui commencent ainsi
  appel GET "/communes/$A/coherence" "$T_A" >/dev/null
  val "len([l for l in d if l['domaine']=='acteurs_informels' and l['constat'].startswith(\"$1\")])"
}
avis_ar() { # début du constat -> nombre de ces avis rendus aussi en arabe
  appel GET "/communes/$A/coherence" "$T_A" >/dev/null
  val "len([l for l in d if l['constat'].startswith(\"$1\") and l['constat_ar'] and l['quoi_faire_ar']])"
}

# -----------------------------------------------------------------------------
echo
echo "1. Cadre éteint : rien ne s'inscrit"
CODE=$(jalon "$P1" formation "$J15")
chk "une étape, le cadre éteint : refusée (409), le message dit pourquoi" "409|1" "$CODE|$(val "int('pas en vigueur' in d['error'])")"
chk "un agrément, le cadre éteint : refusé (409)" 409 "$(agrement "$I1" TEST-AG-000 "$J30" "$J40")"
chk "… et refusés par la base, même au super-utilisateur" "1|1" \
    "$(refus "INSERT INTO jalons_acteurs (commune_id, acteur_id, jalon_code, date_jalon) VALUES ('$A', '$P1', 'formation', '$J15');" CADRE_INACTIF)|$(refus "INSERT INTO agrements_intermediaires (commune_id, acteur_id, organisme, reference, date_delivrance, date_echeance) VALUES ('$A', '$I1', 'TEST org', 'X', '$J30', '$J40');" CADRE_INACTIF)"
CODE=$(situation)
chk "la situation se lit : cadre éteint, sept acteurs, aucun état sans date de départ" "200|False|7|7" \
    "$CODE|$(val "d['cadre_actif']")|$(val "len(d['acteurs'])")|$(val "d['etats']['date_depart_non_fixee']")"
$PSQL -c "UPDATE parametres_nationaux SET valeur = 'true', reference = 'TEST projet de décret — démonstration' WHERE cle = 'cadre_secteur_informel_actif';" >/dev/null

# -----------------------------------------------------------------------------
echo
echo "2. Les étapes d'accompagnement : ce que la plateforme refuse"
chk "la liste nationale des étapes porte « formation » et « etalonnage_instruments » aujourd'hui" 2 \
    "$(sql "SELECT count(*) FROM app.liste_nationale('jalons_accompagnement', '$J15') WHERE code IN ('formation', 'etalonnage_instruments')")"
CODE=$(jalon "$P5" formation "$J15")
chk "une étape pour un acteur sans démarche entamée : refusée (409)" "409|1" "$CODE|$(val "int('démarche entamée' in d['error'])")"
chk "une étape antérieure à la démarche entamée : refusée (409)" 409 "$(jalon "$P1" formation "$J25")"
chk "une étape hors de la liste nationale : refusée (400), le message le dit" "400|1" \
    "$(jalon "$P1" etape_inventee "$J15")|$(val "int('liste nationale' in d['error'])")"
chk "une étape datée de demain : refusée" 400 "$(jalon "$P1" formation "$DEMAIN")"
chk "la FNCT n'accompagne pas à la place de la commune" 403 "$(jalon "$P1" formation "$J15" "$T_FNCT")"
chk "un prestataire non plus" 403 "$(jalon "$P1" formation "$J15" "$T_P")"
chk "le directeur d'une autre commune : acteur introuvable" 404 "$(jalon "$P1" formation "$J15" "$T_B")"
chk "un acteur inconnu : introuvable" 404 "$(jalon "00000000-0000-0000-0000-000000000000" formation "$J15")"

echo
echo "3. Les étapes : la liste du jour de l'étape"
CODE=$(jalon "$P1" formation "$J15")
chk "la formation de P1, il y a 15 jours : inscrite, avec le libellé de la liste" "201|1|Formation" \
    "$CODE|$(val "len(d['jalons'])")|$(val "d['jalons'][0]['libelle_fr']")"
chk "la même étape deux fois : refusée (409)" 409 "$(jalon "$P1" formation "$J10")"
# Une étape ajoutée par la FNCT il y a cinq jours.
$PSQL -c "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, ordre, date_effet, provisoire, reference)
          VALUES ('jalons_accompagnement', 'test_jalon_recent', 'TEST Étape récente', 'TEST مرحلة', 70, '$J5', true, 'TEST circulaire');" >/dev/null
chk "une étape ajoutée il y a cinq jours ne vaut pas pour une étape d'il y a dix jours" 400 "$(jalon "$P1" test_jalon_recent "$J10")"
CODE=$(jalon "$P1" test_jalon_recent "$J2")
TJ=$(val "[j['id'] for j in d['jalons'] if j['jalon_code']=='test_jalon_recent'][0]")
chk "… elle vaut pour une étape d'avant-hier, et la liste du jour la propose" "201|2|1" \
    "$CODE|$(val "len(d['jalons'])")|$(val "len([x for x in d['jalons_possibles'] if x['code']=='test_jalon_recent'])")"
chk "une étape inscrite ne se réécrit pas, même au super-utilisateur" 1 \
    "$(refus "UPDATE jalons_acteurs SET date_jalon = '$J3' WHERE id = '$TJ';" JALON_FIGE)"
CODE=$(appel DELETE "/periode-transitoire/acteurs/$P1/jalons/$TJ" "$T_A")
chk "une étape saisie à tort se retire : il reste la formation" "200|1|formation" "$CODE|$(val "len(d['jalons'])")|$(val "d['jalons'][0]['jalon_code']")"
chk "… retirée, pas effacée" 1 "$(sql "SELECT count(*) FROM jalons_acteurs WHERE id = '$TJ' AND deleted_at IS NOT NULL")"
chk "l'étalonnage des instruments de I1, il y a trois jours : inscrit" 201 "$(jalon "$I1" etalonnage_instruments "$J3")"

# -----------------------------------------------------------------------------
echo
echo "4. Les agréments : ce que la plateforme refuse"
CODE=$(agrement "$P1" TEST-AG-000 "$J30" "$J40")
chk "un agrément pour un pré-collecteur : refusé (409)" "409|1" "$CODE|$(val "int('intermédiaire' in d['error'])")"
chk "une échéance qui ne suit pas la délivrance : refusée" 400 "$(agrement "$I1" TEST-AG-000 "$J30" "$J30")"
chk "un agrément délivré demain : refusé" 400 "$(agrement "$I1" TEST-AG-000 "$DEMAIN" "$J40")"
chk "un organisme non nommé : refusé" 400 "$(agrement "$I1" TEST-AG-000 "$J30" "$J40" "$T_A" "AB")"
chk "la FNCT n'enregistre pas d'agrément" 403 "$(agrement "$I1" TEST-AG-000 "$J30" "$J40" "$T_FNCT")"
chk "le directeur d'une autre commune : acteur introuvable" 404 "$(agrement "$I1" TEST-AG-000 "$J30" "$J40" "$T_B")"
chk "aucune route ne délivre un agrément : SIIPI enregistre celui d'un organisme" 0 \
    "$(curl -s "$API/openapi.json" | python3 -c "import sys,json;print(len([p for p in json.load(sys.stdin)['paths'] if 'agree' in p or 'delivrer' in p]))")"

echo
echo "5. Les agréments : l'échéance de la pièce, l'écart avec la durée en vigueur"
CODE=$(agrement "$I1" TEST-AG-001 "$J30" "$J40")
AG1=$(val "[g['id'] for g in d['agrements'] if g['reference']=='TEST-AG-001'][0]")
chk "l'agrément de I1, délivré il y a 30 jours, échéance dans 40 : enregistré tel quel" "201|$J40|24|$(fin "$J30" 24)" \
    "$CODE|$(val "d['agrements'][0]['date_echeance']")|$(val "d['agrements'][0]['duree_mois_en_vigueur']")|$(val "d['agrements'][0]['echeance_selon_duree']")"
chk "il ne se réécrit pas, même au super-utilisateur" 1 \
    "$(refus "UPDATE agrements_intermediaires SET date_echeance = '$J40'::date + 1 WHERE id = '$AG1';" AGREMENT_FIGE)"
chk "« À vérifier » annonce son échéance dans 40 jours, en français et en arabe" "1|1" \
    "$(avis "L'agrément TEST-AG-001 expire le $(fr "$J40")")|$(avis_ar "L'agrément TEST-AG-001 expire le")"
chk "… et l'écart avec la durée en vigueur à sa délivrance (24 mois), sans le corriger" "1|1|$J40" \
    "$(avis "L'agrément TEST-AG-001 court jusqu'au $(fr "$J40") ; la durée en vigueur à sa délivrance (24 mois) mène au $(fr "$(fin "$J30" 24)")")|$(avis_ar "L'agrément TEST-AG-001 court jusqu'au")|$(sql "SELECT date_echeance FROM agrements_intermediaires WHERE id = '$AG1'")"
CODE=$(agrement "$I2" TEST-AG-002 "$(jour -400)" "$J10")
AG2=$(val "[g['id'] for g in d['agrements'] if g['reference']=='TEST-AG-002'][0]")
chk "l'agrément de I2, expiré il y a 10 jours : signalé en avertissement, en arabe aussi" "201|1|1" \
    "$CODE|$(avis "L'agrément TEST-AG-002 a expiré le $(fr "$J10")")|$(avis_ar "L'agrément TEST-AG-002 a expiré")"
chk "… un agrément échu ne porte plus d'avis d'écart" 0 "$(avis "L'agrément TEST-AG-002 court")"
CODE=$(agrement "$I1" TEST-AG-003 "$J1" "$(fin "$J1" 24)")
chk "le renouvellement de I1, à la durée en vigueur : l'échéance de I1 ne s'annonce plus, aucun écart sur lui" "201|0|0|1" \
    "$CODE|$(avis "L'agrément TEST-AG-001 expire")|$(avis "L'agrément TEST-AG-003")|$(avis "L'agrément TEST-AG-001 court")"
CODE=$(appel DELETE "/periode-transitoire/acteurs/$I2/agrements/$AG2" "$T_A")
chk "un agrément saisi à tort se retire : son avis d'expiration disparaît" "200|0|0" \
    "$CODE|$(val "len(d['agrements'])")|$(avis "L'agrément TEST-AG-002")"

# -----------------------------------------------------------------------------
echo
echo "6. Sans date de départ, aucun état ; avec elle, l'état de chacun"
CODE=$(situation)
chk "aucune date de départ : aucun état, et le paramètre manquant est nommé" "200|7|1|None" \
    "$CODE|$(val "d['etats']['date_depart_non_fixee']")|$(val "int('informel_debut_periode_transitoire' in d['periode']['manque'])")|$(val "d['periode']['fin']")"
chk "… ni aucun avis de fin de période ou d'étalonnage" "0|0" "$(avis "La période transitoire")|$(avis "L'échéance d'étalonnage")"
DEBUT=$(jour -100)
$PSQL -c "INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_date, provisoire, reference)
          VALUES ('informel_debut_periode_transitoire', '$J400', '$DEBUT', false, 'TEST départ');" >/dev/null
CODE=$(situation)
chk "une date de départ il y a 100 jours : la fin est au bout de 36 mois, la veille (témoin de dates)" "200|$DEBUT|$(fin "$DEBUT" 36)" \
    "$CODE|$(val "d['periode']['debut']")|$(val "d['periode']['fin']")"
chk "P1, démarche entamée : peut exercer ; P4 : formalisé ; P5 : sans démarche" "peut_exercer|formalise|sans_demarche" \
    "$(etat TEST-TR-P1)|$(etat TEST-TR-P4)|$(etat TEST-TR-P5)"
chk "le décompte par état : 5 peuvent exercer, 1 formalisé, 1 sans démarche — ni total ni pourcentage" "5|1|1|0" \
    "$(val "d['etats']['peut_exercer']")|$(val "d['etats']['formalise']")|$(val "d['etats']['sans_demarche']")|$(val "int(any(k in d for k in ('total', 'pourcentage', 'taux')))")"
chk "P1 a franchi 1 étape de la liste en vigueur ; I1 a un agrément valable et son étalonnage ; I2 ni l'un ni l'autre" \
    "1|$(sql "SELECT count(*) FROM app.liste_nationale('jalons_accompagnement', '$J')")|True|True|False|False" \
    "$(val "[a['jalons_franchis'] for a in d['acteurs'] if a['id_precollecteur']=='TEST-TR-P1'][0]")|$(val "[a['jalons_en_vigueur'] for a in d['acteurs'] if a['id_precollecteur']=='TEST-TR-P1'][0]")|$(val "[a['agrement_valable'] for a in d['acteurs'] if a['id_precollecteur']=='TEST-TR-I1'][0]")|$(val "[a['etalonnage_enregistre'] for a in d['acteurs'] if a['id_precollecteur']=='TEST-TR-I1'][0]")|$(val "[a['agrement_valable'] for a in d['acteurs'] if a['id_precollecteur']=='TEST-TR-I2'][0]")|$(val "[a['etalonnage_enregistre'] for a in d['acteurs'] if a['id_precollecteur']=='TEST-TR-I2'][0]")"
chk "un pré-collecteur n'a ni agrément ni étalonnage à suivre (null, pas « non »)" "None|None" \
    "$(val "[a['agrement_valable'] for a in d['acteurs'] if a['id_precollecteur']=='TEST-TR-P1'][0]")|$(val "[a['etalonnage_enregistre'] for a in d['acteurs'] if a['id_precollecteur']=='TEST-TR-P1'][0]")"
chk "pendant la période, aucun avis « à régulariser »" 0 "$(avis "La période transitoire")"
CODE=$(situation "$J18")
chk "rejouée il y a 18 jours : P4 n'était pas encore formalisé, P1 n'avait franchi aucune étape" "200|$J18|peut_exercer|0" \
    "$CODE|$(val "d['jour']")|$(etat TEST-TR-P4)|$(val "[a['jalons_franchis'] for a in d['acteurs'] if a['id_precollecteur']=='TEST-TR-P1'][0]")"
CODE=$(situation "$(jour -25)")
chk "rejouée il y a 25 jours, avant toute démarche : P1 était sans démarche" "200|sans_demarche" "$CODE|$(etat TEST-TR-P1)"

echo
echo "7. Après la fin : à régulariser, signalé, jamais bloqué"
DEBUT2=$(jour -1200)
$PSQL -c "INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_date, provisoire, reference)
          VALUES ('informel_debut_periode_transitoire', '$J', '$DEBUT2', false, 'TEST départ ancien');" >/dev/null
FIN2=$(fin "$DEBUT2" 36)
CODE=$(situation)
chk "le départ fixé il y a 1200 jours : la période a pris fin le $FIN2" "200|$FIN2|1" "$CODE|$(val "d['periode']['fin']")|$(python3 -c "print(int('$FIN2' < '$J'))")"
chk "six acteurs à régulariser, P4 formalisé" "6|1|a_regulariser|formalise" \
    "$(val "d['etats']['a_regulariser']")|$(val "d['etats']['formalise']")|$(etat TEST-TR-P1)|$(etat TEST-TR-P4)"
chk "« À vérifier » : six avertissements, en arabe aussi ; aucun pour P4" "6|6|0" \
    "$(avis "La période transitoire a pris fin le $(fr "$FIN2")")|$(avis_ar "La période transitoire a pris fin")|$(val "len([l for l in d if l['sujet']=='TEST-TR-P4' and l['constat'].startswith('La période')])")"
chk "à régulariser n'est pas bloqué : une étape s'inscrit encore pour P2" 201 "$(jalon "$P2" formation "$J1")"
chk "l'échéance d'étalonnage (fin + 6 mois) n'est pas passée : aucun avis" 0 "$(avis "L'échéance d'étalonnage")"
$PSQL -c "INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_nombre, provisoire, reference)
          VALUES ('informel_delai_etalonnage_mois', '$J', 1, false, 'TEST délai d''un mois');" >/dev/null
FET=$(python3 -c "import calendar,datetime,sys
d=datetime.date.fromisoformat(sys.argv[1]); a,b=divmod(d.month,12); an,mo=d.year+a,b+1
print(datetime.date(an,mo,min(d.day,calendar.monthrange(an,mo)[1])))" "$FIN2")
chk "un délai d'un mois : l'échéance ($FET) est passée ; seul I2, sans étalonnage, est signalé" "1|1|TEST-TR-I2" \
    "$(avis "L'échéance d'étalonnage des instruments de pesée ($(fr "$FET")) est passée")|$(avis_ar "L'échéance d'étalonnage")|$(val "[l['sujet'] for l in d if l['constat'].startswith(\"L'échéance d'étalonnage\")][0]")"
CODE=$(situation "$J18")
chk "rejouée il y a 18 jours, sur les règles de ce jour-là : P1 pouvait exercer" "200|peut_exercer" "$CODE|$(etat TEST-TR-P1)"

# -----------------------------------------------------------------------------
echo
echo "8. Le bilan de la conversion, déclaré (témoin indépendant)"
# Les entrées : elles servent à inscrire les livraisons et les pesées, et le
# témoin ne lit qu'elles.
cat > "$T/entrees.json" <<'JSON'
{
  "taux": [
    {"date_effet": "2025-02-01", "valeur": 6.516, "provisoire": true},
    {"date_effet": "2025-04-01", "valeur": 7, "provisoire": false}
  ],
  "livraisons": [
    {"acteur": "TEST-TR-P1", "horodatage": "2024-12-31T23:30:00Z", "kg": 50},
    {"acteur": "TEST-TR-P1", "horodatage": "2025-01-15T10:00:00Z", "kg": 120},
    {"acteur": "TEST-TR-P1", "horodatage": "2025-03-10T09:00:00Z", "kg": 300},
    {"acteur": "TEST-TR-P2", "horodatage": "2025-03-20T09:00:00Z", "kg": 200},
    {"acteur": "TEST-TR-P3", "horodatage": "2025-03-31T23:30:00Z", "kg": 1000},
    {"acteur": "TEST-TR-P4", "horodatage": "2025-04-15T09:00:00Z", "kg": 500},
    {"acteur": "TEST-TR-P5", "horodatage": "2025-05-10T09:00:00Z", "kg": 2000},
    {"acteur": "TEST-TR-P5", "horodatage": "2025-05-12T09:00:00Z", "kg": 777, "retiree": true},
    {"acteur": "TEST-TR-P1", "horodatage": "2025-06-05T09:00:00Z", "kg": 100},
    {"acteur": "TEST-TR-P2", "horodatage": "2025-06-05T09:00:00Z", "kg": 100},
    {"acteur": "TEST-TR-P3", "horodatage": "2025-06-05T09:00:00Z", "kg": 100},
    {"acteur": "TEST-TR-P4", "horodatage": "2025-06-05T09:00:00Z", "kg": 100},
    {"acteur": "TEST-TR-P5", "horodatage": "2025-06-05T09:00:00Z", "kg": 100}
  ],
  "pesees": [
    {"jour": "2025-03-05", "circuit": true, "type": "menager", "kg": 4000},
    {"jour": "2025-03-06", "circuit": true, "type": "menager", "kg": 5000},
    {"jour": "2025-03-07", "circuit": true, "type": "vert", "kg": 9000},
    {"jour": "2025-03-08", "circuit": false, "type": "menager", "kg": 8000},
    {"jour": "2025-04-03", "circuit": true, "type": "menager", "kg": 3000},
    {"jour": "2025-04-04", "circuit": true, "type": "menager", "kg": 3000}
  ]
}
JSON
CIRCUIT=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage, actif) VALUES ('$A', 'TEST circuit de la transition', ARRAY[1]::smallint[], true) RETURNING id")
python3 - "$T/entrees.json" "$A" "$CIRCUIT" > "$T/entrees.sql" <<'PY'
import json, sys
e = json.load(open(sys.argv[1])); commune, circuit = sys.argv[2], sys.argv[3]
for l in e['livraisons']:
    print(f"INSERT INTO barbecha_deliveries (barbecha_id, delivered_at, material, weight_kg, amount_tnd, deleted_at) "
          f"SELECT id, '{l['horodatage']}', 'Carton', {l['kg']}, 0, {'now()' if l.get('retiree') else 'NULL'} "
          f"FROM barbechas WHERE id_precollecteur = '{l['acteur']}';")
for p in e['pesees']:
    if p['circuit']:
        print(f"INSERT INTO pesees (commune_id, date_pesee, circuit_id, vehicule_immat, type_dechet, poids_net_kg) "
              f"VALUES ('{commune}', '{p['jour']}', '{circuit}', 'TEST-123', '{p['type']}', {p['kg']});")
    else:
        print(f"INSERT INTO pesees (commune_id, date_pesee, vehicule_immat, type_dechet, poids_net_kg, observation) "
              f"VALUES ('{commune}', '{p['jour']}', 'TEST-123', '{p['type']}', {p['kg']}, 'TEST apport ponctuel');")
PY
$PSQL -f "$T/entrees.sql" >"$T/entrees.log" 2>&1
chk "les livraisons et les pesées de l'année 2025 sont inscrites" "13|6" \
    "$(sql "SELECT count(*) FROM barbecha_deliveries d JOIN barbechas b ON b.id = d.barbecha_id WHERE b.commune_id = '$A'")|$(sql "SELECT count(*) FROM pesees WHERE commune_id = '$A'")"
python3 "$TEMOIN" conversion "$T/entrees.json" 2025 > "$T/attendu.json"
CODE=$(appel GET "/periode-transitoire/conversion?communeId=$A&annee=2025" "$T_A")
cp "$T/r.json" "$T/conversion.json"
chk "le directeur lit le bilan 2025 : déclaré, cinq mois (un mois sans livraison n'a pas de ligne)" "200|declaree|1,3,4,5,6" \
    "$CODE|$(val "d['provenance']")|$(val "','.join(str(m['mois']) for m in d['mois'])")"
chk "chaque mois est celui du témoin indépendant (jour de Tunis, taux du jour, voyage pesé du mois)" 1 \
    "$(python3 -c "import json;a=json.load(open('$T/attendu.json'));d=json.load(open('$T/conversion.json'))['mois'];print(int(a==d))")"
chk "janvier : la livraison du 31/12 à 23 h 30 UTC compte en janvier ; avant tout taux, ses tonnes sont à part, sans montant" "2|0.17|0.17|None" \
    "$(val "d['mois'][0]['livraisons']")|$(val "d['mois'][0]['tonnes_detournees']")|$(val "d['mois'][0]['tonnes_sans_taux']")|$(val "d['mois'][0]['redevance_evitee_tnd']")"
chk "avril : la livraison du 31/03 à 23 h 30 UTC est au taux du 1er avril (7 TND/t), non provisoire" "10.5|[7.0]|False" \
    "$(val "d['mois'][2]['redevance_evitee_tnd']")|$(val "[float(x) for x in d['mois'][2]['taux_appliques']]")|$(val "d['mois'][2]['redevance_provisoire']")"
chk "mars : le voyage moyen ne retient que les pesées de circuit en ordures ménagères (4,5 t)" "2|4.5|0.1" \
    "$(val "d['mois'][1]['voyages_peses']")|$(val "d['mois'][1]['poids_moyen_voyage_t']")|$(val "d['mois'][1]['voyages_economises']")"
chk "mai : sans voyage pesé, les voyages économisés ne sont pas renseignés (null, pas 0)" "0|None|None" \
    "$(val "d['mois'][3]['voyages_peses']")|$(val "d['mois'][3]['poids_moyen_voyage_t']")|$(val "d['mois'][3]['voyages_economises']")"
chk "les tonnes détournées n'entrent pas dans le registre des pesées" 6 "$(sql "SELECT count(*) FROM pesees WHERE commune_id = '$A'")"
CODE=$(appel GET "/periode-transitoire/conversion?communeId=$A&annee=2025" "$T_FNCT")
chk "lu par la FNCT, un mois de moins de 5 acteurs est masqué ; juin (5 acteurs) se lit" "200|True,True,True,True,False|None|None|0.5|5" \
    "$CODE|$(val "','.join(str(m['masque']) for m in d['mois'])")|$(val "d['mois'][0]['tonnes_detournees']")|$(val "d['mois'][0]['acteurs']")|$(val "d['mois'][4]['tonnes_detournees']")|$(val "d['mois'][4]['acteurs']")"
chk "le directeur d'une autre commune : introuvable ; un prestataire : refusé" "404|403" \
    "$(appel GET "/periode-transitoire/conversion?communeId=$A&annee=2025" "$T_B")|$(appel GET "/periode-transitoire/conversion?communeId=$A&annee=2025" "$T_P")"
CODE=$(curl -s -o "$T/export.csv" -w '%{http_code}' "$API/periode-transitoire/conversion?communeId=$A&annee=2025&format=csv" -H "Authorization: Bearer $T_A")
chk "l'export CSV : le tableau des mois, la provenance déclarée dans ses en-têtes" "200|1|6" \
    "$CODE|$(grep -c 'Tonnes détournées (déclarées)' "$T/export.csv")|$(wc -l < "$T/export.csv" | tr -d ' ')"

# -----------------------------------------------------------------------------
echo
echo "9. La vue nationale : par gouvernorat, masquée sous 5, sans rang"
chk "un directeur ne lit pas la vue nationale" 403 "$(appel GET /periode-transitoire/national "$T_A")"
CODE=$(appel GET /periode-transitoire/national "$T_FNCT")
g() { val "[x['$2'] for x in d['gouvernorats'] if x['gouvernorat']=='$1'][0]"; }
chk "TEST-TR-G1 : 1 commune sur 1, 7 acteurs, 5 démarches en cours, aucune carte valable" "200|1|1|7|5|0" \
    "$CODE|$(g TEST-TR-G1 communes_avec_acteurs)|$(g TEST-TR-G1 communes)|$(g TEST-TR-G1 acteurs)|$(g TEST-TR-G1 demarches_en_cours)|$(g TEST-TR-G1 cartes_valables)"
chk "… 1 formalisé et 1 agrément valable : masqués et nommés comme tels" "None|None|['formalises', 'agrements_valables']" \
    "$(g TEST-TR-G1 formalises)|$(g TEST-TR-G1 agrements_valables)|$(g TEST-TR-G1 masques)"
chk "… aucune tonne livrée cette année : non renseigné, pas 0, et pas « masqué »" "None|0" \
    "$(g TEST-TR-G1 tonnes_detournees)|$(val "int('tonnes_detournees' in [x for x in d['gouvernorats'] if x['gouvernorat']=='TEST-TR-G1'][0]['masques'])")"
chk "TEST-TR-G2 : 1 commune sur 2 a des acteurs ; ses 2 acteurs sont masqués" "1|2|None|1" \
    "$(g TEST-TR-G2 communes_avec_acteurs)|$(g TEST-TR-G2 communes)|$(g TEST-TR-G2 acteurs)|$(val "int('acteurs' in [x for x in d['gouvernorats'] if x['gouvernorat']=='TEST-TR-G2'][0]['masques'])")"
chk "aucune ligne par commune, aucun rang ; l'ordre est alphabétique" "0|0|1" \
    "$(val "int(any('commune_id' in x or 'communeId' in x for x in d['gouvernorats']))")|$(val "int(any('rang' in x for x in d['gouvernorats']))")|$(val "int([x['gouvernorat'] for x in d['gouvernorats'] if x['gouvernorat'].startswith('TEST-TR')]==['TEST-TR-G1','TEST-TR-G2'])")"
CODE=$(appel GET "/periode-transitoire/national?date=2025-12-31" "$T_FNCT")
chk "au 31/12/2025 : les tonnes de 2025, livrées par 5 acteurs, se lisent — la somme du témoin" \
    "200|$(python3 -c "import json;print(round(sum(m['tonnes_detournees'] for m in json.load(open('$T/attendu.json'))),3))")" \
    "$CODE|$(g TEST-TR-G1 tonnes_detournees)"

# -----------------------------------------------------------------------------
echo
echo "10. Qui lit quoi"
CODE=$(situation "" "$T_FNCT")
chk "la FNCT lit la situation de la commune (pseudonymes seulement)" "200|7|0" \
    "$CODE|$(val "len(d['acteurs'])")|$(val "int(any(k in a for a in d['acteurs'] for k in ('nom', 'cin', 'nom_complet')))")"
chk "et l'accompagnement d'un acteur" "200|1" "$(appel GET "/periode-transitoire/acteurs/$I1" "$T_FNCT")|$(val "len(d['jalons'])")"
chk "le directeur d'une autre commune : introuvable ; un prestataire : refusé" "404|404|403" \
    "$(situation "" "$T_B")|$(appel GET "/periode-transitoire/acteurs/$I1" "$T_B")|$(situation "" "$T_P")"
chk "chaque étape et chaque agrément sont au journal d'audit, sous la commune" "t|t" \
    "$(sql "SELECT count(*) >= 4 FROM audit_log WHERE table_name = 'jalons_acteurs' AND commune_id = '$A'")|$(sql "SELECT count(*) >= 3 FROM audit_log WHERE table_name = 'agrements_intermediaires' AND commune_id = '$A'")"
chk "l'application ne peut ni réécrire ni effacer une étape ou un agrément" "f|f|f|f" \
    "$(sql "SELECT has_table_privilege('siipi_app', 'jalons_acteurs', 'UPDATE')")|$(sql "SELECT has_table_privilege('siipi_app', 'jalons_acteurs', 'DELETE')")|$(sql "SELECT has_table_privilege('siipi_app', 'agrements_intermediaires', 'UPDATE')")|$(sql "SELECT has_table_privilege('siipi_app', 'agrements_intermediaires', 'DELETE')")"

# -----------------------------------------------------------------------------
echo
echo "11. En partant"
base_reelle_intacte "pendant la campagne"
nettoyer
rendre_tables_nationales
tables_nationales_rendues "en partant"
chk "les communes de test, leurs acteurs, étapes et agréments sont retirés" "0|0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM barbechas WHERE id_precollecteur LIKE 'TEST-TR-%'")|$(sql "SELECT count(*) FROM jalons_acteurs WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM agrements_intermediaires WHERE commune_id IN ($ESSAI)")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s échecs.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
