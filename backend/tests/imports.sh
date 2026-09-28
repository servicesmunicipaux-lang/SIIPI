#!/usr/bin/env bash
# =============================================================================
# Les imports CSV — Jalon 4, lot 2 (C1.4 contacts, B2.4 parc, B3.1 points).
#
# CE QUE CETTE CAMPAGNE VÉRIFIE D'ABORD : que l'aperçu n'écrit RIEN, que la
# validation n'écrit que les lignes valides, et qu'un export réimporté tel quel
# ne change rien — ni doublon dans l'annuaire, ni fiche d'engin retouchée. Puis
# ce que les tableurs font réellement d'un CSV : séparateur « ; », « , » ou
# tabulation, UTF-8 avec ou sans BOM, Windows-1252, virgule décimale, libellés
# en français ou en arabe.
#
#   docker compose exec -T api npm run test:imports
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
sqlt() { $PSQL -c "$1" 2>/dev/null; }
val()  { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
# imp <url> <jeton> <fichier> <valider:true|false> [json supplémentaire] — rend le code HTTP.
imp() {
  python3 - "$3" "$4" "${5:-}" > "$T/corps.json" <<'PY'
import base64, json, os, sys
chemin, valider, extra = sys.argv[1], sys.argv[2] == 'true', sys.argv[3]
corps = {'nomFichier': os.path.basename(chemin), 'contenu': base64.b64encode(open(chemin, 'rb').read()).decode(), 'valider': valider}
if extra: corps.update(json.loads(extra))
print(json.dumps(corps))
PY
  curl -s -o "$T/r.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $2" -H 'Content-Type: application/json' \
       --data-binary "@$T/corps.json" "$1"
}
# ecrire <fichier> <encodage> <bom:oui|non> — le texte vient de l'entrée standard.
ecrire() { python3 -c "
import sys
t = sys.stdin.read()
open('$T/$1','wb').write(('﻿' if '$3'=='oui' else '').encode('$2') + t.encode('$2'))"; }

DIR_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
T_DIR=$(tok "$DIR_EMAIL")
[ -n "$T_DIR" ] || { echo "API injoignable sur $API" >&2; exit 1; }
COMMUNE=$(sql "SELECT commune_id FROM users WHERE email='$DIR_EMAIL'")
T_FNCT=$(tok admin.national@siipi.tn)
CIRCUITS_COMMUNE=$(sql "SELECT commune_id FROM circuits WHERE deleted_at IS NULL GROUP BY commune_id HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 1")
C_A=$(sql "SELECT id FROM circuits WHERE commune_id='$CIRCUITS_COMMUNE' AND deleted_at IS NULL ORDER BY nom LIMIT 1")
C_B=$(sql "SELECT id FROM circuits WHERE commune_id='$CIRCUITS_COMMUNE' AND deleted_at IS NULL ORDER BY nom OFFSET 1 LIMIT 1")

nettoyer() {
  $PSQL -c "DELETE FROM contacts WHERE nom_complet LIKE 'TEST-I%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM vehicules WHERE registration LIKE 'TEST-I%';" >/dev/null 2>&1
  $PSQL -c "DELETE FROM points_collecte WHERE nom LIKE 'TEST-I%';" >/dev/null 2>&1
}
nettoyer
URL_C="$API/contacts/import?communeId=$COMMUNE"

# -----------------------------------------------------------------------------
echo
echo "1. Contacts — l'aperçu lit tout et n'écrit rien"
ecrire contacts.csv utf-8 oui <<'CSV'
Nom complet;Catégorie;Organisation;Téléphone;Courriel;Notes
TEST-I Hélène Gharbi;Administration;ANGeD;+216 71 000 111;helene@example.test;'=SOMME(A1)
TEST-I سامي الطرابلسي;جمعية;جمعية الحي;22 333 444;;
TEST-I Sans Moyen;Élu;;;;
TEST-I Mauvais Courriel;Autre;;;pas-un-courriel;
TEST-I Catégorie Inconnue;Pompier;;50 000 000;;
TEST-I سامي الطرابلسي;Association;;22333444;;doublon du même fichier
CSV
chk "l'aperçu répond" 200 "$(imp "$URL_C" "$T_DIR" "$T/contacts.csv" false)"
chk "2 à créer, 1 doublon dans le fichier, 3 erreurs" "2|1|3" "$(val "f\"{d['resume']['creer']}|{d['resume']['doublon']}|{d['resume']['erreur']}\"")"
chk "rien n'a été écrit" 0 "$(sql "SELECT count(*) FROM contacts WHERE nom_complet LIKE 'TEST-I%'")"
chk "une ligne sans téléphone ni courriel porte son motif" 1 \
    "$(val "1 if any('au moins un téléphone' in e for l in d['lignes'] if l['numero']==4 for e in l['erreurs']) else 0")"
chk "une catégorie inconnue nomme les valeurs admises" 1 \
    "$(val "1 if any('Pompier' in e and 'Association' in e for l in d['lignes'] if l['numero']==6 for e in l['erreurs']) else 0")"
chk "un courriel mal formé est refusé" "erreur" "$(val "next(l['action'] for l in d['lignes'] if l['numero']==5)")"

echo
echo "2. Contacts — la validation n'écrit que les lignes valides"
chk "la validation passe" 201 "$(imp "$URL_C" "$T_DIR" "$T/contacts.csv" true)"
chk "2 contacts créés" 2 "$(sql "SELECT count(*) FROM contacts WHERE nom_complet LIKE 'TEST-I%'")"
chk "le nom arabe et la catégorie en arabe sont arrivés intacts" "TEST-I سامي الطرابلسي|association" \
    "$(sqlt "SELECT nom_complet||'|'||categorie FROM contacts WHERE nom_complet LIKE 'TEST-I سامي%'")"
chk "les accents aussi" 1 "$(sql "SELECT count(*) FROM contacts WHERE nom_complet='TEST-I Hélène Gharbi'")"
chk "l'apostrophe de neutralisation d'un export est retirée au retour" "=SOMME(A1)" \
    "$(sqlt "SELECT notes FROM contacts WHERE nom_complet='TEST-I Hélène Gharbi'")"

echo
echo "3. Contacts — réimporter un export ne double rien"
curl -s -o "$T/export.csv" -H "Authorization: Bearer $T_DIR" "$API/contacts?communeId=$COMMUNE&format=csv"
imp "$URL_C" "$T_DIR" "$T/export.csv" false >/dev/null
chk "chaque ligne de l'export est reconnue comme déjà présente" "0|0" "$(val "f\"{d['resume']['creer']}|{d['resume']['erreur']}\"")"
chk "la colonne calculée « Mis à jour le » est ignorée, et dite ignorée" 1 "$(val "1 if 'Mis à jour le' in d['colonnesIgnorees'] else 0")"
chk "valider un fichier sans rien à créer est refusé" 400 "$(imp "$URL_C" "$T_DIR" "$T/export.csv" true)"
curl -s -o "$T/export-ar.csv" -H "Authorization: Bearer $T_DIR" "$API/contacts?communeId=$COMMUNE&format=csv&langue=ar"
imp "$URL_C" "$T_DIR" "$T/export-ar.csv" false >/dev/null
chk "un export aux en-têtes arabes aussi" "0|0" "$(val "f\"{d['resume']['creer']}|{d['resume']['erreur']}\"")"

