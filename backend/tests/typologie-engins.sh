#!/usr/bin/env bash
# =============================================================================
# v0.15.78 — lot T : la typologie des engins de collecte.
# DECISIONS_2026-10-20.md, complément du 25/10/2026 ; migration 087,
# routes/trucks.routes.ts, services/jeuxExport.ts.
#
# Elle commence par ce que la décision veut voir REFUSÉ, à l'API et dans la base :
#   - une classe inconnue, une classe qui ne convient pas au type (une niveleuse
#     n'est pas une benne tasseuse), une classe sur un tracteur (elle se porte sur
#     sa remorque), un type changé pour un type que la classe n'admet pas ;
#   - un volume nul ou négatif, une provenance sans volume ou hors liste ;
#   - le référentiel des classes écrit par l'application ;
#   - la classe d'un engin d'une autre commune (introuvable).
# Puis ce qui doit marcher : le référentiel lu, l'engin classé, l'engin de travail
# d'un attelage (le volume de la remorque, rien sans remorque, rien avec deux),
# l'export et l'import, « À vérifier » et son arabe — et aucune classe posée sur un
# engin que la commune n'a pas classé.
#
#   docker compose exec -T api npm run test:typologie-engins
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
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
sqlt() { $PSQL -c "$1" 2>/dev/null; }
val()  { python3 -c "import json;d=json.load(open('$T/r.json'));print($1)" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
req() {
  curl -s -o "$T/r.json" -w '%{http_code}' -X "$1" ${4:+-H "Authorization: Bearer $4"} \
       -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2"
}
imp() {  # $1 = fichier, $2 = valider (true|false), $3 = jeton
  python3 - "$1" "$2" > "$T/corps.json" <<'PY'
import base64, json, os, sys
print(json.dumps({'nomFichier': os.path.basename(sys.argv[1]), 'contenu': base64.b64encode(open(sys.argv[1], 'rb').read()).decode(), 'valider': sys.argv[2] == 'true'}))
PY
  curl -s -o "$T/r.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $3" -H 'Content-Type: application/json' \
       --data-binary "@$T/corps.json" "$API/trucks/import?communeId=$C"
}
engin() {  # $1 = immatriculation, $2 = corps JSON sans l'immatriculation ; rend l'identifiant
  req POST "/trucks?communeId=$C" "{\"registration\":\"$1\",$2}" "$T_D" >/dev/null
  val "d['id']"
}
travail() {  # $1 = immatriculation ; « classe|volume|provenance|porteur|manque » lu dans la liste du parc
  req GET "/trucks?communeId=$C" "" "$T_D" >/dev/null
  val "next('|'.join(str(v.get(k)) for k in ('travail_classe','travail_volume_m3','travail_volume_provenance','travail_porteur_immat','travail_manque')) for v in d if v['registration']=='$1')"
}

C=test_typologie
C2=test_typologie_b
ESSAI="'$C','$C2'"
. tests/outils/comptes_temporaires.sh
. tests/outils/communes_essai.sh
. tests/outils/base_reelle.sh
nettoyer() {
  effacer_communes_essai "$ESSAI"
  retirer_comptes_temporaires
  effacer_communes_essai "$ESSAI"
}
nettoyer
trap 'nettoyer; rm -rf "$T"' EXIT
releve_base_reelle

commune_essai "$C" "TEST Commune de la typologie"
commune_essai "$C2" "TEST Autre commune de la typologie"
compte_temporaire admin_commune "$C" "Directeur de la typologie"; T_D=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
compte_temporaire admin_commune "$C2" "Directeur de l'autre commune"; T_D2=$(tok "$COMPTE_EMAIL" "$COMPTE_MDP")
[ -n "$T_D" ] && [ -n "$T_D2" ] || { echo "API injoignable sur $API, ou compte temporaire refusé" >&2; exit 1; }

# -----------------------------------------------------------------------------
echo
echo "1. Ce qui est refusé"
NIV=$(engin "TEST-T NIV" '"type":"niveleuse"')
TRA=$(engin "TEST-T TRA" '"type":"tracteur"')
chk "une classe inconnue : 400, et la réponse dit où lire les classes" "400|1" \
    "$(req POST "/trucks?communeId=$C" '{"registration":"TEST-T X1","type":"benne_tasseuse","classeCollecte":"fusee"}' "$T_D")|$(val "1 if '/trucks/classes' in d['error'] else 0")"
chk "une classe qui ne convient pas au type (niveleuse classée benne tasseuse) : 400, avec la raison" "400|1" \
    "$(req PATCH "/trucks/$NIV" '{"classeCollecte":"benne_tasseuse"}' "$T_D")|$(val "1 if 'ne convient pas' in d['error'] else 0")"
chk "une classe sur un tracteur : 400, la réponse dit de la porter sur la remorque" "400|1" \
    "$(req PATCH "/trucks/$TRA" '{"classeCollecte":"tracteur_remorque_agricole"}' "$T_D")|$(val "1 if 'remorque' in d['error'] else 0")"
chk "… et la base refuse d'elle-même (23514), sans passer par l'API" 1 \
    "$($PSQL -c "UPDATE vehicules SET classe_collecte = 'benne_tasseuse' WHERE id = '$NIV'" 2>&1 | grep -c 'ne convient pas')"
BT=$(engin "TEST-T BT16" '"type":"benne_tasseuse","classeCollecte":"benne_tasseuse","capacityM3":16,"volumeProvenance":"constructeur"')
chk "changer le type d'un engin classé pour un type que sa classe n'admet pas : 400" 400 \
    "$(req PATCH "/trucks/$BT" '{"type":"niveleuse"}' "$T_D")"
chk "un volume nul : 400" 400 "$(req PATCH "/trucks/$BT" '{"capacityM3":0}' "$T_D")"
chk "un volume négatif : 400" 400 "$(req PATCH "/trucks/$BT" '{"capacityM3":-3}' "$T_D")"
chk "… et la base refuse un volume nul" 1 "$($PSQL -c "UPDATE vehicules SET capacity_m3 = 0 WHERE id = '$BT'" 2>&1 | grep -c 'vehicules_volume_positif')"
chk "une provenance sans volume : 400, la réponse dit quoi faire" "400|1" \
    "$(req POST "/trucks?communeId=$C" '{"registration":"TEST-T X2","type":"camion","volumeProvenance":"mesure"}' "$T_D")|$(val "1 if 'volume' in d['error'] else 0")"
chk "retirer le volume en gardant sa provenance : 400" 400 "$(req PATCH "/trucks/$BT" '{"capacityM3":null}' "$T_D")"
chk "… et la base refuse une provenance sans volume" 1 \
    "$($PSQL -c "UPDATE vehicules SET capacity_m3 = NULL WHERE id = '$BT'" 2>&1 | grep -c 'vehicules_volume_provenance_valide')"
chk "une provenance hors liste : 400" 400 "$(req PATCH "/trucks/$BT" '{"volumeProvenance":"devine"}' "$T_D")"
chk "rien n'a bougé sur la benne" "benne_tasseuse|benne_tasseuse|16|constructeur" \
    "$(sql "SELECT type||'|'||classe_collecte||'|'||trim_scale(capacity_m3)||'|'||volume_provenance FROM vehicules WHERE id = '$BT'")"
chk "le rôle de l'application ne peut pas écrire le référentiel des classes" "false|false|false|true" \
    "$(sql "SELECT has_table_privilege('siipi_app','classes_engins','INSERT')||'|'||has_table_privilege('siipi_app','classes_engins','UPDATE')||'|'||has_table_privilege('siipi_app','classes_engins','DELETE')||'|'||has_table_privilege('siipi_app','classes_engins','SELECT')")"
chk "le directeur d'une autre commune ne classe pas cet engin : introuvable (404)" 404 \
    "$(req PATCH "/trucks/$BT" '{"classeCollecte":"benne_tasseuse","capacityM3":20}' "$T_D2")"
chk "sans jeton, rien" 401 "$(req GET "/trucks/classes")"

# -----------------------------------------------------------------------------
echo
echo "2. Le référentiel des classes"
chk "lu par une commune" 200 "$(req GET "/trucks/classes" "" "$T_D")"
chk "six classes, dans l'ordre du guide" "benne_tasseuse,benne_basculante,pick_up,tracteur_remorque_agricole,tracteur_remorque_compactrice,ampli_roll" \
    "$(val "','.join(k['code'] for k in d)")"
chk "chacune a son libellé arabe et sa source" True "$(val "all(k['libelle_ar'] and any(0x600 <= ord(ch) <= 0x6FF for ch in k['libelle_ar']) and 'Tableau' in k['source'] for k in d)")"
chk "les compactantes : benne tasseuse et remorque compactrice" "benne_tasseuse,tracteur_remorque_compactrice" \
    "$(val "','.join(k['code'] for k in d if k['compactant'])")"
chk "les plages de référence : 7–22, 6–8, 2,5, 4–8, et aucune pour la compactrice ni l'ampli-roll" "7-22,6-8,2.5-2.5,4-8,None-None,None-None" \
    "$(val "','.join(f\"{k['volume_ref_min_m3'] if k['volume_ref_min_m3'] is None else ('%g' % k['volume_ref_min_m3'])}-{k['volume_ref_max_m3'] if k['volume_ref_max_m3'] is None else ('%g' % k['volume_ref_max_m3'])}\" for k in d)")"
chk "aucune classe n'admet le tracteur seul" 0 "$(sql "SELECT count(*) FROM classes_engins WHERE 'tracteur' = ANY (types_compatibles)")"
npx tsx -e "import { JEU_PARC } from './src/services/jeuxExport.ts'; console.log(JSON.stringify(JEU_PARC.colonnes.find((x) => x.cle === 'classe_collecte')?.libelles ?? {}))" > "$T/libelles_code.json" 2>"$T/libelles_code.err"
$PSQL -c "SELECT json_object_agg(code, json_build_object('fr', libelle_fr, 'ar', libelle_ar)) FROM classes_engins" > "$T/libelles_base.json"
chk "les libellés de l'export du parc sont ceux du référentiel, en français et en arabe" True     "$(python3 -c "import json;a=json.load(open('$T/libelles_code.json'));b=json.load(open('$T/libelles_base.json'));print(len(b) == 6 and a == b)" 2>&1)"

# -----------------------------------------------------------------------------
echo
echo "3. L'engin de travail"
chk "la benne tasseuse classée porte elle-même sa benne" "benne_tasseuse|16|constructeur|TEST-T BT16|None" "$(travail 'TEST-T BT16')"
chk "un tracteur sans remorque : volume inconnu, et c'est dit" "None|None|None|None|remorque_absente" "$(travail 'TEST-T TRA')"
REM=$(engin "TEST-T REM1" "\"type\":\"remorque\",\"atteleA\":\"$TRA\"")
chk "une remorque attelée mais non classée : la classe manque" "None|None|None|TEST-T REM1|classe_et_volume" "$(travail 'TEST-T TRA')"
chk "la remorque est classée « tracteur et remorque agricole », 6 m³ mesurés" 200 \
    "$(req PATCH "/trucks/$REM" '{"classeCollecte":"tracteur_remorque_agricole","capacityM3":6,"volumeProvenance":"mesure"}' "$T_D")"
chk "le tracteur reprend la classe et le volume de sa remorque" "tracteur_remorque_agricole|6|mesure|TEST-T REM1|None" "$(travail 'TEST-T TRA')"
REM2=$(engin "TEST-T REM2" "\"type\":\"remorque\",\"atteleA\":\"$TRA\",\"classeCollecte\":\"tracteur_remorque_agricole\",\"capacityM3\":8,\"volumeProvenance\":\"declare\"")
chk "deux remorques attelées : SIIPI ne choisit pas" "None|None|None|None|remorques_multiples" "$(travail 'TEST-T TRA')"
req PATCH "/trucks/$REM2" '{"atteleA":null}' "$T_D" >/dev/null
chk "une seule à nouveau : le volume revient" "6|None" "$(travail 'TEST-T TRA' | cut -d'|' -f2,5)"
chk "une ampli-roll, classée sans volume : le volume manque" "ampli_roll|None|None|TEST-T AMP|volume" \
    "$(engin "TEST-T AMP" '"type":"camion_ampliroll","classeCollecte":"ampli_roll"' >/dev/null; travail 'TEST-T AMP')"

# -----------------------------------------------------------------------------
echo
echo "4. « À vérifier » : ce que la typologie ne dit pas encore"
CIR_BT=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage, actif, vehicule_id) VALUES ('$C', 'TEST circuit BT', ARRAY[1]::smallint[], true, '$BT') RETURNING id")
CIR_TR=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage, actif, vehicule_id) VALUES ('$C', 'TEST circuit tracteur', ARRAY[2]::smallint[], true, '$TRA') RETURNING id")
NC=$(engin "TEST-T CAM" '"type":"camion"')
CIR_NC=$(sql "INSERT INTO circuits (commune_id, nom, jours_passage, actif, vehicule_id) VALUES ('$C', 'TEST circuit camion', ARRAY[3]::smallint[], true, '$NC') RETURNING id")
coherence() { req GET "/communes/$C/coherence" "" "$T_D" >/dev/null; }
coherence
chk "le circuit d'un engin sans classe : avis d'information, avec l'immatriculation" "information|1" \
    "$(val "next((e['gravite'] + '|' + str(int('TEST-T CAM' in e['constat'])) for e in d if e['sujet'] == 'TEST circuit camion' and e['domaine'] == 'parc'), 'aucun')")"
