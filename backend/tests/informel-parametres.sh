#!/usr/bin/env bash
# =============================================================================
# Lot I1 — les règles du secteur informel en paramètres nationaux (migration
# 091 ; décision du 28/10/2026 : on code 18.2 et 18.3 sans attendre l'article
# 13, et chaque règle légale est une donnée nationale datée, jamais du code).
#
# Elle commence par ce que la plateforme REFUSE : une commune qui règle une
# durée ou une liste ; une durée non entière, nulle ou démesurée ; une date
# donnée à un nombre, un nombre à une date ; un élément de liste sans libellé
# arabe, au code illisible, « officiel » sans son texte, en double, réécrit,
# effacé, fermé deux fois ou avant sa date d'effet.
#
# Puis la règle du lot : CHANGER UNE DONNÉE CHANGE LE RÉSULTAT, SANS CODE.
#   - la période transitoire n'a pas d'échéance tant que sa date de départ
#     manque (rien n'est inventé), en a une dès qu'elle est posée, et la suit
#     quand la durée change — à sa date d'effet seulement ;
#   - la validité d'une carte décidée aujourd'hui garde la durée d'aujourd'hui,
#     même quand une autre est publiée pour le mois prochain ;
#   - une pièce fermée cesse d'être exigée à sa date, et une demande d'avant
#     reste jugée sur la liste de son jour.
# Les échéances attendues viennent d'un calcul de dates écrit ici, en Python,
# indépendant de la base (ajout de mois au dernier jour du mois).
#
# Les valeurs de test sont datées de 2001 à 2003 ou de l'avenir proche, toutes
# référencées « TEST ». Les deux tables nationales touchées sont gardées avant
# le premier geste et rendues ligne entière en partant (tables_nationales.sh).
#
#   docker compose exec -T api npm run test:informel-parametres
# =============================================================================

set -u
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
. "$(dirname "$0")/outils/comptes_temporaires.sh"
. "$(dirname "$0")/outils/base_reelle.sh"
. "$(dirname "$0")/outils/tables_nationales.sh"
trap 'retirer_comptes_temporaires; rm -rf "$T"' EXIT
garder_tables_nationales valeurs_parametres_nationaux elements_listes_nationales
rendre_tables_nationales_en_sortie
releve_base_reelle

# Un directeur sans commune suffit : il ne lit et ne tente que des règles nationales.
compte_temporaire admin_commune "" "Directeur des règles du secteur informel"
T_D=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
J=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date")
PLUS30=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date + 30")
PLUS31=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date + 31")
valeur() { appel POST "/parametres-nationaux/$1" "$2" "$3"; }
element() { appel POST "/regles-informel/listes/$1" "$2" "$3"; }
# Le témoin des échéances : n mois ajoutés au jour dit, ramené au dernier jour
# du mois s'il n'existe pas (31 mars + 1 mois = 30 avril), comme le fait le
# calendrier civil ; puis la veille, pour le dernier jour d'une période.
temoin() { # debut duree delai -> fin|fin_etalonnage
  python3 - "$1" "$2" "$3" <<'PY'
import sys, calendar, datetime
d = datetime.date.fromisoformat(sys.argv[1]); n, m = int(sys.argv[2]), int(sys.argv[3])
def plus(x, mois):
    a, b = divmod(x.month - 1 + mois, 12)
    an, mo = x.year + a, b + 1
    return datetime.date(an, mo, min(x.day, calendar.monthrange(an, mo)[1]))
fin = plus(d, n) - datetime.timedelta(days=1)
print(f"{fin}|{plus(fin, m)}")
PY
}
# Une case vide pour une valeur absente : la position de chaque champ ne bouge pas.
periode() {
  sql "SELECT concat_ws('|', COALESCE(debut::text, ''), COALESCE(duree_mois::text, ''), COALESCE(fin::text, ''),
                        COALESCE(delai_etalonnage_mois::text, ''), COALESCE(fin_etalonnage::text, ''), provisoire,
                        array_to_string(manque, ','))
         FROM app.periode_transitoire('$1')"
}

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme refuse"
chk "une commune ne règle pas une durée du secteur informel" 403 \
    "$(valeur informel_validite_carte_mois "$T_D" '{"dateEffet":"2001-01-01","valeurNombre":18,"reference":"TEST"}')"
chk "une commune n'ajoute pas une pièce exigée" 403 \
    "$(element pieces_carte_precollecteur "$T_D" '{"code":"test_photo","libelleFr":"TEST","libelleAr":"TEST","dateEffet":"2001-01-01"}')"