echo
echo "4. Ce que les tableurs font réellement d'un CSV"
printf 'nom,tel,mail\nTEST-I Virgule,98 765 432,\n' > "$T/virgule.csv"
imp "$URL_C" "$T_DIR" "$T/virgule.csv" false >/dev/null
chk "séparateur « , », sans BOM, en-têtes abrégés (nom, tel, mail)" "1" "$(val "d['resume']['creer']")"
printf 'Nom complet\tTéléphone\nTEST-I Tabulation\t11 222 333\n' > "$T/tab.csv"
imp "$URL_C" "$T_DIR" "$T/tab.csv" false >/dev/null
chk "séparateur tabulation (copier-coller depuis un tableur)" "1" "$(val "d['resume']['creer']")"
ecrire latin.csv cp1252 non <<'CSV'
Nom complet;Téléphone
TEST-I Élodie Béjaoui;71 999 888
CSV
imp "$URL_C" "$T_DIR" "$T/latin.csv" true >/dev/null
chk "un CSV Windows-1252 (« CSV » classique d'Excel) est lu, accents compris" 1 \
    "$(sql "SELECT count(*) FROM contacts WHERE nom_complet='TEST-I Élodie Béjaoui'")"
chk "et l'on prévient que l'arabe n'y survivrait pas" 1 "$(val "1 if any('UTF-8' in a for a in d['avertissements']) else 0")"
printf 'Colonne;Inconnue\nx;y\n' > "$T/inconnu.csv"
chk "aucune colonne reconnue : refusé, avec la raison" "400|1" \
    "$(imp "$URL_C" "$T_DIR" "$T/inconnu.csv" false)|$(val "1 if 'en-têtes' in d['error'] else 0")"
: > "$T/vide.csv"
chk "un fichier vide est refusé" 400 "$(imp "$URL_C" "$T_DIR" "$T/vide.csv" false)"

