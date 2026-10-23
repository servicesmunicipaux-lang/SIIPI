#!/usr/bin/env bash
# =============================================================================
# v0.15.70 — chantier P, lot P2 : les sauvegardes chiffrées.
# DECISIONS_2026-10-20.md § 4 et son complément du 23/10/2026 ;
# exploitation/sauvegarde/sauvegarder.sh, rotation.sh.
#
# Elle commence par ce que la sauvegarde REFUSE ou rate : sans clé publique, avec
# une clé qui n'en est pas une, sur une base injoignable — aucune archive, un
# témoin d'échec, et le témoin de réussite intact. Puis elle prouve qu'une
# archive est illisible sans clé, lisible avec chacune des deux, que son
# manifeste dit exactement ce que contiennent la base et le dossier des
# fichiers, que la rotation garde ce que dit un témoin écrit à part (Python,
# d'après la règle seule), que la copie hors du serveur arrive et n'efface jamais
# en miroir, et qu'un original de l'archive froide part une fois, une seule, et
# reste à la destination même effacé sur place.
#
# Tout se passe sur une base d'essai à part (tests/outils/instance_essai.sh) et
# dans un dossier temporaire : la base des campagnes et ses fichiers ne sont ni
# lus ni écrits par la sauvegarde.
#
#   docker compose exec -T api npm run test:sauvegarde
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
pass=0; fail=0
T=$(mktemp -d)
BASE=siipi_essai_sauvegarde
SAUVER=exploitation/sauvegarde/sauvegarder.sh
ROTATION=exploitation/sauvegarde/rotation.sh
. tests/outils/instance_essai.sh
fin() { retirer_bases_essai; rm -rf "$T"; }
trap fin EXIT

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

# Les outils de l'image de sauvegarde, dans le conteneur des campagnes.
manquants=''
for outil in age rclone jq; do command -v "$outil" >/dev/null 2>&1 || manquants="$manquants $outil"; done
tar --version 2>/dev/null | grep -q GNU || manquants="$manquants tar"
if [ -n "$manquants" ]; then
  # shellcheck disable=SC2086
  apk add -q --no-cache $manquants >/dev/null 2>&1 || { echo "Outils introuvables :$manquants" >&2; exit 1; }
fi

age-keygen -o "$T/cle1" 2>/dev/null; age-keygen -o "$T/cle2" 2>/dev/null; age-keygen -o "$T/cle3" 2>/dev/null
PUB1=$(age-keygen -y "$T/cle1"); PUB2=$(age-keygen -y "$T/cle2")
base_essai "$BASE"
psql_essai "$BASE" "CREATE TABLE temoin_sauvegarde (n int); INSERT INTO temoin_sauvegarde SELECT generate_series(1, 37);" >/dev/null
mkdir -p "$T/fichiers/2026/10" "$T/archive/originaux"
printf 'photo témoin\n' > "$T/fichiers/2026/10/photo-temoin.jpg"
printf 'document\n' > "$T/fichiers/2026/10/rapport final.pdf"
head -c 200000 /dev/urandom > "$T/fichiers/gros.bin"
printf 'original 1\n' > "$T/archive/originaux/o1.jpg"
printf 'original 2\n' > "$T/archive/originaux/o2.jpg"

# Une sauvegarde : code de sortie. Les variables passées en arguments l'emportent.
sauver() {
  sleep 1   # le nom porte la seconde : deux passages dans la même seconde auraient le même
  env PGDATABASE="$BASE" SAUVEGARDE_DESTINATAIRES="$PUB1,$PUB2" SAUVEGARDE_INSTANCE=campagne \
      SAUVEGARDE_DOSSIER="$T/s" SIIPI_FICHIERS_DIR="$T/fichiers" SIIPI_ARCHIVE_DIR="$T/archive" \
      SAUVEGARDE_DESTINATION= "$@" bash "$SAUVER" >"$T/sortie.log" 2>&1
  echo $?
}
archives() { ls -1 "$1" 2>/dev/null | grep -cE '\.tar$'; }
temoin() { jq -r "$2" "$T/s/$1" 2>/dev/null || echo absent; }
# La règle de rotation, écrite à part du script, d'après la décision seule.
attendu_rotation() {
  python3 -c '
import sys, re, datetime
noms = [l.strip() for l in sys.stdin if re.search(r"_\d{4}-\d{2}-\d{2}_\d{6}\.tar$", l.strip())]
par_date = {}
for n in noms:
    d, h = n[-21:-11], n[-10:-4]
    if d not in par_date or h > par_date[d][0]:
        par_date[d] = (h, n)
dates = sorted(par_date, reverse=True)
jours = set(dates[:7])
dimanches = set([d for d in dates if datetime.date.fromisoformat(d).weekday() == 6][:4])
premiers = set([d for d in dates if d.endswith("-01")][:12])
for d in sorted(jours | dimanches | premiers):
    print(par_date[d][1])'
}
# Des noms d'archives fabriqués : plus d'un an, des trous, des doublons dans la journée.
fabriquer_noms() {
  python3 -c '
import datetime
d = datetime.date(2025, 7, 1)
i = 0
while d < datetime.date(2026, 9, 20):
    if i % 5 != 3:
        print(f"siipi_campagne_{d.isoformat()}_023000.tar")
        if i % 9 == 0:
            print(f"siipi_campagne_{d.isoformat()}_101500.tar")
    d += datetime.timedelta(days=1); i += 1'
}

