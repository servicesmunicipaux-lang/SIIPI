#!/usr/bin/env bash
# =============================================================================
# v0.15.91 — jalon G, lot G2a : les établissements (docs/specs_metier/SPEC_G_assimiles_conventions.md
# § 3.1 ; décisions du 4 novembre 2026, G-3 et G-4 ; migration 099).
#
# Elle commence par ce qui est REFUSÉ :
#   - une inscription par la FNCT, par le directeur d'une autre commune, par un
#     prestataire ; une catégorie inconnue ; une unité d'échelle que la catégorie
#     n'admet pas, ou sans son nombre ; un matricule fiscal mal formé ou déjà
#     inscrit ; une position hors de Tunisie ou sans sa précision ; le secteur
#     d'une autre commune ; un octet nul ;
#   - la SUPPRESSION d'un établissement, par toutes les voies : route, app.supprimer,
#     date de retrait posée en base, privilège DELETE ;
#   - une fermeture sans date, datée de demain, sans motif ; un changement de
#     source ;
#   - une identité écrite tant que la garde est fermée (hébergement, récépissé) ;
#     un CIN en clair, nulle part.
# Puis l'inscription (doublons probables mesurés, jamais fusionnés), la fiche,
# les statuts, l'identité sous sa garde, et qui lit quoi.
#
#   docker compose exec -T api npm run test:etablissements
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
API="${API_URL:-http://localhost:4000}"
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
A=test_etab_a; B=test_etab_b
ESSAI="'$A','$B'"

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
sql() { $PSQL -c "$1" 2>&1 | tr -d ' '; }
tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
appel() { # méthode chemin jeton [corps] — code HTTP, corps dans $T/r.json
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" "$API$2" ${3:+-H "Authorization: Bearer $3"} \
    -H 'Content-Type: application/json' ${4:+-d "$4"}
}
val() { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
# Une écriture directe en base, sous le rôle de l'application et le compte $2 (rôle $1, commune $3).
en_base() { # rôle utilisateur commune instruction — le refus de la base, ou « ok »
  $PSQL -c "BEGIN; SELECT set_config('app.role', '$1', true), set_config('app.user_id', '$2', true), set_config('app.commune_id', '$3', true);
            SET LOCAL ROLE siipi_app; $4; ROLLBACK;" 2>&1 \
    | grep -oE '^ERROR: +[A-Z_]+:|permission denied|violates row-level security|violates (check|unique) constraint "[a-z_]+"' | head -1 \
    | sed -E 's/^ERROR: +//; s/:$//; s/violates (check|unique) constraint "([a-z_]+)"/\2/' | grep . || echo ok
}

. tests/outils/communes_essai.sh
. tests/outils/comptes_temporaires.sh
. tests/outils/base_reelle.sh
. tests/outils/tables_nationales.sh
nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
}
effacer_communes_essai "$ESSAI"
# La garde de l'hébergement est une ligne de paramètres nationaux : la campagne
# l'ouvre et la referme, puis rend la table ligne entière.
garder_tables_nationales parametres_nationaux
trap 'rendre_tables_nationales; nettoyer; rm -rf "$T" "$TABLES_NATIONALES_DIR"' EXIT
releve_base_reelle

commune_essai "$A" "TEST commune A des établissements"
commune_essai "$B" "TEST commune B des établissements"
compte_temporaire admin_commune "$A" "Directeur A"; T_A=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_A=$COMPTE_ID
compte_temporaire admin_commune "$B" "Directeur B"; T_B=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_B=$COMPTE_ID
compte_temporaire super_admin_fnct "" "FNCT des établissements"; T_F=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_F=$COMPTE_ID
compte_temporaire gestionnaire_prestataire "$A" "Prestataire de A"; T_P=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP"); ID_P=$COMPTE_ID
[ -n "$T_A" ] && [ -n "$T_B" ] && [ -n "$T_F" ] && [ -n "$T_P" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }
ZA=$(sql "INSERT INTO zones_collecte (commune_id, name, geom) VALUES ('$A', 'TEST secteur A', ST_Multi(ST_MakeEnvelope(10.10, 36.40, 10.11, 36.41, 4326))) RETURNING id")
ZB=$(sql "INSERT INTO zones_collecte (commune_id, name, geom) VALUES ('$B', 'TEST secteur B', ST_Multi(ST_MakeEnvelope(10.20, 36.50, 10.21, 36.51, 4326))) RETURNING id")
[ -n "$ZA" ] && [ -n "$ZB" ] || { echo "Les secteurs de test n'ont pas pu être posés" >&2; exit 1; }
# Une garde fermée et sans récépissé au départ, quel que soit l'état de la base.
$PSQL -c "UPDATE parametres_nationaux SET valeur = 'false', reference = NULL WHERE cle = 'hebergement_pii_accredite'" >/dev/null
DEMAIN=$(sql "SELECT app.jour_tunis() + 1")
etab() { # nom catégorie [champs JSON en plus] — un corps d'inscription
  printf '{"nom":"%s","categorieActivite":"%s"%s}' "$1" "$2" "${3:+,$3}"
}