echo
echo "5. Cloisonnement de l'import"
AUTRE_EMAIL=$(sql "SELECT email FROM users WHERE role='admin_commune' AND commune_id <> '$COMMUNE' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire ORDER BY created_at LIMIT 1")
printf 'Nom complet;Téléphone\nTEST-I Intrus;70 000 000\n' > "$T/intrus.csv"
if [ -n "$AUTRE_EMAIL" ]; then
  chk "une autre commune ne peut pas écrire dans cet annuaire" 403 "$(imp "$URL_C" "$(tok "$AUTRE_EMAIL")" "$T/intrus.csv" true)"
  chk "rien n'a été écrit" 0 "$(sql "SELECT count(*) FROM contacts WHERE nom_complet='TEST-I Intrus'")"
fi
PREST_EMAIL=$(sql "SELECT email FROM users WHERE role='gestionnaire_prestataire' AND deleted_at IS NULL AND is_active ORDER BY created_at LIMIT 1")
[ -n "$PREST_EMAIL" ] && chk "un prestataire est refusé" 403 "$(imp "$URL_C" "$(tok "$PREST_EMAIL")" "$T/intrus.csv" false)"
chk "sans jeton, rien" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$URL_C")"

# -----------------------------------------------------------------------------
echo
echo "6. Parc — réimporter un export ne touche à rien"
URL_P="$API/trucks/import?communeId=$COMMUNE"
curl -s -o /dev/null -X POST -H "Authorization: Bearer $T_DIR" -H 'Content-Type: application/json' \
  -d '{"registration":"TEST-I 001","type":"benne_tasseuse","etat":"en_service","valeurAchatTnd":150000,"capacityM3":12}' "$API/trucks?communeId=$COMMUNE"
curl -s -o "$T/parc.csv" -H "Authorization: Bearer $T_DIR" "$API/trucks?communeId=$COMMUNE&format=csv"
imp "$URL_P" "$T_DIR" "$T/parc.csv" false >/dev/null
chk "toutes les lignes de l'export sont « inchangé »" "0|0|0" \
    "$(val "f\"{d['resume']['creer']}|{d['resume']['maj']}|{d['resume']['erreur']}\"")"
chk "âge et date d'inventaire, calculés, sont ignorés" 1 \
    "$(val "1 if 'Âge (années)' in d['colonnesIgnorees'] and 'Inventorié le' in d['colonnesIgnorees'] else 0")"
curl -s -o "$T/parc-ar.csv" -H "Authorization: Bearer $T_DIR" "$API/trucks?communeId=$COMMUNE&format=csv&langue=ar"
imp "$URL_P" "$T_DIR" "$T/parc-ar.csv" false >/dev/null
chk "de même pour un export aux libellés arabes (« في الاستعمال »…)" "0|0" "$(val "f\"{d['resume']['maj']}|{d['resume']['erreur']}\"")"

echo
echo "7. Parc — mise à jour, création, erreurs"
ecrire parc-maj.csv utf-8 oui <<'CSV'
Immatriculation;Type;État;Valeur d'achat (TND);Capacité (m³);Marque
TEST-I 001;Benne tasseuse;En panne;162 500,50;;
TEST-I 002;شاحنة ضاغطة;في الاستعمال;98000;14,5;Iveco
TEST-I 003;;En service;;;
TEST-I 004;Camion;En service;abc;;
TEST-I 002;Camion;En service;;;
CSV
chk "l'aperçu répond" 200 "$(imp "$URL_P" "$T_DIR" "$T/parc-maj.csv" false)"
chk "1 à mettre à jour, 1 à créer, 3 erreurs" "1|1|3" "$(val "f\"{d['resume']['maj']}|{d['resume']['creer']}|{d['resume']['erreur']}\"")"
chk "la mise à jour nomme les colonnes qui changent" "Valeur d'achat (TND),État" \
    "$(val "','.join(sorted(next(l['champs'] for l in d['lignes'] if l['numero']==2)))")"
chk "une création sans type est refusée, avec la raison" 1 \
    "$(val "1 if any('Type' in e and 'obligatoire' in e for l in d['lignes'] if l['numero']==4 for e in l['erreurs']) else 0")"
chk "un nombre illisible est refusé" 1 "$(val "1 if any('abc' in e for l in d['lignes'] if l['numero']==5 for e in l['erreurs']) else 0")"
chk "une immatriculation en double dans le fichier est refusée" 1 \
    "$(val "1 if any('ligne 3' in e for l in d['lignes'] if l['numero']==6 for e in l['erreurs']) else 0")"