echo "1. Ce que la sauvegarde refuse"
chk "sans clé publique : refus" 1 "$(sauver SAUVEGARDE_DESTINATAIRES=)"
chk "… aucune archive, et l'échec est écrit à l'étape des clés" "0|clés publiques" "$(archives "$T/s")|$(temoin dernier_echec.json .etape)"
chk "… il dit qu'une sauvegarde ne s'écrit jamais en clair" 1 "$(grep -c 'jamais en clair' "$T/s/dernier_echec.json")"
chk "une clé qui n'est pas une clé age : refus" "1|0" "$(sauver SAUVEGARDE_DESTINATAIRES=ssh-rsa-AAAA)|$(archives "$T/s")"
chk "une clé age tronquée : refusée par age avant le dump" "1|0|clés publiques" \
    "$(sauver SAUVEGARDE_DESTINATAIRES="${PUB1:0:30}")|$(archives "$T/s")|$(temoin dernier_echec.json .etape)"
chk "une base injoignable : refus" 1 "$(sauver PGDATABASE=siipi_essai_absente)"
chk "… aucune archive, ni partielle ni en cours" "0|0" "$(archives "$T/s")|$(ls -1A "$T/s" | grep -cE '^\.en_cours|partiel')"
chk "… l'échec est écrit à l'étape de la base" base "$(temoin dernier_echec.json .etape)"
chk "aucun échec n'a écrit de témoin de réussite" absent "$(temoin derniere_reussite.json .archive)"

echo "2. Une sauvegarde, sans destination hors du serveur"
chk "elle réussit" 0 "$(sauver)"
NOM=$(ls -1 "$T/s" | grep -E '\.tar$')
chk "une archive, une seule" 1 "$(archives "$T/s")"
chk "le témoin la nomme" "$NOM" "$(temoin derniere_reussite.json .archive)"
chk "… et dit que la copie hors serveur n'est pas configurée, l'archive froide non plus" "non configurée|non configurée" \
    "$(temoin derniere_reussite.json .copie_hors_serveur)|$(temoin derniere_reussite.json .archive_froide)"
chk "l'archive porte trois membres chiffrés, rien d'autre" "base.dump.age fichiers.tar.age manifeste.json.age" \
    "$(tar -tf "$T/s/$NOM" | sort | tr '\n' ' ' | sed 's/ $//')"
chk "rien n'y est lisible en clair : ni dump, ni nom de fichier, ni nom de table" "0|0|0" \
    "$(grep -ac PGDMP "$T/s/$NOM")|$(grep -ac photo-temoin "$T/s/$NOM")|$(grep -ac temoin_sauvegarde "$T/s/$NOM")"
mkdir -p "$T/x"; tar -C "$T/x" -xf "$T/s/$NOM"
chk "une autre clé ne l'ouvre pas" 1 "$(age -d -i "$T/cle3" "$T/x/base.dump.age" >/dev/null 2>&1; echo $?)"
chk "la première clé l'ouvre : un dump PostgreSQL" PGDMP "$(age -d -i "$T/cle1" "$T/x/base.dump.age" | head -c 5)"
chk "la seconde aussi : chacune restaure seule" PGDMP "$(age -d -i "$T/cle2" "$T/x/base.dump.age" | head -c 5)"
age -d -i "$T/cle1" "$T/x/base.dump.age" > "$T/x/base.dump"
chk "le dump contient la table témoin" 1 "$(pg_restore -l "$T/x/base.dump" | grep -c 'TABLE public temoin_sauvegarde')"
age -d -i "$T/cle2" "$T/x/manifeste.json.age" > "$T/x/manifeste.json"
chk "le manifeste dit la nature de la base" developpement "$(jq -r .schema.nature "$T/x/manifeste.json")"
chk "… son nombre de migrations" "$(psql_essai "$BASE" 'SELECT count(*) FROM schema_migrations')" "$(jq -r .schema.migrations "$T/x/manifeste.json")"
chk "… le nombre de lignes de la table témoin" 37 "$(jq -r '.tables["public.temoin_sauvegarde"]' "$T/x/manifeste.json")"
chk "… et autant de tables que la base" "$(psql_essai "$BASE" "SELECT count(*) FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema <> 'information_schema' AND table_schema NOT LIKE 'pg\_%'")" \
    "$(jq '.tables | length' "$T/x/manifeste.json")"