chk "… et son arabe" 1 "$(val "1 if any(e['sujet'] == 'TEST circuit camion' and e['domaine'] == 'parc' and 'TEST-T CAM' in (e['constat_ar'] or '') and 'المعدة' in e['constat_ar'] for e in d) else 0")"
chk "le circuit d'une benne classée et mesurée : aucun avis" 0 "$(val "sum(1 for e in d if e['sujet'] == 'TEST circuit BT' and e['domaine'] == 'parc')")"
chk "le circuit d'un tracteur bien attelé : aucun avis" 0 "$(val "sum(1 for e in d if e['sujet'] == 'TEST circuit tracteur' and e['domaine'] == 'parc')")"
req PATCH "/trucks/$REM2" "{\"atteleA\":\"$TRA\"}" "$T_D" >/dev/null; coherence
chk "deux remorques au tracteur du circuit : l'avis le dit, en français et en arabe" 1 \
    "$(val "1 if any(e['sujet'] == 'TEST circuit tracteur' and e['domaine'] == 'parc' and 'Plusieurs remorques' in e['constat'] and 'عدة مجرورات' in (e['constat_ar'] or '') for e in d) else 0")"
req PATCH "/trucks/$REM" '{"atteleA":null}' "$T_D" >/dev/null; req PATCH "/trucks/$REM2" '{"atteleA":null}' "$T_D" >/dev/null; coherence
chk "aucune remorque : l'avis le dit" 1 "$(val "1 if any(e['sujet'] == 'TEST circuit tracteur' and e['domaine'] == 'parc' and 'aucune remorque' in e['constat'] for e in d) else 0")"
req PATCH "/trucks/$BT" '{"capacityM3":30}' "$T_D" >/dev/null; coherence
chk "une benne tasseuse de 30 m³ : signalée hors plage (7 à 22), pas refusée" "1|30" \
    "$(val "next((str(int('7 à 22 m³' in e['constat'])) for e in d if e['sujet'] == 'TEST-T BT16' and e['domaine'] == 'parc'), 'aucun')")|$(sql "SELECT trim_scale(capacity_m3) FROM vehicules WHERE id = '$BT'")"
