#!/usr/bin/env bash
# =============================================================================
# Lot 16.1 — conformité du registre des pré-collecteurs (barbechas).
# docs/specs_metier/SPEC_v0.16.md, R1 à R3 ; migration 056.
#
# Elle commence par ce que la base REFUSE (SPEC § 5) :
#   - retrouver `cin`, `health_insurance_status`, le revenu individuel ou le
#     nom dans le registre — ou le CIN et le nom dans le journal d'audit ;
#   - enregistrer une identité tant que l'hébergement n'est pas accrédité ;
#   - l'enregistrer dans une commune sans récépissé INPDP ;
#   - lire l'identité en tant que FNCT, ou en tant qu'admin d'une autre commune.
# Puis : l'empreinte HMAC (jamais le CIN), le dédoublonnage, le journal des
# lectures, le revenu agrégé et masqué sous cinq pré-collecteurs, le retrait.
#
# Données fictives de même format que le réel : CIN de huit chiffres en 9999…,
# pré-collecteurs TEST-BARB-…, nettoyés en fin de campagne ; les paramètres
# national et communaux touchés sont rétablis.
#
#   docker compose exec -T api npm run test:barbechas
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
refus() { $PSQL -c "$1" >"$T/err.txt" 2>&1; grep -c "$2" "$T/err.txt" | head -1; }
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
# Deux admins de deux communes différentes, au mot de passe définitif.
DIRS=$(sql "SELECT string_agg(email, ',') FROM (SELECT DISTINCT ON (commune_id) email FROM users
             WHERE role='admin_commune' AND deleted_at IS NULL AND is_active AND NOT mot_de_passe_provisoire AND commune_id IS NOT NULL
             ORDER BY commune_id, created_at LIMIT 2) x")
DIR_A=${DIRS%%,*}; DIR_B=${DIRS##*,}
T_A=$(tok "$DIR_A"); T_B=$(tok "$DIR_B")
A=$(sql "SELECT commune_id FROM users WHERE email='$DIR_A'")
B=$(sql "SELECT commune_id FROM users WHERE email='$DIR_B'")
[ "$A" != "$B" ] || { echo "Il faut deux admins de communes différentes." >&2; exit 1; }

# L'état à rétablir en partant.
HEB_AVANT=$($PSQL -c "SELECT valeur||'|'||COALESCE(reference,'') FROM parametres_nationaux WHERE cle='hebergement_pii_accredite'")
# « absent » : la commune n'avait aucune ligne de paramètres, et la campagne en
# crée une en enregistrant un récépissé — elle l'efface en partant.
recepisse() { $PSQL -c "SELECT COALESCE((SELECT COALESCE(recepisse_inpdp,'')||'|'||COALESCE(recepisse_inpdp_date::text,'')
                                           FROM parametres_commune WHERE commune_id='$1'), 'absent')"; }
REC_A=$(recepisse "$A"); REC_B=$(recepisse "$B")