chk "une validité de 12,5 mois : refusée, une durée se compte en mois entiers" "400|1" \
    "$(valeur informel_validite_carte_mois "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":12.5,"reference":"TEST"}')|$(val "int('entier' in d['error'])")"
chk "… et refusée par la base" 1 \
    "$(refus "INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_nombre, provisoire) VALUES ('informel_validite_carte_mois', '2001-01-01', 12.5, true);" PARAMETRE_ENTIER)"
chk "une période transitoire de 0 mois : hors bornes" 400 \
    "$(valeur informel_duree_periode_transitoire_mois "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":0,"reference":"TEST"}')"
chk "une période transitoire de 121 mois : hors bornes" 400 \
    "$(valeur informel_duree_periode_transitoire_mois "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":121,"reference":"TEST"}')"
chk "un délai d'étalonnage de 61 mois : hors bornes" 400 \
    "$(valeur informel_delai_etalonnage_mois "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":61,"reference":"TEST"}')"
chk "une date de départ donnée en nombre : refusée" 400 \
    "$(valeur informel_debut_periode_transitoire "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":2027,"reference":"TEST"}')"
chk "une durée donnée en date : refusée" 400 \
    "$(valeur informel_validite_carte_mois "$T_FNCT" '{"dateEffet":"2001-01-01","valeurDate":"2027-01-01","reference":"TEST"}')"
chk "une date de départ d'avant 2000 : refusée" 400 \
    "$(valeur informel_debut_periode_transitoire "$T_FNCT" '{"dateEffet":"2001-01-01","valeurDate":"1999-12-31","reference":"TEST"}')"
chk "une date de départ « officielle » sans son texte : refusée" 400 \
    "$(valeur informel_debut_periode_transitoire "$T_FNCT" '{"dateEffet":"2001-01-01","valeurDate":"2002-01-01","provisoire":false}')"
chk "une liste inconnue : introuvable" 404 \
    "$(element pieces_inventees "$T_FNCT" '{"code":"test_photo","libelleFr":"TEST","libelleAr":"TEST","dateEffet":"2001-01-01"}')"
chk "un code illisible (majuscules, espace, accent) : refusé" 400 \
    "$(element pieces_carte_precollecteur "$T_FNCT" '{"code":"Photo identité","libelleFr":"TEST","libelleAr":"TEST","dateEffet":"2001-01-01"}')"
chk "un élément sans libellé arabe : refusé" 400 \
    "$(element pieces_carte_precollecteur "$T_FNCT" '{"code":"test_photo","libelleFr":"TEST Photo","libelleAr":" ","dateEffet":"2001-01-01"}')"
chk "un élément « officiel » sans son texte : refusé" 400 \
    "$(element pieces_carte_precollecteur "$T_FNCT" '{"code":"test_photo","libelleFr":"TEST","libelleAr":"TEST","dateEffet":"2001-01-01","provisoire":false}')"
chk "une pièce déjà en vigueur, ajoutée une seconde fois : refusée (409)" 409 \
    "$(element pieces_carte_precollecteur "$T_FNCT" '{"code":"declaration_activite_simplifiee","libelleFr":"TEST","libelleAr":"TEST","dateEffet":"2001-01-01","reference":"TEST"}')"
chk "un élément ne naît pas fermé ni retiré (base)" 1 \
    "$(refus "INSERT INTO elements_listes_nationales (liste, code, libelle_fr, libelle_ar, date_effet, date_fin, reference_fin, reference) VALUES ('jalons_accompagnement', 'test_ne', 'TEST', 'TEST', '2001-01-01', '2002-01-01', 'TEST fin', 'TEST');" ELEMENT_NAISSANCE)"
chk "l'application ne peut pas effacer un élément de liste" "f|f" \
    "$(sql "SELECT has_table_privilege('siipi_app', 'elements_listes_nationales', 'DELETE')")|$(sql "SELECT has_column_privilege('siipi_app', 'elements_listes_nationales', 'libelle_fr', 'UPDATE')")"

# -----------------------------------------------------------------------------
echo
echo "2. Ce que la migration pose : le projet, provisoire, et rien de plus"
chk "les quatre durées du projet : 12, 24, 36 et 6 mois, provisoires, rattachées au projet" "12|24|36|6|4" \
    "$(sql "SELECT string_agg(valeur_nombre::int::text, '|' ORDER BY d.ordre) || '|' || count(*) FILTER (WHERE v.provisoire AND v.reference LIKE 'Projet de décret%')
              FROM valeurs_parametres_nationaux v JOIN definitions_parametres_nationaux d USING (code)
             WHERE v.code LIKE 'informel_%' AND v.date_effet = '2026-09-30' AND v.reference LIKE 'Projet de décret%'")"