chk "… chaque fichier avec son empreinte" "3|$(sha256sum "$T/fichiers/2026/10/rapport final.pdf" | cut -c1-64)" \
    "$(jq '.fichiers | length' "$T/x/manifeste.json")|$(jq -r '.fichiers[] | select(.chemin == "./2026/10/rapport final.pdf") | .empreinte' "$T/x/manifeste.json")"
mkdir -p "$T/x/fichiers"; age -d -i "$T/cle1" "$T/x/fichiers.tar.age" | tar -C "$T/x/fichiers" -xf -
chk "les fichiers repris sont identiques aux fichiers déposés" 0 "$(diff -r "$T/fichiers" "$T/x/fichiers" >/dev/null 2>&1; echo $?)"

echo "3. Un échec ne passe jamais pour une réussite"
REUSSITE=$(cat "$T/s/derniere_reussite.json")
chk "une base injoignable, après une réussite : échec" 1 "$(sauver PGDATABASE=siipi_essai_absente)"
chk "… le témoin de réussite n'a pas bougé" "$REUSSITE" "$(cat "$T/s/derniere_reussite.json")"
chk "… l'archive précédente est intacte, aucune autre n'est née" "1|$NOM" "$(archives "$T/s")|$(ls -1 "$T/s" | grep -E '\.tar$')"
chk "… le témoin d'échec est plus récent que la réussite" t \
    "$([ "$(temoin dernier_echec.json .le)" \> "$(temoin derniere_reussite.json .le)" ] && echo t || echo f)"

echo "4. La rotation"
fabriquer_noms > "$T/noms"
printf 'notes.txt\nsiipi_campagne_2026-13-40.tar\n' >> "$T/noms"
bash "$ROTATION" < "$T/noms" | sort > "$T/gardes"
bash "$ROTATION" --a-retirer < "$T/noms" | sort > "$T/retires"
attendu_rotation < "$T/noms" | sort > "$T/attendus"
chk "elle garde exactement ce que dit la règle (7 dates, 4 dimanches, 12 premiers du mois)" "$(wc -l < "$T/attendus")|0" \
    "$(wc -l < "$T/gardes")|$(diff "$T/gardes" "$T/attendus" | grep -c '^[<>]')"
chk "… une archive par date, la plus récente de la journée" "0|0" \
    "$(cut -c16-25 "$T/gardes" | sort | uniq -d | wc -l)|$(grep '_023000' "$T/gardes" | sed 's/_023000/_101500/' | grep -cxFf - "$T/noms")"
chk "gardées et retirées se partagent tous les noms reconnus, sans recouvrement" "$(grep -cE '_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}\.tar$' "$T/noms")|0" \
    "$(cat "$T/gardes" "$T/retires" | sort -u | wc -l)|$(comm -12 "$T/gardes" "$T/retires" | wc -l)"
chk "un nom qu'elle ne reconnaît pas n'est ni gardé ni retiré" 0 "$(cat "$T/gardes" "$T/retires" | grep -cE 'notes|2026-13-40')"
# Des archives arrêtées au 9 janvier, lues bien plus tard : le calendrier n'y retire rien.
printf 'siipi_campagne_2026-01-%02d_023000.tar\n' 2 3 4 5 6 7 8 9 > "$T/arret"
chk "des semaines sans sauvegarde ne retirent pas les 7 dernières bonnes" 7 \
    "$(bash "$ROTATION" < "$T/arret" | grep -cxFf <(tail -7 "$T/arret"))"
# Dans un passage réel : le dossier porte de vieilles archives (vides) et un fichier étranger.
while IFS= read -r n; do : > "$T/s/$n"; done < <(grep -E '\.tar$' "$T/noms" | grep -v 2026-13-40)
: > "$T/s/notes.txt"
chk "un passage réussit sur un dossier chargé" 0 "$(sauver)"
NOM2=$(temoin derniere_reussite.json .archive)
{ grep -E '\.tar$' "$T/noms" | grep -v 2026-13-40; echo "$NOM2"; } | attendu_rotation | sort > "$T/attendus"
chk "… il n'y reste que ce que la règle garde, la nouvelle archive comprise" 0 \
    "$(diff <(ls -1 "$T/s" | grep -E '\.tar$' | sort) "$T/attendus" | grep -c '^[<>]')"
chk "… la première archive du jour est remplacée par la nouvelle" "f|t" \
    "$([ -e "$T/s/$NOM" ] && echo t || echo f)|$([ -e "$T/s/$NOM2" ] && echo t || echo f)"