# -----------------------------------------------------------------------------
echo
echo "1. Ce qui est refusé à l'inscription"
chk "la FNCT n'inscrit pas : 403, qui dit que c'est la commune" "403|1" \
    "$(appel POST "/etablissements?communeId=$A" "$T_F" "$(etab 'TEST Café' cafe)")|$(val "1 if 'commune recense' in d['error'] else 0")"
chk "le directeur d'une autre commune : introuvable (404)" 404 "$(appel POST "/etablissements?communeId=$A" "$T_B" "$(etab 'TEST Café' cafe)")"
chk "un prestataire : 403" 403 "$(appel POST "/etablissements?communeId=$A" "$T_P" "$(etab 'TEST Café' cafe)")"
chk "une catégorie inconnue : 400, qui la nomme" "400|1" \
    "$(appel POST "/etablissements?communeId=$A" "$T_A" "$(etab 'TEST Casino' casino)")|$(val "1 if 'casino' in d['error'] else 0")"
chk "une unité d'échelle que la catégorie n'admet pas (des étals pour un hôtel) : 400" "400|1" \
    "$(appel POST "/etablissements?communeId=$A" "$T_A" "$(etab 'TEST Hôtel' hotel '"uniteEchelle":"etal","valeurEchelle":3')")|$(val "1 if 'etal' in d['error'] else 0")"
chk "une unité sans son nombre : 400" 400 "$(appel POST "/etablissements?communeId=$A" "$T_A" "$(etab 'TEST Hôtel' hotel '"uniteEchelle":"chambre"')")"
chk "un matricule fiscal mal formé : 400" 400 "$(appel POST "/etablissements?communeId=$A" "$T_A" "$(etab 'TEST Hôtel' hotel '"matriculeFiscal":"12-AB"')")"
chk "une position hors de Tunisie (latitude et longitude inversées) : 400" 400 \
    "$(appel POST "/etablissements?communeId=$A" "$T_A" "$(etab 'TEST Hôtel' hotel '"latitude":10.1,"longitude":36.4,"precisionM":5')")"
chk "une position sans sa précision : 400" 400 \
    "$(appel POST "/etablissements?communeId=$A" "$T_A" "$(etab 'TEST Hôtel' hotel '"latitude":36.4,"longitude":10.1')")"
chk "le secteur d'une autre commune : 400" 400 "$(appel POST "/etablissements?communeId=$A" "$T_A" "$(etab 'TEST Hôtel' hotel "\"zoneId\":\"$ZB\"")")"
chk "une raison sociale qui porte un octet nul : 400, jamais 500" 400 "$(appel POST "/etablissements?communeId=$A" "$T_A" "$(etab 'TEST\u0000Hôtel' hotel)")"
chk "aucun établissement n'a été écrit par ces refus" 0 "$(sql "SELECT count(*) FROM commerces WHERE commune_id IN ($ESSAI)")"
chk "la base refuse d'elle-même une catégorie vide hors des lignes antérieures" commerces_categorie_activite_requise \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO commerces (commune_id, nom, source_creation) VALUES ('$A', 'TEST', 'saisie')")"
chk "… une catégorie inconnue" CATEGORIE_INCONNUE \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO commerces (commune_id, nom, categorie_activite, source_creation) VALUES ('$A', 'TEST', 'casino', 'saisie')")"
chk "… et une inscription par la FNCT" "violates row-level security" \
    "$(en_base super_admin_fnct "$ID_F" "" "INSERT INTO commerces (commune_id, nom, categorie_activite, source_creation) VALUES ('$A', 'TEST', 'cafe', 'saisie')")"
