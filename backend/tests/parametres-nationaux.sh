#!/usr/bin/env bash
# =============================================================================
# Lot 17.3 — les paramètres nationaux historisés (migration 060).
#
# Elle commence par ce que la plateforme REFUSE : une commune qui fixe un
# paramètre national ; une valeur « officielle » sans la pièce qui la fonde ;
# un texte sans sa version arabe, un nombre hors bornes, une date d'avant 2000,
# deux valeurs à la même date ; une valeur réécrite, effacée, ou retirée sans
# motif. Puis l'historique : la valeur en vigueur, celle qui attend sa date,
# celle qu'on retire ; et la règle du lot — la redevance ANGeD appliquée au
# taux EN VIGUEUR À LA DATE DE LA PESÉE, pas à celui du jour du calcul.
#
# Les valeurs de test sont datées de 2001, bien avant la valeur de référence
# des PCGD (2025), et portent toutes une référence « TEST » : la campagne les
# efface en partant, avec sa commune de test. La valeur provisoire posée par
# la migration n'est jamais touchée.
#
#   docker compose exec -T api npm run test:parametres-nationaux
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
TC=test_parametres_173

nettoyer() {
  $PSQL -c "DELETE FROM valeurs_parametres_nationaux WHERE reference LIKE 'TEST%';
            DELETE FROM communes WHERE id = '$TC';" >/dev/null 2>&1
}
nettoyer
$PSQL -c "INSERT INTO communes (id, name, name_ar, gouvernorat, population) VALUES ('$TC', 'TEST commune paramètres', 'TEST', 'TEST', 1);
          INSERT INTO utilisateur_communes (user_id, commune_id) VALUES ('$ID_A', '$TC');
          INSERT INTO pesees (commune_id, date_pesee, poids_net_kg, vehicule_immat, observation) VALUES
            ('$TC', '2000-12-15', 1000, 'TEST 173', 'TEST apport'),
            ('$TC', '2001-03-10', 2000, 'TEST 173', 'TEST apport'),
            ('$TC', '2001-06-01', 3000, 'TEST 173', 'TEST apport'),
            ('$TC', '2001-06-20', 1500, 'TEST 173', 'TEST apport');" >/dev/null
T_A=$(tok "$DIR_A")
J=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date")
PLUS30=$(sql "SELECT (now() AT TIME ZONE 'Africa/Tunis')::date + 30")
valeur() { # code jeton corps
  appel POST "/parametres-nationaux/$1" "$2" "$3"
}
param() { val "[p for p in d if p['code']=='$1'][0]$2"; }

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la plateforme refuse"
chk "une commune ne fixe pas un paramètre national" 403 \
    "$(valeur redevance_anged "$T_A" '{"dateEffet":"2001-01-01","valeurNombre":5,"provisoire":false,"reference":"TEST"}')"
chk "une valeur officielle sans la pièce qui la fonde : refusée" 400 \
    "$(valeur redevance_anged "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":5,"provisoire":false}')"
chk "… et refusée par la base" 1 \
    "$(refus "INSERT INTO valeurs_parametres_nationaux (code, date_effet, valeur_nombre, provisoire) VALUES ('redevance_anged', '2001-01-01', 5, false);" valeurs_officielle_referencee)"
chk "la redevance attend un nombre, pas un texte" 400 \
    "$(valeur redevance_anged "$T_FNCT" '{"dateEffet":"2001-01-01","valeurFr":"cinq dinars","reference":"TEST"}')"
chk "une redevance nulle : hors bornes" 400 \
    "$(valeur redevance_anged "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":0,"reference":"TEST"}')"
chk "une redevance de 5 000 TND/t : hors bornes" 400 \
    "$(valeur redevance_anged "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":5000,"reference":"TEST"}')"
chk "un intitulé sans sa version arabe : refusé" 400 \
    "$(valeur ministere_tutelle "$T_FNCT" '{"dateEffet":"2001-01-01","valeurFr":"TEST Ministère","reference":"TEST"}')"
chk "une date d'effet d'avant 2000 : refusée" 400 \
    "$(valeur redevance_anged "$T_FNCT" '{"dateEffet":"1999-12-31","valeurNombre":5,"reference":"TEST"}')"
chk "un paramètre inconnu : introuvable" 404 \
    "$(valeur tva "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":5,"reference":"TEST"}')"