chk "… l'arabe traduit le nom de la classe" 1 "$(val "1 if any(e['sujet'] == 'TEST-T BT16' and e['domaine'] == 'parc' and 'شاحنة ضاغطة' in (e['constat_ar'] or '') and '30' in e['constat_ar'] for e in d) else 0")"
req PATCH "/trucks/$BT" '{"capacityM3":7.5}' "$T_D" >/dev/null; coherence
chk "dans la plage, plus rien (une décimale comprise)" 0 "$(val "sum(1 for e in d if e['sujet'] == 'TEST-T BT16' and e['domaine'] == 'parc')")"
chk "un circuit inactif ne produit pas d'avis" 0 \
    "$($PSQL -c "UPDATE circuits SET actif = false WHERE id = '$CIR_NC'" >/dev/null; coherence; val "sum(1 for e in d if e['sujet'] == 'TEST circuit camion' and e['domaine'] == 'parc')")"

# -----------------------------------------------------------------------------
echo
echo "5. Export et import"
curl -s -o "$T/parc.csv" -H "Authorization: Bearer $T_D" "$API/trucks?communeId=$C&format=csv"
chk "l'export porte la classe et la provenance, en libellés" 1 \
    "$(python3 -c "t=open('$T/parc.csv',encoding='utf-8-sig').read();print(1 if 'Classe de collecte' in t and 'Provenance du volume' in t and 'Camion à benne tasseuse' in t and 'Constructeur' in t else 0)")"