chk "la base n'a aucune colonne pour un CIN en clair (seulement son empreinte)" "empreinte_cin" \
    "$(sql "SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_name IN ('commerces', 'identites_commerces') AND column_name ILIKE '%cin%'")"

# -----------------------------------------------------------------------------
echo
echo "2. L'inscription"
chk "le directeur inscrit un hôtel : matricule normalisé, identifiant « matricule », source « saisie », catégorie nommée" \
    "201|1234567AAM000|matricule|saisie|actif|Hôtel|TEST secteur A|40" \
    "$(appel POST "/etablissements?communeId=$A" "$T_A" "$(etab 'TEST Hôtel des Palmiers' hotel "\"matriculeFiscal\":\"1234567 a/a/m/000\",\"zoneId\":\"$ZA\",\"uniteEchelle\":\"chambre\",\"valeurEchelle\":40,\"latitude\":36.405,\"longitude\":10.105,\"precisionM\":8")")|$(val "d['matricule_fiscal']")|$(val "d['statut_identifiant']")|$(val "d['source_creation']")|$(val "d['statut']")|$(val "d['categorie_activite_fr']")|$(val "d['secteur']")|$(val "d['valeur_echelle']")"
E1=$(val "d['id']")
chk "… le même matricule une seconde fois : 409, qui renvoie à la fiche existante" "409|1" \
    "$(appel POST "/etablissements?communeId=$A" "$T_A" "$(etab 'TEST Autre hôtel' hotel '"matriculeFiscal":"1234567A/A/M/000"')")|$(val "1 if 'déjà' in d['error'] else 0")"
chk "… le même matricule dans une autre commune s'inscrit (unique par commune)" 201 \
    "$(appel POST "/etablissements?communeId=$B" "$T_B" "$(etab 'TEST Hôtel B' hotel '"matriculeFiscal":"1234567AAM000"')")"
EB=$(val "d['id']")
chk "la même raison sociale, autrement écrite : inscrite, et le doublon probable est nommé (jamais fusionné)" "201|1|TEST Hôtel des Palmiers|True" \
    "$(appel POST "/etablissements?communeId=$A" "$T_A" "$(etab '  test hôtel   des PALMIERS ' hotel)")|$(val "len(d['doublons_probables'])")|$(val "d['doublons_probables'][0]['nom']")|$(val "d['doublons_probables'][0]['meme_nom']")"
E2=$(val "d['id']")
chk "une boutique à 2 m d'un autre établissement : inscrite, le voisin est nommé avec sa distance" "201|TEST Hôtel des Palmiers|1" \
    "$(appel POST "/etablissements?communeId=$A" "$T_A" "$(etab 'TEST Superette du coin' superette '"latitude":36.405018,"longitude":10.105,"precisionM":10')")|$(val "[x['nom'] for x in d['doublons_probables'] if not x['meme_nom']][0]")|$(val "1 if [x for x in d['doublons_probables'] if x['distance_m'] is not None and x['distance_m'] < 5] else 0")"
E3=$(val "d['id']")
chk "un établissement sans matricule ni identité : identifiant « à compléter »" a_completer "$(appel GET "/etablissements/$E3" "$T_A" >/dev/null; val "d['statut_identifiant']")"
chk "la fiche se modifie en entier : un café, 30 chaises" "200|cafe|chaise|30" \
    "$(appel PUT "/etablissements/$E3" "$T_A" "$(etab 'TEST Café du coin' cafe '"uniteEchelle":"chaise","valeurEchelle":30,"latitude":36.405018,"longitude":10.105,"precisionM":10')")|$(val "d['categorie_activite']")|$(val "d['unite_echelle']")|$(val "d['valeur_echelle']")"
chk "… le directeur d'une autre commune ne la modifie pas (404)" 404 "$(appel PUT "/etablissements/$E3" "$T_B" "$(etab 'TEST' cafe)")"
chk "la base refuse de changer la source d'un établissement" SOURCE_FIGEE \
    "$(en_base admin_commune "$ID_A" "$A" "UPDATE commerces SET source_creation = 'kobo' WHERE id = '$E3'")"