chk "aucune date de départ posée par la migration : le projet ne la donne pas" 0 \
    "$(sql "SELECT count(*) FROM valeurs_parametres_nationaux WHERE code = 'informel_debut_periode_transitoire' AND reference LIKE 'Projet de décret%'")"
chk "les trois pièces et les six étapes du projet, provisoires" "3|6" \
    "$(sql "SELECT count(*) FILTER (WHERE liste = 'pieces_carte_precollecteur') || '|' || count(*) FILTER (WHERE liste = 'jalons_accompagnement')
              FROM elements_listes_nationales WHERE provisoire AND reference LIKE 'Projet de décret%' AND date_effet = '2026-09-30'")"
CODE=$(appel GET /parametres-nationaux "$T_D")
chk "une commune lit les règles : rubrique, nature et entier sont dits" "200|secteur_informel|date|True" \
    "$CODE|$(val "[p for p in d if p['code']=='informel_debut_periode_transitoire'][0]['rubrique']")|$(val "[p for p in d if p['code']=='informel_debut_periode_transitoire'][0]['nature']")|$(val "[p for p in d if p['code']=='informel_validite_carte_mois'][0]['entier']")"
CODE=$(appel GET /regles-informel "$T_D")
chk "une commune lit la période et les listes" "200|2" "$CODE|$(val "len(d['listes'])")"
chk "la période rendue par l'API est celle que la base calcule pour ce jour" \
    "$(periode "$J")" \
    "$(val "'|'.join(['' if d['periode'][k] is None else str(d['periode'][k]) for k in ('debut','duree_mois','fin','delai_etalonnage_mois','fin_etalonnage')] + ['t' if d['periode']['provisoire'] else 'f', ','.join(d['periode']['manque'])])")"
# Cette vérification compare deux rendus ; la suivante fixe le sens de l'absence.
NB_DEBUT=$(sql "SELECT count(*) FROM app.parametre_national('informel_debut_periode_transitoire', '$J'::date)")
chk "sans date de départ, aucune échéance : « fin » est null et la date manquante est nommée" \
    "$([ "$NB_DEBUT" = 0 ] && echo 'None|None|True' || echo 'date|date|False')" \
    "$(val "('None' if d['periode']['fin'] is None else 'date') + '|' + ('None' if d['periode']['fin_etalonnage'] is None else 'date') + '|' + str('informel_debut_periode_transitoire' in d['periode']['manque'])")"

# -----------------------------------------------------------------------------
echo
echo "3. La période transitoire suit ses paramètres, à leur date d'effet"
# Un jeu de 2001 à 2003, bien avant tout ce que la base porte.
chk "en 2001, rien n'est posé : ni départ, ni durée, ni délai — trois manques nommés, aucune échéance" \
    "|||||f|informel_debut_periode_transitoire,informel_duree_periode_transitoire_mois,informel_delai_etalonnage_mois" \
    "$(periode 2001-06-01)"
valeur informel_duree_periode_transitoire_mois "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":36,"provisoire":false,"reference":"TEST texte 2001"}' >/dev/null
valeur informel_delai_etalonnage_mois "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":6,"provisoire":false,"reference":"TEST texte 2001"}' >/dev/null
chk "la durée et le délai posés, sans date de départ : toujours aucune échéance" "||f|informel_debut_periode_transitoire" \
    "$(sql "SELECT concat_ws('|', COALESCE(fin::text, ''), COALESCE(fin_etalonnage::text, ''), provisoire, array_to_string(manque, ',')) FROM app.periode_transitoire('2001-06-01')")"
CODE=$(valeur informel_debut_periode_transitoire "$T_FNCT" '{"dateEffet":"2001-03-01","valeurDate":"2002-03-31","provisoire":false,"reference":"TEST arrêté de départ"}')
chk "la date de départ s'enregistre comme une date" "201|2002-03-31|None" "$CODE|$(val "d['valeur_date']")|$(val "d['valeur_nombre']")"
chk "avant la date d'effet de la date de départ, elle ne s'applique pas encore" informel_debut_periode_transitoire \
    "$(sql "SELECT array_to_string(manque, ',') FROM app.periode_transitoire('2001-02-28')")"
chk "le 31 mars 2002 + 36 mois, la veille ; puis 6 mois : le témoin et la base s'accordent" \
    "2002-03-31|36|$(temoin 2002-03-31 36 6 | cut -d'|' -f1)|6|$(temoin 2002-03-31 36 6 | cut -d'|' -f2)|f|" \
    "$(periode 2001-06-01)"
