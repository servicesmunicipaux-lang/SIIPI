#!/usr/bin/env bash
# =============================================================================
# v0.15.73 — chantier P, lot P5 : la supervision.
# DECISIONS_2026-10-20.md § 4 : « /health surveillé, alerte si la plateforme ou
# la sauvegarde échoue ». exploitation/surveillance/surveiller.sh ;
# GET /supervision/etat (src/routes/supervision.routes.ts).
#
# La campagne lance la surveillance un passage à la fois, contre une fausse API,
# des témoins de sauvegarde fabriqués et un serveur SMTP d'essai
# (tests/outils/serveur_smtp.py), et compte les courriels reçus.
#
# Elle commence par ce qui doit ALERTER, et une seule fois : une sauvegarde
# trop vieille, un échec plus récent que la réussite, une API qui ne répond
# pas, un disque plein, une copie hors serveur absente, un certificat qui
# expire — puis « rétabli », une fois. Un état qui dure n'envoie rien de plus.
# Sans serveur SMTP, rien ne part, c'est écrit, et le passage ne plante pas.
# Puis la route de la FNCT : réservée, sans secret, et qui dit périmé un
# constat périmé, absent un constat absent.
#
#   docker compose exec -T api npm run test:supervision
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
PSQL="psql -q -tA -h ${PGHOST:-localhost} -p ${PGPORT:-5432} -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national}"
pass=0; fail=0
T=$(mktemp -d)
SURVEILLER=exploitation/surveillance/surveiller.sh
PORT_SMTP=2527
PORT_WEB=8091
PORT_TLS=8445
PORT_ESSAI=4012
API_ESSAI="http://localhost:$PORT_ESSAI"
BOITE="$T/boite"
DEST="alertes.supervision.test@siipi.tn"
PID_SMTP=""; PID_WEB=""; PID_TLS=""
COMMUNE=test_supervision
. tests/outils/instance_essai.sh
. tests/outils/communes_essai.sh
. tests/outils/comptes_temporaires.sh
arreter() { local p; for p in $PID_SMTP $PID_WEB $PID_TLS; do kill "$p" 2>/dev/null; wait "$p" 2>/dev/null; done; PID_SMTP=""; PID_WEB=""; PID_TLS=""; }
fin() { arreter; arreter_api_essai; retirer_comptes_temporaires; effacer_communes_essai "'$COMMUNE'"; rm -rf "$T"; }
trap fin EXIT

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

manquants=''
for outil in msmtp openssl jq; do command -v "$outil" >/dev/null 2>&1 || manquants="$manquants $outil"; done
if [ -n "$manquants" ]; then
  # shellcheck disable=SC2086
  apk add -q --no-cache $manquants >/dev/null 2>&1 || { echo "Outils introuvables :$manquants" >&2; exit 1; }
fi

# Une fausse API et un faux site : deux fichiers servis en HTTP.
mkdir -p "$T/web/api" "$T/sauv" "$T/etat" "$T/etat_sans_smtp" "$T/etat_cert"
printf '{"status":"ok","database":"connected"}\n' > "$T/web/health"
cp "$T/web/health" "$T/web/api/health"
(cd "$T/web" && exec python3 -m http.server "$PORT_WEB" --bind 127.0.0.1) >"$T/web.log" 2>&1 &
PID_WEB=$!
python3 tests/outils/serveur_smtp.py "$PORT_SMTP" "$BOITE" >"$T/smtp.log" 2>&1 &
PID_SMTP=$!
for _ in $(seq 1 20); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT_WEB/health" && (echo > "/dev/tcp/127.0.0.1/$PORT_SMTP") 2>/dev/null && break
  sleep 0.5
done

# Les témoins de sauvegarde du lot P2, fabriqués à l'âge voulu.
reussite() { # heures copie
  jq -cn --arg le "$(date -Iseconds -d "-$1 hours")" --arg copie "${2:-faite}" \
    '{le: $le, archive: "siipi_campagne_essai.tar", taille: 1, copie_hors_serveur: $copie, archive_froide: "à jour", originaux_envoyes: 0}' \
    > "$T/sauv/derniere_reussite.json"
}
echec_recent() {
  jq -cn --arg le "$(date -Iseconds)" '{le: $le, etape: "base", message: "base injoignable : essai"}' > "$T/sauv/dernier_echec.json"
}
# Un passage de la surveillance ; les variables passées en arguments l'emportent.
passe() {
  env SUPERVISION_API="http://127.0.0.1:$PORT_WEB" SUPERVISION_SITE="http://127.0.0.1:$PORT_WEB" \
      SUPERVISION_SAUVEGARDES="$T/sauv" SUPERVISION_DISQUES="$T" SUPERVISION_ETAT_DIR="$T/etat" \
      SUPERVISION_DESTINATAIRES="$DEST" SIIPI_INSTANCE=campagne \
      SMTP_HOST=127.0.0.1 SMTP_PORT=$PORT_SMTP SMTP_SECURITE=aucune SMTP_UTILISATEUR= \
      "$@" bash "$SURVEILLER" >"$T/passe.log" 2>&1
  echo $?
}
courriels() { ls -1 "$BOITE" 2>/dev/null | grep -c '\.json$'; }
dernier() { jq -r "$1" "$BOITE/$(ls -1 "$BOITE" | grep '\.json$' | tail -1)" 2>/dev/null; }
etat() { jq -r "$2" "$1/etat.json" 2>/dev/null; }