chk "la liste se filtre (statut, catégorie, recherche)" "3|1|1" \
    "$(appel GET "/etablissements?communeId=$A&statut=actif" "$T_A" >/dev/null; val "len(d)")|$(appel GET "/etablissements?communeId=$A&categorieActivite=cafe" "$T_A" >/dev/null; val "len(d)")|$(appel GET "/etablissements?communeId=$A&q=1234567" "$T_A" >/dev/null; val "len(d)")"
chk "la liste s'exporte en CSV, avec ses en-têtes" "200|1" \
    "$(curl -s -o "$T/export.csv" -w '%{http_code}' "$API/etablissements?communeId=$A&format=csv" -H "Authorization: Bearer $T_A")|$(grep -c 'Raison sociale' "$T/export.csv")"

# -----------------------------------------------------------------------------
echo
echo "3. Un établissement ne se supprime jamais : il se ferme"
chk "aucune route de suppression (l'ancienne non plus)" "404|404" \
    "$(appel DELETE "/etablissements/$E2" "$T_A")|$(appel DELETE "/registres/commerces/$E2" "$T_A")"
chk "l'ancienne route d'inscription a disparu : une seule voie, celle des établissements" 404 \
    "$(appel POST "/registres/commerces?communeId=$A" "$T_A" '{"nom":"TEST"}')"
chk "app.supprimer refuse la table" TABLE_NON_SUPPRIMABLE \
    "$(en_base admin_commune "$ID_A" "$A" "SELECT app.supprimer('commerces', '$E2')")"
chk "la base refuse qu'on pose sa date de retrait, même en administrateur" ETABLISSEMENT_JAMAIS_SUPPRIME \
    "$($PSQL -c "BEGIN; UPDATE commerces SET deleted_at = now() WHERE id = '$E2'; ROLLBACK;" 2>&1 | grep -oE 'ETABLISSEMENT_[A-Z_]+' | head -1)"
chk "aucun privilège de suppression pour l'application" f "$(sql "SELECT has_table_privilege('siipi_app', 'commerces', 'DELETE')")"
chk "une fermeture sans date : 400" 400 "$(appel POST "/etablissements/$E2/statut" "$T_A" '{"statut":"ferme","motif":"TEST doublon de la fiche des Palmiers"}')"
chk "… datée de demain : 400" 400 \
    "$(appel POST "/etablissements/$E2/statut" "$T_A" "{\"statut\":\"ferme\",\"date\":\"$DEMAIN\",\"motif\":\"TEST doublon de la fiche des Palmiers\"}")"
chk "… sans motif : 400" 400 "$(appel POST "/etablissements/$E2/statut" "$T_A" '{"statut":"ferme","date":"2026-10-01","motif":"x"}')"
chk "le directeur ferme le doublon, avec sa date et son motif : il reste, fermé, inactif" "200|ferme|2026-10-01|1" \
    "$(appel POST "/etablissements/$E2/statut" "$T_A" '{"statut":"ferme","date":"2026-10-01","motif":"TEST doublon de la fiche des Palmiers"}')|$(val "d['statut']")|$(val "d['ferme_le']")|$(sql "SELECT count(*) FROM commerces WHERE id = '$E2' AND deleted_at IS NULL AND NOT actif")"
chk "… une seconde fermeture : 409" 409 "$(appel POST "/etablissements/$E2/statut" "$T_A" '{"statut":"ferme","date":"2026-10-02","motif":"TEST encore fermé"}')"
chk "un établissement se signale « à vérifier », avec son motif" "200|a_verifier" \
    "$(appel POST "/etablissements/$E3/statut" "$T_A" '{"statut":"a_verifier","motif":"TEST adresse à confirmer sur place"}')|$(val "d['statut']")"