nettoyer() {
  $PSQL -c "DELETE FROM donnees_personnelles_barbechas WHERE barbecha_id IN (SELECT id FROM barbechas WHERE id_precollecteur LIKE 'TEST-BARB-%');
            DELETE FROM barbecha_deliveries WHERE barbecha_id IN (SELECT id FROM barbechas WHERE id_precollecteur LIKE 'TEST-BARB-%');
            DELETE FROM barbechas WHERE id_precollecteur LIKE 'TEST-BARB-%';" >/dev/null 2>&1
}
retablir() {
  local v=${HEB_AVANT%%|*} r=${HEB_AVANT#*|}
  $PSQL -c "UPDATE parametres_nationaux SET valeur='${v:-false}', reference=NULLIF('$r','') WHERE cle='hebergement_pii_accredite';" >/dev/null 2>&1
  for c in "$A:$REC_A" "$B:$REC_B"; do
    local id=${c%%:*} rec=${c#*:}
    if [ "$rec" = absent ]; then
      $PSQL -c "DELETE FROM parametres_commune WHERE commune_id='$id';" >/dev/null 2>&1
      continue
    fi
    local num=${rec%%|*} dat=${rec#*|}
    $PSQL -c "UPDATE parametres_commune SET recepisse_inpdp=NULLIF('$num',''), recepisse_inpdp_date=NULLIF('$dat','')::date WHERE commune_id='$id';" >/dev/null 2>&1
  done
}
nettoyer
$PSQL -c "UPDATE parametres_nationaux SET valeur='false', reference=NULL WHERE cle='hebergement_pii_accredite';
          UPDATE parametres_commune SET recepisse_inpdp=NULL, recepisse_inpdp_date=NULL WHERE commune_id IN ('$A','$B');" >/dev/null

# Huit pré-collecteurs dans A (six dans une zone, deux dans une autre), un dans B.
for i in 1 2 3 4 5 6; do
  $PSQL -c "INSERT INTO barbechas (id_precollecteur, zone, commune_id, vehicle_type) VALUES ('TEST-BARB-A-0$i', 'TEST-ZONE-UN', '$A', 'charette');" >/dev/null
done
for i in 7 8; do
  $PSQL -c "INSERT INTO barbechas (id_precollecteur, zone, commune_id, vehicle_type) VALUES ('TEST-BARB-A-0$i', 'TEST-ZONE-DEUX', '$A', 'tricycle_electrique');" >/dev/null
done
$PSQL -c "INSERT INTO barbechas (id_precollecteur, zone, commune_id, vehicle_type) VALUES ('TEST-BARB-B-01', 'TEST-ZONE-B', '$B', 'charette');" >/dev/null
id_de() { sql "SELECT id FROM barbechas WHERE id_precollecteur='$1'"; }
A1=$(id_de TEST-BARB-A-01); A2=$(id_de TEST-BARB-A-02); A3=$(id_de TEST-BARB-A-03); B1=$(id_de TEST-BARB-B-01)

# -----------------------------------------------------------------------------
echo
echo "1. Ce que la base ne contient plus"
chk "le registre n'a plus ni CIN, ni assurance maladie, ni revenu individuel, ni nom, ni compte" 0 \
    "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name='barbechas'
             AND column_name IN ('cin','health_insurance_status','earnings_this_month_tnd','name','user_id')")"
chk "aucune table ne porte de colonne cin ni health_insurance_status" 0 \
    "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('cin','health_insurance_status')")"
chk "le journal d'audit n'en garde pas de copie" 0 \
    "$(sql "SELECT count(*) FROM audit_log WHERE table_name='barbechas'
             AND (old_data ?| ARRAY['cin','name','health_insurance_status','earnings_this_month_tnd']
               OR new_data ?| ARRAY['cin','name','health_insurance_status','earnings_this_month_tnd'])")"
chk "la table d'identité est sous RLS forcée" "true|true" \
    "$(sql "SELECT relrowsecurity||'|'||relforcerowsecurity FROM pg_class WHERE relname='donnees_personnelles_barbechas'")"

# -----------------------------------------------------------------------------
echo
echo "2. Ce que la base refuse"
CODE=$(appel PUT "/barbechas/$A1/identite" "$T_A" '{"nomComplet":"Test Pré-collecteur Un","cin":"99999901"}')
chk "identité tant que l'hébergement n'est pas accrédité : refusée (409)" "409|1" "$CODE|$(val "int('accrédité' in d['error'])")"
chk "… et refusée par la base elle-même, même au super-utilisateur" 1 \
    "$(refus "INSERT INTO donnees_personnelles_barbechas (barbecha_id, commune_id, nom_complet) VALUES ('$A1', '$A', 'Test');" IDENTITE_HEBERGEMENT)"
CODE=$(appel PUT /observatoire/hebergement-identites "$T_A" '{"accredite":true,"reference":"TEST-convention"}')
chk "un admin communal ne déclare pas l'hébergement accrédité" 403 "$CODE"
CODE=$(appel PUT /observatoire/hebergement-identites "$T_FNCT" '{"accredite":true}')
chk "la FNCT ne le déclare pas sans citer la pièce qui le fonde" 400 "$CODE"
chk "… et la base le refuse aussi" 1 \
    "$(refus "UPDATE parametres_nationaux SET valeur='true', reference=NULL WHERE cle='hebergement_pii_accredite';" parametres_nationaux_hebergement_reference)"
CODE=$(appel PUT /observatoire/hebergement-identites "$T_FNCT" '{"accredite":true,"reference":"TEST-convention d’hébergement n° 0001/2026"}')
chk "la FNCT déclare l'hébergement accrédité, pièce citée" "200|True" "$CODE|$(val "d['accredite']")"
CODE=$(appel PUT "/barbechas/$A1/identite" "$T_A" '{"nomComplet":"Test Pré-collecteur Un","cin":"99999901"}')
chk "identité dans une commune sans récépissé INPDP : refusée (409)" "409|1" "$CODE|$(val "int('INPDP' in d['error'])")"
chk "… et refusée par la base" 1 \
    "$(refus "INSERT INTO donnees_personnelles_barbechas (barbecha_id, commune_id, nom_complet) VALUES ('$A1', '$A', 'Test');" IDENTITE_RECEPISSE)"
CODE=$(appel PUT "/communes/$B/recepisse-inpdp" "$T_A" '{"numero":"TEST-0001","date":"2026-09-01"}')
chk "un admin n'enregistre pas le récépissé d'une autre commune" 403 "$CODE"
CODE=$(appel PUT "/communes/$A/recepisse-inpdp" "$T_A" '{"numero":"TEST-0001","date":null}')
chk "un récépissé sans date : refusé" 400 "$CODE"

# -----------------------------------------------------------------------------
echo
echo "3. L'identité : une empreinte, jamais le CIN"
CODE=$(appel PUT "/communes/$A/recepisse-inpdp" "$T_A" '{"numero":"TEST-0001/2026","date":"2026-09-01"}')
chk "la commune enregistre son récépissé" "200|TEST-0001/2026" "$CODE|$(val "d['recepisse_inpdp']")"
CODE=$(appel PUT "/barbechas/$A1/identite" "$T_A" '{"nomComplet":"Test Pré-collecteur Un","cin":"99999901"}')
chk "l'admin de la commune enregistre l'identité" "200|True" "$CODE|$(val "d['cin_enregistre']")"
chk "la réponse ne renvoie ni le CIN ni son empreinte" 0 "$(grep -cE '99999901|empreinte' "$T/r.json")"
chk "le CIN en clair n'est nulle part : identité, journal d'audit, journal des accès" 0 \
    "$(sql "SELECT (SELECT count(*) FROM donnees_personnelles_barbechas d WHERE d::text LIKE '%99999901%')
                 + (SELECT count(*) FROM audit_log WHERE old_data::text LIKE '%99999901%' OR new_data::text LIKE '%99999901%')
                 + (SELECT count(*) FROM access_log WHERE endpoint LIKE '%99999901%')")"
EMPREINTE=$(sql "SELECT empreinte_cin FROM donnees_personnelles_barbechas WHERE barbecha_id='$A1'")
chk "l'empreinte est un HMAC-SHA256 (64 hexadécimaux)…" 1 "$(printf '%s' "$EMPREINTE" | grep -cE '^[0-9a-f]{64}$')"
chk "… et pas un simple SHA-256 du CIN, qui s'énumère en secondes" 0 \
    "$(python3 -c "import hashlib;print(int(hashlib.sha256(b'99999901').hexdigest()=='$EMPREINTE'))")"
CODE=$(appel PUT "/barbechas/$A2/identite" "$T_A" '{"nomComplet":"Test Pré-collecteur Deux","cin":"99999901"}')
chk "le même CIN pour un autre pré-collecteur de la commune : refusé (409)" "409|1" "$CODE|$(val "int('déjà enregistré' in d['error'])")"
CODE=$(appel PUT "/barbechas/$A2/identite" "$T_A" '{"nomComplet":"Test Pré-collecteur Deux","cin":"9999 99 01"}')
chk "… même saisi avec des espaces (CIN normalisé)" 409 "$CODE"
CODE=$(appel PUT "/barbechas/$A2/identite" "$T_A" '{"nomComplet":"Test Pré-collecteur Deux","cin":"9999990"}')
chk "un CIN de sept chiffres : refusé, sans que le message ne le répète" "400|0" "$CODE|$(grep -c 9999990 "$T/r.json")"

CODE=$(appel GET "/barbechas/$A1/identite" "$T_A")
chk "l'admin de la commune lit l'identité" "200|Test Pré-collecteur Un" "$CODE|$(val "d['nom_complet']")"
chk "… et cette lecture est journalisée" 1 \
    "$(sql "SELECT count(*) FROM access_log WHERE '$A1' = ANY(precollecteur_ids) AND accessed_at > now() - interval '1 minute'")"
CODE=$(appel GET "/barbechas/$A1/identite" "$T_FNCT")
chk "la FNCT ne lit pas l'identité d'un pré-collecteur (pas de finalité)" 403 "$CODE"
chk "… ni en base, sous le rôle de l'application" 0 \
    "$($PSQL -c "BEGIN; SELECT set_config('app.role','super_admin_fnct',true); SET LOCAL ROLE siipi_app;
                 SELECT count(*) FROM donnees_personnelles_barbechas; ROLLBACK;" 2>/dev/null | grep -E '^[0-9]+$' | head -1)"
CODE=$(appel GET "/barbechas/$A1/identite" "$T_B")
chk "l'admin d'une autre commune : introuvable (404, jamais 403)" 404 "$CODE"
appel GET "/barbechas?communeId=$A" "$T_A" >/dev/null
chk "le registre ne montre que le pseudonyme" "0" \
    "$(val "sum(1 for b in d for k in b if k in ('name','nom_complet','cin','empreinte_cin','earnings_this_month_tnd','health_insurance_status'))")"

# Une clé par commune : le même CIN ailleurs n'a pas la même empreinte, et
# les registres de deux communes ne se recoupent pas.
appel PUT "/communes/$B/recepisse-inpdp" "$T_FNCT" '{"numero":"TEST-0002/2026","date":"2026-09-01"}' >/dev/null
CODE=$(appel PUT "/barbechas/$B1/identite" "$T_B" '{"nomComplet":"Test Pré-collecteur Bis","cin":"99999901"}')
chk "le même CIN dans une autre commune s'enregistre…" 200 "$CODE"
chk "… sous une autre empreinte (clé propre à la commune)" 1 \
    "$(sql "SELECT count(DISTINCT empreinte_cin) - 1 FROM donnees_personnelles_barbechas WHERE barbecha_id IN ('$A1','$B1')")"

# -----------------------------------------------------------------------------
echo
echo "4. Le revenu : par zone et par mois, masqué sous cinq pré-collecteurs"
for code in TEST-BARB-A-01 TEST-BARB-A-02 TEST-BARB-A-03 TEST-BARB-A-04 TEST-BARB-A-05 TEST-BARB-A-06 TEST-BARB-A-07 TEST-BARB-A-08; do
  appel POST "/barbechas/$(id_de $code)/deliveries" "$T_A" '{"material":"Carton","weightKg":10}' >/dev/null
done
MOIS=$(sql "SELECT to_char(now(), 'YYYY-MM')")
CODE=$(appel GET "/barbechas/revenus?communeId=$A&mois=$MOIS" "$T_A")
chk "six pré-collecteurs dans une zone : le revenu s'affiche (6 × 10 kg de carton à 0,35 TND)" "200|6|False|21.0|60.0" \
    "$CODE|$(val "[z['participants'] for z in d['zones'] if z['zone']=='TEST-ZONE-UN'][0]")|$(val "[z['masque'] for z in d['zones'] if z['zone']=='TEST-ZONE-UN'][0]")|$(val "float([z['montant_tnd'] for z in d['zones'] if z['zone']=='TEST-ZONE-UN'][0])")|$(val "float([z['poids_kg'] for z in d['zones'] if z['zone']=='TEST-ZONE-UN'][0])")"
chk "deux pré-collecteurs : poids et montant masqués, le nombre dit pourquoi" "2|True|None|None" \
    "$(val "[z['participants'] for z in d['zones'] if z['zone']=='TEST-ZONE-DEUX'][0]")|$(val "[z['masque'] for z in d['zones'] if z['zone']=='TEST-ZONE-DEUX'][0]")|$(val "[z['montant_tnd'] for z in d['zones'] if z['zone']=='TEST-ZONE-DEUX'][0]")|$(val "[z['poids_kg'] for z in d['zones'] if z['zone']=='TEST-ZONE-DEUX'][0]")"
CODE=$(appel GET "/barbechas/revenus?communeId=$A&mois=$MOIS" "$T_B")
chk "le revenu d'une autre commune ne se lit pas" "0" "$(val "len(d['zones'])")"
chk "le cumul pesé suit toujours les livraisons" "10.00" "$(sql "SELECT collected_total_kg FROM barbechas WHERE id='$A1'")"

# -----------------------------------------------------------------------------
echo
echo "5. Le retrait, et la révocation"
appel PUT "/barbechas/$A3/identite" "$T_A" '{"nomComplet":"Test Pré-collecteur Trois"}' >/dev/null
CODE=$(appel DELETE "/barbechas/$A1/identite" "$T_A")
chk "l'admin de la commune retire une identité" 204 "$CODE"
CODE=$(appel GET "/barbechas/$A1/identite" "$T_A")
chk "… qui n'est plus lisible" 404 "$CODE"
appel PUT /observatoire/hebergement-identites "$T_FNCT" '{"accredite":false}' >/dev/null
CODE=$(appel PUT "/barbechas/$A2/identite" "$T_A" '{"nomComplet":"Test Pré-collecteur Deux"}')
chk "accréditation révoquée : plus aucune identité ne s'enregistre" 409 "$CODE"
CODE=$(appel DELETE "/barbechas/$A3/identite" "$T_A")
chk "… mais une identité se retire toujours" 204 "$CODE"

nettoyer
retablir
chk "état d'origine rétabli (hébergement, récépissés)" "$HEB_AVANT|$REC_A|$REC_B" \
    "$($PSQL -c "SELECT valeur||'|'||COALESCE(reference,'') FROM parametres_nationaux WHERE cle='hebergement_pii_accredite'")|$(recepisse "$A")|$(recepisse "$B")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