chk "réimporter l'export ne change rien" "0|0|0" "$(imp "$T/parc.csv" false "$T_D" >/dev/null; val "f\"{d['resume']['creer']}|{d['resume']['maj']}|{d['resume']['erreur']}\"")"
curl -s -o "$T/parc-ar.csv" -H "Authorization: Bearer $T_D" "$API/trucks?communeId=$C&format=csv&langue=ar"
chk "… de même pour l'export en arabe" "0|0" "$(imp "$T/parc-ar.csv" false "$T_D" >/dev/null; val "f\"{d['resume']['maj']}|{d['resume']['erreur']}\"")"
printf 'Immatriculation;Type;Classe de collecte;Capacité (m³);Provenance du volume\nTEST-T CAM;Camion;Camion à benne basculante (Cbb);6;Mesuré\nTEST-T NIV;Niveleuse;Camion à benne tasseuse;;\nTEST-T NEW;Camion;pick_up;2,5;Constructeur\nTEST-T X3;Camion;;;Déclaré\n' > "$T/maj.csv"
chk "l'aperçu répond" 200 "$(imp "$T/maj.csv" false "$T_D")"
chk "1 mise à jour, 1 création, 2 erreurs" "1|1|2" "$(val "f\"{d['resume']['maj']}|{d['resume']['creer']}|{d['resume']['erreur']}\"")"
chk "la classe incompatible est refusée à sa ligne, avec la raison" 1 \
    "$(val "1 if any('ne convient pas' in e for l in d['lignes'] if l['numero']==3 for e in l['erreurs']) else 0")"