chk "… puis se confirme actif" "200|actif" "$(appel POST "/etablissements/$E3/statut" "$T_A" '{"statut":"actif","motif":"TEST vérifié sur place"}')|$(val "d['statut']")"
chk "le fermé se rouvre, avec son motif : sa date de fermeture part, l'historique reste au journal" "200|actif|None|t" \
    "$(appel POST "/etablissements/$E2/statut" "$T_A" '{"statut":"actif","motif":"TEST fermé par erreur"}')|$(val "d['statut']")|$(val "d['ferme_le']")|$(sql "SELECT count(*) >= 2 FROM audit_log WHERE table_name = 'commerces' AND record_id = '$E2' AND 'statut' = ANY (changed_fields)")"
chk "une fermeture ne se date pas sans être une fermeture : la base le tient" commerces_fermeture_datee \
    "$(en_base admin_commune "$ID_A" "$A" "UPDATE commerces SET ferme_le = DATE '2026-10-01' WHERE id = '$E3'")"
chk "M2-2 ne compte que les actifs : le fermé sort du compte" "3|2" \
    "$(sql "SELECT count(*) FROM commerces WHERE commune_id = '$A' AND actif")|$(appel POST "/etablissements/$E2/statut" "$T_A" '{"statut":"ferme","date":"2026-10-03","motif":"TEST doublon confirmé"}' >/dev/null; sql "SELECT count(*) FROM commerces WHERE commune_id = '$A' AND actif")"

# -----------------------------------------------------------------------------
echo
echo "4. L'identité du responsable, sous sa garde"
# Valeurs fictives, de même format que des vraies (CLAUDE.md § 2).
IDENT='{"nomResponsable":"TEST Responsable","telephone":"+216 20 123 456","cin":"12345678"}'
chk "la garde se lit : hébergement non accrédité, pas de récépissé" "200|False|False" \
    "$(appel GET "/etablissements/garde-identite?communeId=$A" "$T_A")|$(val "d['accredite']")|$(val "d['recepisse']")"
chk "garde fermée : l'identité ne s'enregistre pas (409), qui dit pourquoi" "409|1|0" \
    "$(appel PUT "/etablissements/$E3/identite" "$T_A" "$IDENT")|$(val "1 if 'accrédité' in d['error'] else 0")|$(sql "SELECT count(*) FROM identites_commerces WHERE commune_id IN ($ESSAI)")"
chk "… la base la refuse d'elle-même" IDENTITE_HEBERGEMENT \
    "$(en_base admin_commune "$ID_A" "$A" "INSERT INTO identites_commerces (commerce_id, commune_id, nom_responsable) VALUES ('$E3', '$A', 'TEST')")"
$PSQL -c "UPDATE parametres_nationaux SET valeur = 'true', reference = 'TEST accréditation de l''hébergement' WHERE cle = 'hebergement_pii_accredite'" >/dev/null
chk "hébergement accrédité, mais sans récépissé INPDP de la commune : 409, qui le dit" "409|1" \
    "$(appel PUT "/etablissements/$E3/identite" "$T_A" "$IDENT")|$(val "1 if 'récépissé' in d['error'] else 0")"
$PSQL -c "INSERT INTO parametres_commune (commune_id, recepisse_inpdp, recepisse_inpdp_date) VALUES ('$A', 'TEST-0002/2026', DATE '2026-01-15')
          ON CONFLICT (commune_id) DO UPDATE SET recepisse_inpdp = EXCLUDED.recepisse_inpdp, recepisse_inpdp_date = EXCLUDED.recepisse_inpdp_date" >/dev/null
chk "garde ouverte : l'identité s'enregistre ; téléphone normalisé, CIN réduit à son empreinte" "200|20123456|True|cin" \
    "$(appel PUT "/etablissements/$E3/identite" "$T_A" "$IDENT")|$(val "d['telephone']")|$(val "d['cin_enregistre']")|$(appel GET "/etablissements/$E3" "$T_A" >/dev/null; val "d['statut_identifiant']")"
chk "le CIN n'est écrit nulle part en clair : ni dans l'identité, ni au journal d'audit, ni au journal des consultations" "1|0|0|0" \
    "$(sql "SELECT count(*) FROM identites_commerces WHERE commerce_id = '$E3' AND empreinte_cin ~ '^[0-9a-f]{64}$' AND empreinte_cin NOT LIKE '%12345678%'")|$(sql "SELECT count(*) FROM audit_log WHERE table_name = 'identites_commerces' OR (COALESCE(old_data::text, '') || COALESCE(new_data::text, '')) LIKE '%12345678%'")|$(sql "SELECT count(*) FROM access_log WHERE endpoint::text LIKE '%12345678%'")|$(grep -c '12345678' "$T/r.json")"