# -----------------------------------------------------------------------------
echo
echo "2. L'historique : une valeur ne se réécrit pas, elle s'ajoute"
CODE=$(appel GET /parametres-nationaux "$T_A")
chk "une commune lit les paramètres nationaux" 200 "$CODE"
chk "la redevance en vigueur : la valeur de référence des PCGD, provisoire" "6.516|True" \
    "$(param redevance_anged "['en_vigueur']['valeur_nombre']")|$(param redevance_anged "['en_vigueur']['provisoire']")"
chk "aucun ministère de tutelle saisi : null, pas un intitulé inventé" None "$(param ministere_tutelle "['en_vigueur']")"
CODE=$(valeur redevance_anged "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":5,"provisoire":false,"reference":"TEST barème 2001"}')
TAUX_A=$(val "d['id']")
chk "une valeur officielle, datée, avec sa pièce" "201|5|False" "$CODE|$(val "d['valeur_nombre']")|$(val "d['provisoire']")"
chk "une seconde valeur à la même date : refusée (409)" 409 \
    "$(valeur redevance_anged "$T_FNCT" '{"dateEffet":"2001-01-01","valeurNombre":6,"reference":"TEST doublon"}')"
valeur redevance_anged "$T_FNCT" '{"dateEffet":"2001-06-01","valeurNombre":8,"provisoire":false,"reference":"TEST barème juin 2001"}' >/dev/null
TAUX_B=$(val "d['id']")
chk "une valeur ne se réécrit pas, même en base" 1 \
    "$(refus "UPDATE valeurs_parametres_nationaux SET valeur_nombre = 9 WHERE id = '$TAUX_A';" PARAMETRE_FIGE)"
chk "… et l'application n'a aucun droit de l'effacer" 1 \
    "$(refus "SET ROLE siipi_app; DELETE FROM valeurs_parametres_nationaux WHERE id = '$TAUX_A';" 'permission denied')"
CODE=$(valeur redevance_anged "$T_FNCT" "{\"dateEffet\":\"$PLUS30\",\"valeurNombre\":7.25,\"provisoire\":false,\"reference\":\"TEST barème à venir\"}")
FUTUR=$(val "d['id']")
chk "un barème publié d'avance : accepté" 201 "$CODE"
appel GET /parametres-nationaux "$T_A" >/dev/null
chk "… il attend sa date : la valeur en vigueur reste 6,516, la nouvelle est « à venir »" "6.516|7.25" \
    "$(param redevance_anged "['en_vigueur']['valeur_nombre']")|$(param redevance_anged "['a_venir'][0]['valeur_nombre']")"
chk "un intitulé bilingue s'enregistre" 201 \
    "$(valeur ministere_tutelle "$T_FNCT" "{\"dateEffet\":\"$J\",\"valeurFr\":\"TEST Ministère de tutelle\",\"valeurAr\":\"TEST وزارة\",\"reference\":\"TEST intitulé\"}")"
TUTELLE=$(val "d['id']")
appel GET /parametres-nationaux "$T_A" >/dev/null
chk "… et il est en vigueur dès sa date" "TEST Ministère de tutelle|provisoire=True" \
    "$(param ministere_tutelle "['en_vigueur']['valeur_fr']")|provisoire=$(param ministere_tutelle "['en_vigueur']['provisoire']")"
chk "une commune ne retire pas une valeur nationale" 403 \
    "$(appel POST "/parametres-nationaux/valeurs/$TUTELLE/retrait" "$T_A" '{"motif":"TEST retrait"}')"
chk "un retrait sans motif : refusé" 400 \
    "$(appel POST "/parametres-nationaux/valeurs/$TUTELLE/retrait" "$T_FNCT" '{"motif":""}')"
CODE=$(appel POST "/parametres-nationaux/valeurs/$TUTELLE/retrait" "$T_FNCT" '{"motif":"TEST saisi à tort"}')
chk "retirée avec son motif" "200|TEST saisi à tort" "$CODE|$(val "d['motif_retrait']")"
appel GET /parametres-nationaux "$T_A" >/dev/null
chk "… plus rien n'est en vigueur, mais la valeur reste lisible dans l'historique" "None|1" \
    "$(param ministere_tutelle "['en_vigueur']")|$(param ministere_tutelle "['historique'].__len__()")"