chk "la provenance sans volume est refusée à sa ligne" 1 \
    "$(val "1 if any('volume' in e for l in d['lignes'] if l['numero']==5 for e in l['erreurs']) else 0")"
chk "la validation passe" 201 "$(imp "$T/maj.csv" true "$T_D")"
chk "le camion est classé benne basculante, 6 m³ mesurés ; le pick-up est créé" "benne_basculante|6|mesure|pick_up|2.5|constructeur" \
    "$(sql "SELECT string_agg(classe_collecte||'|'||trim_scale(capacity_m3)||'|'||volume_provenance, '|' ORDER BY registration) FROM vehicules WHERE commune_id = '$C' AND registration IN ('TEST-T CAM','TEST-T NEW')")"

# -----------------------------------------------------------------------------
echo
echo "6. Rien n'est deviné"
chk "un engin créé sans classe reste sans classe, quel que soit son type" "None" \
    "$(req POST "/trucks?communeId=$C" '{"registration":"TEST-T BT2","type":"benne_tasseuse","capacityM3":12}' "$T_D" >/dev/null; val "d['classe_collecte']")"
chk "un volume saisi sans provenance reste sans provenance" "None" "$(val "d['volume_provenance']")"
chk "le seed n'a classé aucun engin réel (la base des campagnes est rechargée par le seed)" 0 \
    "$(sql "SELECT count(*) FROM vehicules v JOIN communes c ON c.id = v.commune_id WHERE v.classe_collecte IS NOT NULL AND c.id NOT LIKE 'test%'")"

# -----------------------------------------------------------------------------
echo
echo "7. En partant"
base_reelle_intacte "pendant la campagne"
nettoyer
chk "les communes de test, leurs engins et leurs circuits sont retirés" "0|0|0" \
    "$(sql "SELECT count(*) FROM communes WHERE id IN ($ESSAI)")|$(sql "SELECT count(*) FROM vehicules WHERE registration LIKE 'TEST-T %'")|$(sql "SELECT count(*) FROM circuits WHERE commune_id IN ($ESSAI)")"
base_reelle_intacte "en partant"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