valeur informel_duree_periode_transitoire_mois "$T_FNCT" '{"dateEffet":"2001-09-01","valeurNombre":48,"provisoire":true,"reference":"TEST projet d’allongement"}' >/dev/null
chk "la durée allongée à 48 mois au 1er septembre 2001 : l'échéance suit, sans code" \
    "2002-03-31|48|$(temoin 2002-03-31 48 6 | cut -d'|' -f1)|6|$(temoin 2002-03-31 48 6 | cut -d'|' -f2)|t|" \
    "$(periode 2001-10-01)"
chk "… et seulement à partir de sa date d'effet : en juin 2001, 36 mois" "$(temoin 2002-03-31 36 6 | cut -d'|' -f1)" \
    "$(sql "SELECT fin FROM app.periode_transitoire('2001-06-01')")"
chk "une règle provisoire rend la période provisoire" t "$(sql "SELECT provisoire FROM app.periode_transitoire('2001-10-01')")"
chk "une valeur nationale ne se réécrit pas (base)" 1 \
    "$(refus "UPDATE valeurs_parametres_nationaux SET valeur_date = '2003-01-01' WHERE code = 'informel_debut_periode_transitoire' AND reference = 'TEST arrêté de départ';" PARAMETRE_FIGE)"

# -----------------------------------------------------------------------------
echo
echo "4. La validité d'une carte : la durée du jour de la décision"
AVANT=$(sql "SELECT valeur_nombre::int FROM app.parametre_national('informel_validite_carte_mois', '$J'::date)")
CODE=$(valeur informel_validite_carte_mois "$T_FNCT" "{\"dateEffet\":\"$PLUS30\",\"valeurNombre\":18,\"reference\":\"TEST validité allongée\"}")
chk "une validité de 18 mois publiée pour dans 30 jours" 201 "$CODE"
chk "une carte décidée aujourd'hui garde la durée d'aujourd'hui ; dans 30 jours, 18 mois" "${AVANT:-aucune}|18" \
    "$(sql "SELECT COALESCE((SELECT valeur_nombre::int::text FROM app.parametre_national('informel_validite_carte_mois', '$J'::date)), 'aucune')")|$(sql "SELECT valeur_nombre::int FROM app.parametre_national('informel_validite_carte_mois', '$PLUS30'::date)")"
appel GET /parametres-nationaux "$T_D" >/dev/null
chk "l'écran la montre « à venir », pas « en vigueur »" "18|${AVANT:-None}" \
    "$(val "[p for p in d if p['code']=='informel_validite_carte_mois'][0]['a_venir'][0]['valeur_nombre']" | cut -d. -f1)|$(val "int([p for p in d if p['code']=='informel_validite_carte_mois'][0]['en_vigueur']['valeur_nombre'])")"

# -----------------------------------------------------------------------------
echo
echo "5. Les listes datées : ajouter, fermer, retirer"
CODE=$(element pieces_carte_precollecteur "$T_FNCT" '{"code":"test_photo_identite","libelleFr":"TEST Photo d’identité","libelleAr":"TEST صورة شمسية","ordre":40,"dateEffet":"2001-01-01","reference":"TEST circulaire 2001"}')
ID_A=$(val "d['id']")
chk "une pièce ajoutée au 1er janvier 2001, provisoire par défaut" "201|True" "$CODE|$(val "d['provisoire']")"
chk "exigée à partir de sa date, pas la veille" "1|0" \
    "$(sql "SELECT count(*) FROM app.liste_nationale('pieces_carte_precollecteur', '2001-06-01') WHERE code = 'test_photo_identite'")|$(sql "SELECT count(*) FROM app.liste_nationale('pieces_carte_precollecteur', '2000-12-31') WHERE code = 'test_photo_identite'")"
chk "une fin sans texte : refusée" 400 \
    "$(appel POST "/regles-informel/elements/$ID_A/fin" "$T_FNCT" '{"dateFin":"2002-01-01","reference":"x"}')"
chk "une fin qui précède la date d'effet : refusée" 400 \
    "$(appel POST "/regles-informel/elements/$ID_A/fin" "$T_FNCT" '{"dateFin":"2000-06-01","reference":"TEST texte abrogatif"}')"
chk "une commune ne ferme pas un élément" 403 \
    "$(appel POST "/regles-informel/elements/$ID_A/fin" "$T_D" '{"dateFin":"2002-01-01","reference":"TEST texte abrogatif"}')"