echo "1. Tout va bien : aucun courriel"
reussite 2
chk "un passage réussit" 0 "$(passe)"
chk "aucun courriel" 0 "$(courriels)"
chk "l'état dit chaque contrôle" "ok|ok|non_verifie|ok|ok|ok" \
    "$(etat "$T/etat" '[.controles.api.etat, .controles.frontal.etat, .controles.certificat.etat, .controles.sauvegarde.etat, .controles.copie.etat, .controles.disque.etat] | join("|")')"
chk "… en français et en arabe" "true|true" \
    "$(etat "$T/etat" '.controles.sauvegarde.message | test("il y a 2 h")')|$(etat "$T/etat" '.controles.sauvegarde.message_ar | test("2 ساعة")')"
chk "… et que les alertes peuvent partir" true "$(etat "$T/etat" .alertes_configurees)"

echo "2. Une sauvegarde trop vieille : une alerte, une seule, puis « rétabli »"
reussite 30
chk "un passage" 0 "$(passe)"
chk "un courriel" 1 "$(courriels)"
chk "… à l'exploitant, « en panne : sauvegarde »" "$DEST|SIIPI (campagne) — en panne : sauvegarde" "$(dernier '.a[0]')|$(dernier .sujet)"
chk "… qui dit depuis combien de temps" 1 "$(dernier .texte | grep -c 'pas réussi depuis 30 h')"
DEPUIS=$(etat "$T/etat" .controles.sauvegarde.depuis)
passe >/dev/null
chk "un second passage, la panne dure : pas de second courriel" 1 "$(courriels)"
chk "… et la panne garde sa date de début" "$DEPUIS" "$(etat "$T/etat" .controles.sauvegarde.depuis)"
reussite 1
passe >/dev/null
chk "la sauvegarde repart : un courriel « rétabli »" "2|SIIPI (campagne) — rétabli : sauvegarde" "$(courriels)|$(dernier .sujet)"
passe >/dev/null
chk "… et un seul" 2 "$(courriels)"

echo "3. Un échec plus récent que la dernière réussite"
echec_recent
passe >/dev/null
chk "une alerte « en panne : sauvegarde »" "3|SIIPI (campagne) — en panne : sauvegarde" "$(courriels)|$(dernier .sujet)"
chk "… qui nomme l'étape qui a échoué" 1 "$(dernier .texte | grep -c 'à l.étape « base »')"
rm -f "$T/sauv/dernier_echec.json"; reussite 0
passe >/dev/null
chk "rétabli" 4 "$(courriels)"

echo "4. L'API, le disque, la copie hors serveur"
chk "l'API ne répond pas : alerte" "0|5|SIIPI (campagne) — en panne : api" \
    "$(passe SUPERVISION_API=http://127.0.0.1:8099)|$(courriels)|$(dernier .sujet)"
chk "le disque se remplit au-delà du seuil (abaissé pour l'essai) : alerte, sans répéter l'API" "6|SIIPI (campagne) — en panne : disque" \
    "$(passe SUPERVISION_API=http://127.0.0.1:8099 SUPERVISION_SEUIL_DISQUE=0 >/dev/null; courriels)|$(dernier .sujet)"
reussite 0 'non configurée'
chk "la copie hors serveur n'est pas configurée : un avertissement" "7|SIIPI (campagne) — en panne : copie|avertissement" \
    "$(passe SUPERVISION_API=http://127.0.0.1:8099 SUPERVISION_SEUIL_DISQUE=0 >/dev/null; courriels)|$(dernier .sujet)|$(etat "$T/etat" .controles.copie.etat)"
reussite 0
passe >/dev/null
chk "tout revient : un seul courriel « rétabli » pour les trois" "8|SIIPI (campagne) — rétabli : api, copie, disque" "$(courriels)|$(dernier .sujet)"

echo "5. Le certificat"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$T/cle5.pem" -out "$T/cert5.pem" -days 5 -subj '/CN=localhost' >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$T/cle60.pem" -out "$T/cert60.pem" -days 60 -subj '/CN=localhost' >/dev/null 2>&1
servir_tls() { [ -n "$PID_TLS" ] && { kill "$PID_TLS"; wait "$PID_TLS" 2>/dev/null; }
  openssl s_server -accept "$PORT_TLS" -cert "$T/cert$1.pem" -key "$T/cle$1.pem" -www >/dev/null 2>&1 & PID_TLS=$!; sleep 1; }