chk "le directeur la lit, et la lecture est journalisée avec l'établissement" "200|TEST Responsable|1" \
    "$(appel GET "/etablissements/$E3/identite" "$T_A")|$(val "d['nom_responsable']")|$(sql "SELECT count(*) FROM access_log WHERE '$E3' = ANY (commerce_ids) AND user_id = '$ID_A'")"
chk "… la FNCT ne la lit pas (403), le directeur d'une autre commune non plus (404)" "403|404" \
    "$(appel GET "/etablissements/$E3/identite" "$T_F")|$(appel GET "/etablissements/$E3/identite" "$T_B")"
chk "… la liste n'en dit rien : ni nom, ni téléphone" "0|0" \
    "$(appel GET "/etablissements?communeId=$A" "$T_F" >/dev/null; grep -c 'TEST Responsable' "$T/r.json")|$(grep -c '20123456' "$T/r.json")"
$PSQL -c "UPDATE parametres_nationaux SET valeur = 'false', reference = NULL WHERE cle = 'hebergement_pii_accredite'" >/dev/null
chk "garde refermée : l'identité ne se réécrit plus, mais se retire toujours" "409|204|0" \
    "$(appel PUT "/etablissements/$E3/identite" "$T_A" '{"nomResponsable":"TEST Autre"}')|$(appel DELETE "/etablissements/$E3/identite" "$T_A")|$(sql "SELECT count(*) FROM identites_commerces WHERE commerce_id = '$E3' AND deleted_at IS NULL")"
chk "… et l'identifiant redevient « à compléter »" a_completer "$(appel GET "/etablissements/$E3" "$T_A" >/dev/null; val "d['statut_identifiant']")"

# -----------------------------------------------------------------------------
echo
echo "5. Qui lit quoi"
chk "la FNCT lit les établissements de A (les fermés compris), sans geste" "200|3" \
    "$(appel GET "/etablissements?communeId=$A" "$T_F")|$(val "len(d)")"
chk "… elle ne change pas un statut (403)" 403 "$(appel POST "/etablissements/$E3/statut" "$T_F" '{"statut":"a_verifier","motif":"TEST essai de la FNCT"}')"
chk "le directeur de B ne voit aucun établissement de A, ni par la liste ni par son identifiant" "0|404" \
    "$(appel GET "/etablissements?communeId=$A" "$T_B" >/dev/null; val "len(d)")|$(appel GET "/etablissements/$E1" "$T_B")"
chk "un prestataire n'y a pas accès (403), et la base ne lui en montre aucune ligne" "403|0" \
    "$(appel GET "/etablissements?communeId=$A" "$T_P")|$($PSQL -c "BEGIN; SELECT set_config('app.role', 'gestionnaire_prestataire', true), set_config('app.user_id', '$ID_P', true), set_config('app.commune_id', '$A', true); SET LOCAL ROLE siipi_app; SELECT 'n:' || count(*) FROM commerces; ROLLBACK;" 2>&1 | grep -oE '^n:[0-9]+' | cut -d: -f2)"
chk "la liste où les conventions choisissent un établissement reste lisible" "200|3" \
    "$(appel GET "/registres/commerces?communeId=$A" "$T_A")|$(val "len(d)")"
chk "… et le directeur de A ne lit pas celui de B (404)" 404 "$(appel GET "/etablissements/$EB" "$T_A")"

echo
base_reelle_intacte "pendant la campagne"

# -----------------------------------------------------------------------------
# La table nationale d'abord : effacer les comptes ne la touche pas, mais elle se
# rend avant tout le reste, comme dans les autres campagnes.
rendre_tables_nationales
nettoyer
chk "en partant : les communes de test, leurs établissements et identités, et les comptes temporaires sont effacés" "0|0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM commerces WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM identites_commerces WHERE commune_id IN ($ESSAI)")|$(sql "SELECT count(*) FROM users WHERE email LIKE 'test.compte.%@siipi.tn'")"
base_reelle_intacte "en partant"
tables_nationales_rendues "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