chk "rien n'a été écrit" "en_service|0" "$(sql "SELECT etat||'|'||(SELECT count(*) FROM vehicules WHERE registration='TEST-I 002') FROM vehicules WHERE registration='TEST-I 001'")"
chk "la validation passe" 201 "$(imp "$URL_P" "$T_DIR" "$T/parc-maj.csv" true)"
chk "l'engin connu est mis à jour : état, valeur à virgule décimale" "en_panne|162500.5" \
    "$(sql "SELECT etat||'|'||valeur_achat_tnd::float FROM vehicules WHERE registration='TEST-I 001'")"
chk "un changement d'état sans date dit « depuis aujourd'hui »" 1 \
    "$(sql "SELECT (etat_depuis = CURRENT_DATE)::int FROM vehicules WHERE registration='TEST-I 001'")"
chk "une case vide n'a pas effacé la capacité existante" 12 "$(sql "SELECT capacity_m3::float FROM vehicules WHERE registration='TEST-I 001'")"
chk "l'engin nouveau est créé, type et état donnés en arabe" "benne_tasseuse|en_service|14.5|Iveco" \
    "$(sql "SELECT type||'|'||etat||'|'||capacity_m3::float||'|'||marque FROM vehicules WHERE registration='TEST-I 002'")"
chk "les lignes en erreur n'ont rien créé" 0 "$(sql "SELECT count(*) FROM vehicules WHERE registration IN ('TEST-I 003','TEST-I 004')")"

# -----------------------------------------------------------------------------
echo
echo "8. Points de collecte (B3.1) — un CSV passe par l'import des relevés"
URL_K="$API/circuits/$C_A/import-kml"
ecrire points.csv utf-8 oui <<'CSV'
Nom;Type;Latitude;Longitude;Ordre;Heure observée;Précision (m)
TEST-I école;Point noir;36,4601;10,7501;5;07:32;4,5
TEST-I السوق;نقطة سوداء;36.4610;10.7510;5;7:40;
TEST-I fin;fin_collecte;36.4620;10.7520;9;;
TEST-I bac vert;Bac vert;36.4630;10.7530;;;
TEST-I sans position;Point noir;;10.7540;;;
TEST-I hors limites;Point noir;136.46;10.75;;;
CSV
chk "l'aperçu reconnaît un CSV" "200|csv" "$(imp "$URL_K" "$T_FNCT" "$T/points.csv" false '{"cible":"points"}')|$(val "d['famille']")"
chk "4 arrêts retenus, 2 lignes écartées et dites écartées" "4|2" \
    "$(val "f\"{d['nbPoints']}|{sum(1 for a in d['avertissements'] if 'écartée' in a)}\"")"
chk "types lus en français, en arabe, par leur code ; inconnu → « autre »" "point_noir,point_noir,fin_collecte,autre" \
    "$(val "','.join(p['type'] for p in d['points'])")"
chk "ordre renuméroté sans doublon (5, 5, 9, — → 1, 2, 3, 4)" "1,2,3,4" "$(val "','.join(str(p['ordre']) for p in d['points'])")"
chk "virgule décimale, heure « 7:40 » complétée" "36.4601|07:40:00|4.5" \
    "$(val "f\"{d['points'][0]['lat']}|{d['points'][1]['heureObservee']}|{d['points'][0]['precisionM']}\"")"
chk "rien n'a été écrit" 0 "$(sql "SELECT count(*) FROM points_collecte WHERE nom LIKE 'TEST-I%'")"
chk "la validation crée les arrêts" 201 "$(imp "$URL_K" "$T_FNCT" "$T/points.csv" true '{"cible":"points"}')"
chk "4 arrêts, nom arabe intact" "4|1" \
    "$(sql "SELECT count(*)||'|'||sum((nom='TEST-I السوق')::int) FROM points_collecte WHERE nom LIKE 'TEST-I%' AND circuit_id='$C_A' AND deleted_at IS NULL")"
curl -s -o "$T/points-export.csv" -H "Authorization: Bearer $T_FNCT" "$API/circuits/points?communeId=$CIRCUITS_COMMUNE&circuitId=$C_A&format=csv"
chk "l'export de la carte se réimporte sur un autre circuit, tel quel" "201|4" \
    "$(imp "$API/circuits/$C_B/import-kml" "$T_FNCT" "$T/points-export.csv" true '{"cible":"points"}')|$(sql "SELECT count(*) FROM points_collecte WHERE nom LIKE 'TEST-I%' AND circuit_id='$C_B' AND deleted_at IS NULL")"
printf 'Nom;Type\nTEST-I x;Point noir\n' > "$T/sans-coord.csv"
chk "un CSV sans latitude ni longitude est refusé, avec la raison" "400|1" \
    "$(imp "$URL_K" "$T_FNCT" "$T/sans-coord.csv" false '{"cible":"points"}')|$(val "1 if 'Latitude' in d['error'] else 0")"

nettoyer
echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