CODE=$(appel POST "/regles-informel/elements/$ID_A/fin" "$T_FNCT" '{"dateFin":"2002-01-01","reference":"TEST texte abrogatif 2002"}')
chk "la pièce cesse d'être exigée au 1er janvier 2002, avec son texte" "200|2002-01-01" "$CODE|$(val "d['date_fin']")"
chk "une demande de décembre 2001 reste jugée sur la liste de son jour ; une de janvier 2002, non" "1|0" \
    "$(sql "SELECT count(*) FROM app.liste_nationale('pieces_carte_precollecteur', '2001-12-31') WHERE code = 'test_photo_identite'")|$(sql "SELECT count(*) FROM app.liste_nationale('pieces_carte_precollecteur', '2002-01-01') WHERE code = 'test_photo_identite'")"
chk "une fin se fixe une fois (409)" 409 \
    "$(appel POST "/regles-informel/elements/$ID_A/fin" "$T_FNCT" '{"dateFin":"2003-01-01","reference":"TEST autre texte"}')"
chk "un élément ne se réécrit pas (base)" 1 \
    "$(refus "UPDATE elements_listes_nationales SET libelle_fr = 'TEST réécrit' WHERE id = '$ID_A';" ELEMENT_FIGE)"
CODE=$(element pieces_carte_precollecteur "$T_FNCT" '{"code":"test_photo_identite","libelleFr":"TEST Photo d’identité","libelleAr":"TEST صورة شمسية","ordre":40,"dateEffet":"2003-01-01","reference":"TEST circulaire 2003"}')
chk "la même pièce exigée de nouveau en 2003 : une nouvelle ligne, l'ancienne reste" "201|2" \
    "$CODE|$(sql "SELECT count(*) FROM elements_listes_nationales WHERE code = 'test_photo_identite'")"
CODE=$(element jalons_accompagnement "$T_FNCT" "{\"code\":\"test_tutorat\",\"libelleFr\":\"TEST Tutorat\",\"libelleAr\":\"TEST تأطير\",\"dateEffet\":\"$PLUS30\",\"reference\":\"TEST\"}")
ID_B=$(val "d['id']")
chk "une étape publiée pour dans 30 jours" 201 "$CODE"
appel GET /regles-informel "$T_D" >/dev/null
etat() { val "[e['etat'] for l in d['listes'] for e in l['elements'] if e['id']=='$1'][0]"; }
chk "les états du jour : fermée, en vigueur, à venir" "ferme|en_vigueur|a_venir" \
    "$(etat "$ID_A")|$(val "[e['etat'] for l in d['listes'] for e in l['elements'] if e['code']=='test_photo_identite' and e['date_fin'] is None][0]")|$(etat "$ID_B")"
chk "un retrait sans motif : refusé" 400 \
    "$(appel POST "/regles-informel/elements/$ID_B/retrait" "$T_FNCT" '{"motif":"non"}')"
CODE=$(appel POST "/regles-informel/elements/$ID_B/retrait" "$T_FNCT" '{"motif":"TEST saisie à tort"}')
chk "l'étape saisie à tort se retire, avec son motif" "200|TEST saisie à tort" "$CODE|$(val "d['motif_retrait']")"
appel GET /regles-informel "$T_D" >/dev/null
chk "elle reste lisible, « retirée », et ne s'applique à aucune date" "retire|0" \
    "$(etat "$ID_B")|$(sql "SELECT count(*) FROM app.liste_nationale('jalons_accompagnement', '$PLUS31') WHERE code = 'test_tutorat'")"
chk "un second retrait : introuvable" 404 \
    "$(appel POST "/regles-informel/elements/$ID_B/retrait" "$T_FNCT" '{"motif":"TEST encore"}')"
chk "un élément inconnu : introuvable" 404 \
    "$(appel POST "/regles-informel/elements/00000000-0000-0000-0000-000000000000/fin" "$T_FNCT" '{"dateFin":"2002-01-01","reference":"TEST texte"}')"
chk "chaque geste sur les listes est au journal d'audit" 4 \
    "$(sql "SELECT count(*) FROM audit_log WHERE table_name = 'elements_listes_nationales' AND record_id IN ('$ID_A', '$ID_B')")"

# -----------------------------------------------------------------------------
echo
echo "6. En partant"
base_reelle_intacte "pendant la campagne"
rendre_tables_nationales
tables_nationales_rendues "en partant"
chk "aucune valeur ni aucun élément de test ne reste" "0|0" \
    "$(sql "SELECT count(*) FROM valeurs_parametres_nationaux WHERE reference LIKE 'TEST%'")|$(sql "SELECT count(*) FROM elements_listes_nationales WHERE reference LIKE 'TEST%'")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s échecs.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