servir_tls 5
passe SUPERVISION_ETAT_DIR="$T/etat_cert" SUPERVISION_SITE=https://localhost SUPERVISION_CONNEXION="localhost:$PORT_TLS" >/dev/null
chk "un certificat qui expire dans moins de 14 jours : en panne" panne "$(etat "$T/etat_cert" .controles.certificat.etat)"
chk "… et le dit" 1 "$(etat "$T/etat_cert" .controles.certificat.message | grep -c 'renouvellement automatique')"
servir_tls 60
passe SUPERVISION_ETAT_DIR="$T/etat_cert" SUPERVISION_SITE=https://localhost SUPERVISION_CONNEXION="localhost:$PORT_TLS" >/dev/null
chk "un certificat valable 60 jours : ok, et le rétablissement est signalé" "ok|t" \
    "$(etat "$T/etat_cert" .controles.certificat.etat)|$(dernier .sujet | grep -q 'rétabli : certificat' && echo t || echo f)"

echo "6. Sans serveur de courriel"
N=$(courriels)
reussite 30
chk "le passage réussit quand même" 0 "$(passe SMTP_HOST= SUPERVISION_ETAT_DIR="$T/etat_sans_smtp")"
chk "… rien ne part" "$N" "$(courriels)"
chk "… et c'est écrit : alertes non configurées, dernière alerte non envoyée" "false|non_configure" \
    "$(etat "$T/etat_sans_smtp" .alertes_configurees)|$(etat "$T/etat_sans_smtp" .derniere_alerte.statut)"
reussite 0
passe >/dev/null

echo "7. La route de la FNCT"
commune_essai "$COMMUNE" "TEST commune de la supervision"
compte_temporaire super_admin_fnct "" "Agent FNCT de la supervision"; FNCT_E="$COMPTE_EMAIL"; FNCT_M="$COMPTE_MDP"
compte_temporaire admin_commune "$COMMUNE" "Directeur de la supervision"; DIR_E="$COMPTE_EMAIL"; DIR_M="$COMPTE_MDP"
api_essai "$PORT_ESSAI" "${PGDATABASE:-siipi_national}" SUPERVISION_ETAT_DIR="$T/etat"; CODE=$?
chk "une API d'essai lit le constat de la surveillance" 0 "$CODE"
jeton() { curl -s -X POST "$API_ESSAI/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}" | jq -r '.token // empty'; }
T_F=$(jeton "$FNCT_E" "$FNCT_M"); T_D=$(jeton "$DIR_E" "$DIR_M")
lire() { curl -s -o "$T/r.json" -w '%{http_code}' "$API_ESSAI/supervision/etat" ${1:+-H "Authorization: Bearer $1"}; }
chk "sans compte : refus" 401 "$(lire)"
chk "un directeur de commune : refus" 403 "$(lire "$T_D")"
chk "la FNCT : l'état" 200 "$(lire "$T_F")"
chk "… six contrôles, dans l'ordre de l'écran" "api frontal certificat sauvegarde copie disque" "$(jq -r '[.controles[].controle] | join(" ")' "$T/r.json")"
chk "… avec leur état et leur message en deux langues" "ok|t|t" \
    "$(jq -r '.controles[] | select(.controle == "sauvegarde") | .etat' "$T/r.json")|$(jq -r '[.controles[] | .message != null and .message_ar != null] | all' "$T/r.json" | sed 's/true/t/')|$(jq -r '.disponible' "$T/r.json" | sed 's/true/t/')"
chk "… un constat frais n'est pas périmé" "false|t" "$(jq -r .perime "$T/r.json")|$([ "$(jq -r .age_minutes "$T/r.json")" -le 5 ] && echo t || echo f)"
chk "… la dernière alerte, sans ses destinataires ni le serveur" "0|0|true" \
    "$(grep -c "$DEST" "$T/r.json")|$(grep -c '127.0.0.1' "$T/r.json")|$(jq -r '.derniere_alerte.envoyee' "$T/r.json")"
jq --arg le "$(date -Iseconds -d '-2 hours')" '.verifie_le = $le' "$T/etat/etat.json" > "$T/etat/x" && mv "$T/etat/x" "$T/etat/etat.json"
lire "$T_F" >/dev/null
chk "un constat vieux de deux heures (la surveillance s'est arrêtée) : périmé, et son âge est dit" "true|t" \
    "$(jq -r .perime "$T/r.json")|$([ "$(jq -r .age_minutes "$T/r.json")" -ge 119 ] && echo t || echo f)"
rm -f "$T/etat/etat.json"
lire "$T_F" >/dev/null
chk "aucun constat : « indisponible », rien n'est supposé" "false|0|null" \
    "$(jq -r .disponible "$T/r.json")|$(jq '.controles | length' "$T/r.json")|$(jq -r .perime "$T/r.json")"

echo "8. En partant"
arreter; arreter_api_essai; retirer_comptes_temporaires; effacer_communes_essai "'$COMMUNE'"
chk "les comptes et la commune de test sont retirés" "0|0" \
    "$($PSQL -c "SELECT count(*) FROM users WHERE email IN ('$FNCT_E', '$DIR_E')")|$($PSQL -c "SELECT count(*) FROM communes WHERE id = '$COMMUNE'")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