chk "une valeur retirée ne se retire pas deux fois" 404 \
    "$(appel POST "/parametres-nationaux/valeurs/$TUTELLE/retrait" "$T_FNCT" '{"motif":"TEST encore"}')"
appel POST "/parametres-nationaux/valeurs/$FUTUR/retrait" "$T_FNCT" '{"motif":"TEST barème à venir annulé"}' >/dev/null

# -----------------------------------------------------------------------------
echo
echo "3. La redevance au taux de la date de chaque pesée"
# Taux : 5 TND/t du 1er janvier 2001, 8 TND/t du 1er juin 2001.
# Mars 2001 : 2 t × 5 = 10. Juin 2001 : 3 t (le 1er, jour d'effet) + 1,5 t,
# toutes à 8 → 36. Au taux du jour (6,516), juin vaudrait 29,322 ; au taux de
# fin de période, mars vaudrait 16. Décembre 2000 : aucun taux ne s'applique.
mois() { val "[m for m in d if m['mois']==$1][0]['$2']"; }
CODE=$(appel GET "/pesees/redevance?communeId=$TC&annee=2001" "$T_A")
chk "mars 2001 : 2 t à 5 TND/t = 10 TND" "200|2|10|[5]" "$CODE|$(mois 3 tonnes)|$(mois 3 montant_tnd)|$(mois 3 taux_appliques)"
chk "juin 2001 : 4,5 t à 8 TND/t = 36 TND — le jour d'effet compte déjà au nouveau taux" "4.5|36|[8]|False" \
    "$(mois 6 tonnes)|$(mois 6 montant_tnd)|$(mois 6 taux_appliques)|$(mois 6 provisoire)"
chk "un mois sans pesée n'a pas de ligne (pas de zéro inventé)" 2 "$(val "len(d)")"
appel GET "/pesees/redevance?communeId=$TC&annee=2000" "$T_A" >/dev/null
chk "décembre 2000, avant toute valeur : 1 t sans taux, pas de montant (null, pas 0)" "1|1|None|None" \
    "$(mois 12 tonnes)|$(mois 12 tonnes_sans_taux)|$(mois 12 montant_tnd)|$(mois 12 taux_appliques)"
appel POST "/parametres-nationaux/valeurs/$TAUX_B/retrait" "$T_FNCT" '{"motif":"TEST barème de juin saisi à tort"}' >/dev/null
appel GET "/pesees/redevance?communeId=$TC&annee=2001" "$T_A" >/dev/null
chk "le taux de juin retiré : juin repasse à 5 TND/t (22,5 TND)" "22.5|[5]" "$(mois 6 montant_tnd)|$(mois 6 taux_appliques)"
chk "la fonction de base suit la même règle" "3|10.000" \
    "$($PSQL -c "SET app.role='super_admin_fnct';" -c "SELECT mois||'|'||montant_tnd FROM app.redevance_anged('$TC', 2001) WHERE mois = 3;" 2>/dev/null)"
# Un second admin, rattaché à une autre commune : la base ne lui rend rien.
DIR_B=$(sql "SELECT u.email FROM users u WHERE u.role='admin_commune' AND u.deleted_at IS NULL AND u.is_active AND NOT u.mot_de_passe_provisoire AND u.email <> '$DIR_A' AND u.commune_id <> '$TC' AND NOT EXISTS (SELECT 1 FROM utilisateur_communes x WHERE x.user_id = u.id AND x.commune_id = '$TC') ORDER BY u.created_at LIMIT 1")
CODE=$(appel GET "/pesees/redevance?communeId=$TC&annee=2001" "$(tok "$DIR_B")")
chk "l'admin d'une autre commune ne lit pas cette redevance : aucune ligne" "200|0" "$CODE|$(val "len(d)")"

nettoyer
chk "les valeurs de test et la commune de test sont retirées ; la valeur de référence reste" "0|0|1" \
    "$(sql "SELECT (SELECT count(*) FROM valeurs_parametres_nationaux WHERE reference LIKE 'TEST%')||'|'||(SELECT count(*) FROM communes WHERE id='$TC')||'|'||(SELECT count(*) FROM valeurs_parametres_nationaux WHERE code='redevance_anged' AND date_effet='2025-01-01' AND provisoire AND retire_le IS NULL)")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