chk "… et le fichier étranger est toujours là" t "$([ -e "$T/s/notes.txt" ] && echo t || echo f)"

echo "5. Hors du serveur"
DEHORS="$T/dehors"
mkdir -p "$DEHORS/archives"
while IFS= read -r n; do : > "$DEHORS/archives/$n"; done < <(grep -E '\.tar$' "$T/noms" | grep -v 2026-13-40 | head -60)
chk "un passage avec une destination réussit" 0 "$(sauver SAUVEGARDE_DESTINATION="$DEHORS")"
NOM3=$(temoin derniere_reussite.json .archive)
chk "le témoin dit la copie faite et l'archive froide à jour" "faite|à jour|2" \
    "$(temoin derniere_reussite.json .copie_hors_serveur)|$(temoin derniere_reussite.json .archive_froide)|$(temoin derniere_reussite.json .originaux_envoyes)"
chk "la copie est identique à l'archive" "$(sha256sum "$T/s/$NOM3" | cut -c1-64)" "$(sha256sum "$DEHORS/archives/$NOM3" 2>/dev/null | cut -c1-64)"
{ grep -E '\.tar$' "$T/noms" | grep -v 2026-13-40 | head -60; echo "$NOM3"; } | attendu_rotation | sort > "$T/attendus"
chk "la destination suit la même rotation" 0 "$(diff <(ls -1 "$DEHORS/archives" | sort) "$T/attendus" | grep -c '^[<>]')"
chk "les deux originaux sont partis, chiffrés" "2|0" \
    "$(find "$DEHORS/archive_froide" -name '*.age' | wc -l)|$(grep -rac 'original 1' "$DEHORS/archive_froide" | grep -vc ':0$')"
chk "… et s'ouvrent avec une clé de la FNCT" "original 1" "$(age -d -i "$T/cle2" "$DEHORS/archive_froide/originaux/o1.jpg.age")"
chk "un second passage n'envoie aucun original déjà parti" "0|0" "$(sauver SAUVEGARDE_DESTINATION="$DEHORS")|$(temoin derniere_reussite.json .originaux_envoyes)"
printf 'original 3\n' > "$T/archive/originaux/o3.jpg"
rm "$T/archive/originaux/o1.jpg"
chk "un nouvel original part, une fois" "0|1" "$(sauver SAUVEGARDE_DESTINATION="$DEHORS")|$(temoin derniere_reussite.json .originaux_envoyes)"
chk "un original effacé sur place reste à la destination" "t|3" \
    "$([ -e "$DEHORS/archive_froide/originaux/o1.jpg.age" ] && echo t || echo f)|$(find "$DEHORS/archive_froide" -name '*.age' | wc -l)"
AVANT=$(archives "$DEHORS/archives")
rm -f "$T/s"/*.tar
chk "un serveur au dossier vidé n'efface pas la destination (pas de miroir)" 0 "$(sauver SAUVEGARDE_DESTINATION="$DEHORS")"
chk "… elle garde toutes ses archives (celle du jour remplacée par la nouvelle)" "$AVANT" "$(archives "$DEHORS/archives")"

echo "6. Une destination injoignable"
DERNIERE=$(temoin derniere_reussite.json .archive)
chk "la copie échoue : le passage échoue" 1 "$(sauver SAUVEGARDE_DESTINATION=inexistant:siipi)"
chk "… à l'étape de la copie hors serveur" "copie hors serveur" "$(temoin dernier_echec.json .etape)"
chk "… l'archive du serveur est gardée : elle est complète et chiffrée" t \
    "$([ "$(ls -1t "$T/s" | grep -E '\.tar$' | head -1)" != "$DERNIERE" ] && echo t || echo f)"
chk "… et le témoin de réussite reste celui du passage précédent" "$DERNIERE" "$(temoin derniere_reussite.json .archive)"

echo "7. Beaucoup de fichiers"
# Jusqu'à la v0.15.71, les empreintes passaient en argument à jq : au-delà de quelques
# centaines de photos, « Argument list too long », et la sauvegarde échouait chaque nuit.
mkdir -p "$T/fichiers/lot"
for i in $(seq 1 2000); do printf '%s\n' "$i" > "$T/fichiers/lot/photo-$i.jpg"; done
chk "un dossier de 2 003 fichiers se sauvegarde" 0 "$(sauver)"
mkdir -p "$T/y"; tar -C "$T/y" -xf "$T/s/$(temoin derniere_reussite.json .archive)"
chk "… et son manifeste les compte tous" 2003 "$(age -d -i "$T/cle1" "$T/y/manifeste.json.age" | jq '.fichiers | length')"

echo "8. En partant"
retirer_bases_essai
chk "la base d'essai est retirée" 0 "$(psql_essai postgres "SELECT count(*) FROM pg_database WHERE datname = '$BASE'")"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
