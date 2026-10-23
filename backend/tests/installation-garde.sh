#!/usr/bin/env bash
# =============================================================================
# v0.15.74 — chantier P, lot P6 : les gardes de l'installation.
# exploitation/deploiement/verifier_env.sh ; seed/seed.ts (référentiel seul).
#
# Les procédures elles-mêmes (installer, mettre à jour, revenir) pilotent Docker :
# elles s'éprouvent hors de `npm test`, par essai_bout_en_bout.sh. Cette campagne
# éprouve ce qui peut l'être ici, et d'abord ce qui est REFUSÉ :
#   - le .env d'un serveur : secrets absents, de développement ou trop courts,
#     domaine ou certificat absents, localhost hors essai, certificat de la DSI
#     introuvable, aucune clé de sauvegarde valide ; un .env LU, jamais exécuté ;
#   - les données de démonstration dans une base de production : le seed n'y pose
#     que le référentiel — ni compte, ni camion, ni conteneur, ni secteur fictif
#     dans des communes réelles. En développement, rien ne change.
#
#   docker compose exec -T api npm run test:installation-garde
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
pass=0; fail=0
T=$(mktemp -d)
VERIFIER=exploitation/deploiement/verifier_env.sh
. tests/outils/instance_essai.sh
fin() { retirer_bases_essai; rm -rf "$T"; }
trap fin EXIT

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
command -v age-keygen >/dev/null 2>&1 || apk add -q --no-cache age >/dev/null 2>&1 || { echo "age introuvable." >&2; exit 1; }
CLE1=$(age-keygen 2>/dev/null | grep -o 'age1[0-9a-z]*')
CLE2=$(age-keygen 2>/dev/null | grep -o 'age1[0-9a-z]*')

# Un .env qui convient ; chaque essai en change une ligne.
bon() {
  cat <<EOF
DB_PASSWORD="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
JWT_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
SIIPI_SECRET_IDENTITES=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
SIIPI_SECRET_GPS=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
SIIPI_DOMAINE=siipi.exemple.tn
SIIPI_TLS=exploitation@exemple.tn
SAUVEGARDE_DESTINATAIRES=$CLE1,$CLE2
SAUVEGARDE_DESTINATION=/mnt/copie
SMTP_HOST=smtp.exemple.tn
SUPERVISION_DESTINATAIRES=alertes@exemple.tn
EOF
}
essai() { # nom (le .env est $T/<nom>/.env) — code de sortie, messages dans $T/<nom>/sortie
  bash "$VERIFIER" "$T/$1/.env" > "$T/$1/sortie" 2>&1
  echo $?
}
poser() { mkdir -p "$T/$1"; cat > "$T/$1/.env"; }
dit() { grep -c -- "$2" "$T/$1/sortie"; }

echo "1. Le .env d'un serveur : ce qui est refusé"
chk "aucun fichier : refus" 1 "$(bash "$VERIFIER" "$T/absent/.env" >/dev/null 2>&1; echo $?)"
bon | sed -e 's/^DB_PASSWORD=.*/DB_PASSWORD="siipi_dev_password"/' -e 's/^JWT_SECRET=.*/JWT_SECRET="dev_only_change_me_before_any_real_deployment"/' \
        -e 's/^SIIPI_SECRET_IDENTITES=.*/SIIPI_SECRET_IDENTITES="dev_only_secret_identites_a_remplacer"/' \
        -e 's/^SIIPI_SECRET_GPS=.*/SIIPI_SECRET_GPS="dev_only_secret_gps_a_remplacer"/' | poser dev
chk "les quatre secrets de développement : refus" 1 "$(essai dev)"
chk "… chacun est nommé" "1|1|1|1" "$(dit dev 'DB_PASSWORD a encore')|$(dit dev 'JWT_SECRET a encore')|$(dit dev 'SIIPI_SECRET_IDENTITES a encore')|$(dit dev 'SIIPI_SECRET_GPS a encore')"
bon | sed 's/^JWT_SECRET=.*/JWT_SECRET=court/' | poser court
chk "un secret trop court : refus, et sa longueur est dite" "1|1" "$(essai court)|$(dit court 'JWT_SECRET est trop court (5 caractères')"
bon | grep -v '^SIIPI_DOMAINE=\|^SIIPI_TLS=' | poser sansdomaine
chk "ni domaine ni certificat : refus" "1|1|1" "$(essai sansdomaine)|$(dit sansdomaine 'SIIPI_DOMAINE est absent')|$(dit sansdomaine 'SIIPI_TLS est absent')"
bon | sed 's/^SIIPI_DOMAINE=.*/SIIPI_DOMAINE=localhost/' | poser localhost
chk "localhost avec un vrai certificat : refus (localhost n'est permis qu'en essai)" "1|1" "$(essai localhost)|$(dit localhost "n'est permis qu'en essai")"
bon | sed 's#^SIIPI_TLS=.*#SIIPI_TLS="/certificats/cert.pem /certificats/cle.pem"#' | poser dsi
chk "le certificat de la DSI annoncé mais absent : refus" "1|2" "$(essai dsi)|$(dit dsi 'certificat de la DSI introuvable')"
mkdir -p "$T/dsi/certificats"; : > "$T/dsi/certificats/cert.pem"; : > "$T/dsi/certificats/cle.pem"
chk "… déposé dans ./certificats : accepté" 0 "$(essai dsi)"
bon | sed 's/^SAUVEGARDE_DESTINATAIRES=.*/SAUVEGARDE_DESTINATAIRES=/' | poser sanscle
chk "aucune clé de sauvegarde : refus (rien ne s'écrit en clair)" "1|1" "$(essai sanscle)|$(dit sanscle 'jamais en clair')"
bon | sed "s/^SAUVEGARDE_DESTINATAIRES=.*/SAUVEGARDE_DESTINATAIRES=$CLE1,ssh-rsa-AAAAB3/" | poser mauvaisecle
chk "une clé qui n'en est pas une : refus" "1|1" "$(essai mauvaisecle)|$(dit mauvaisecle "n'est pas une clé publique age")"
bon | sed "s/^SAUVEGARDE_DESTINATAIRES=.*/SAUVEGARDE_DESTINATAIRES=${CLE1:0:40}/" | poser clecourte
chk "une clé tronquée : refus" 1 "$(essai clecourte)"
{ bon; echo "SMTP_UTILISATEUR=\$(touch $T/execute)"; echo "PIEGE=\`touch $T/execute\`"; } | poser piege
essai piege >/dev/null
chk "un .env est lu, jamais exécuté" f "$([ -e "$T/execute" ] && echo t || echo f)"

echo "2. Ce qui est accepté, et ce qui est seulement signalé"
bon | poser bon
chk "un .env complet : accepté, sans avertissement" "0|1" "$(essai bon)|$(dit bon '(0 avertissement')"
bon | sed -e "s/^SAUVEGARDE_DESTINATAIRES=.*/SAUVEGARDE_DESTINATAIRES=$CLE1/" -e 's/^SAUVEGARDE_DESTINATION=.*//' \
        -e 's/^SMTP_HOST=.*//' -e 's/^SUPERVISION_DESTINATAIRES=.*//' -e 's/^SIIPI_TLS=.*/SIIPI_TLS=internal/' | poser avertir
chk "une seule clé, ni copie, ni courriel, ni alerte, un certificat d'essai : accepté, cinq avertissements" "0|1" \
    "$(essai avertir)|$(dit avertir '(5 avertissement')"
chk "… dont la seconde clé de la décision du 23/10/2026" 1 "$(dit avertir 'en prévoit deux')"
bon | sed 's/^SIIPI_DOMAINE=.*/SIIPI_DOMAINE=localhost/; s/^SIIPI_TLS=.*/SIIPI_TLS=internal/' | poser essai_local
chk "localhost avec le certificat d'essai : accepté" 0 "$(essai essai_local)"

echo "3. Le référentiel seul, jamais de démonstration en production"
compter() { # base
  psql_essai "$1" "SELECT (SELECT count(*) FROM communes) > 300, (SELECT count(*) FROM users), (SELECT count(*) FROM vehicules),
                          (SELECT count(*) FROM conteneurs), (SELECT count(*) FROM zones_collecte), (SELECT count(*) FROM barbechas)" | tr '|' ' '
}
seed() { # base [--referentiel]
  DATABASE_URL="$(url_essai "$1")" npx tsx seed/seed.ts ${2:-} > "$T/seed_$1.log" 2>&1
  echo $?
}
base_essai siipi_essai_garde_prod
psql_essai siipi_essai_garde_prod "SELECT app.fixer_nature_instance('production')" >/dev/null
chk "le seed réussit sur une base de production" 0 "$(seed siipi_essai_garde_prod)"
chk "… et n'y pose que le référentiel : ni compte, ni camion, ni conteneur, ni secteur, ni barbécha" "t 0 0 0 0 0" "$(compter siipi_essai_garde_prod)"
chk "… et le dit" 1 "$(grep -c 'Référentiel seul' "$T/seed_siipi_essai_garde_prod.log")"
base_essai siipi_essai_garde_ref
chk "--referentiel sur une base de développement : le référentiel seul aussi" "0|t 0 0 0 0 0" \
    "$(seed siipi_essai_garde_ref --referentiel)|$(compter siipi_essai_garde_ref)"
base_essai siipi_essai_garde_dev
chk "sans option, une base de développement reçoit la démonstration, comme avant" "0|t" \
    "$(seed siipi_essai_garde_dev)|$([ "$(psql_essai siipi_essai_garde_dev 'SELECT count(*) FROM vehicules')" -gt 0 ] && echo t || echo f)"

echo "4. En partant"
retirer_bases_essai
chk "les bases d'essai sont retirées" 0 "$(psql_essai postgres "SELECT count(*) FROM pg_database WHERE datname LIKE 'siipi_essai_garde_%'")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
