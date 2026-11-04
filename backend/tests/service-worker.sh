#!/usr/bin/env bash
# =============================================================================
# v0.15.89 — jalon F, lot F0 : le service worker (E1, E2,
# docs/specs_metier/SPEC_F_releve_terrain.md).
#
# Le service worker n'est enregistré qu'en production : aucune pile d'essai ne
# l'exécutait, et ses défauts n'y apparaissaient pas. Il servait toute requête
# GET de l'origine depuis son cache, API comprise depuis que l'API est sous /api :
# une réponse lue une fois était resservie sans fin, sous son adresse sans le
# jeton (le compte suivant d'un appareil partagé la lisait), un 401 ou un 500
# était rangé comme une réponse, le « no-store » des impressions contourné (E1) ;
# et sa version était figée, si bien qu'un appareil déjà venu ne recevait jamais
# un front nouveau (E2).
#
# La campagne exécute LE fichier web/public/sw.js, version apposée par la
# fonction même de la construction (web/scripts/version-service-worker.mjs),
# dans un banc où le réseau et les caches sont simulés
# (tests/outils/banc_service_worker.mjs). La campagne `proxy-https` fait servir
# ce même fichier par le vrai Caddyfile.
#
# Elle commence par ce qui est refusé : l'API laissée au réseau, sauf trois
# lectures citoyennes ; aucune erreur rangée ni resservie hors ligne ; aucune
# tuile gardée sans fin ; une marque de version absente ou répétée arrête la
# construction. Puis ce qui doit marcher : les lectures citoyennes hors ligne,
# réseau d'abord ; l'application qui s'ouvre hors ligne ; une page toujours prise
# au réseau ; les caches des autres versions purgés ; les notifications.
#
#   docker compose exec -T api npm run test:service-worker
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
pass=0; fail=0
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
SW=/web/public/sw.js
VERSIONNER=/web/scripts/version-service-worker.mjs

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

# Sans les fichiers du front, la campagne n'a rien éprouvé : elle échoue.
if [ ! -f "$SW" ] || [ ! -f "$VERSIONNER" ]; then
  echo "Fichiers du front introuvables ($SW, $VERSIONNER) : docker-compose.yml les monte en lecture seule" >&2
  echo "dans le conteneur api ; recréez-le (docker compose up -d api)." >&2
  exit 1
fi

node tests/outils/banc_service_worker.mjs "$SW" "$VERSIONNER" > "$T/banc.txt" 2> "$T/banc.err" || {
  echo "Le banc n'a pas pu exécuter le service worker :" >&2; cat "$T/banc.err" >&2; exit 1; }
val() { grep -F "$1|" "$T/banc.txt" | head -1 | cut -d'|' -f2-; }
V=$(val version)

echo "1. La version : apposée à la construction, jamais figée"
chk "le service worker porte la marque de version une fois exactement" 1 "$(grep -c '__VERSION_CONSTRUCTION__' "$SW")"
chk "… et aucune version écrite à la main" 0 "$(grep -cE "VERSION = 'siipi-v[0-9]" "$SW")"
apposer() { # texte — le message d'erreur de la construction, ou « ok »
  node --input-type=module -e "
    import { apposerVersion } from '$VERSIONNER';
    try { apposerVersion(process.argv[1], 'abc123'); console.log('ok'); } catch (e) { console.log('refus'); }" "$1"
}
chk "une marque absente arrête la construction" refus "$(apposer "const VERSION = 'siipi-v2';")"
chk "une marque répétée aussi" refus "$(apposer "__VERSION_CONSTRUCTION__ __VERSION_CONSTRUCTION__")"
chk "deux constructions différentes ont deux versions" "t" \
    "$(node --input-type=module -e "
      import { versionDeConstruction } from '$VERSIONNER';
      const a = versionDeConstruction('<script src=\"/assets/app-1.js\">', 'sw'), b = versionDeConstruction('<script src=\"/assets/app-2.js\">', 'sw');
      console.log(a !== b && /^[0-9a-f]{16}\$/.test(a) ? 't' : 'f');")"

echo
echo "2. Ce que le service worker laisse au réseau"
chk "une lecture de l'API (les communes)" non "$(val laisse.api_ordinaire)"
chk "une impression (no-store)" non "$(val laisse.api_impression)"
chk "la session de l'utilisateur" non "$(val laisse.api_session)"
chk "la racine de l'API" non "$(val laisse.api_racine)"
chk "un chemin qui ne fait que commencer comme une lecture citoyenne" non "$(val laisse.api_voisine_de_la_liste)"
chk "une écriture, même sur une lecture citoyenne" non "$(val laisse.ecriture_citoyenne)"
chk "une tuile OpenStreetMap (le cache HTTP du navigateur s'en charge)" non "$(val laisse.tuile_osm)"
chk "une tuile satellite" non "$(val laisse.tuile_esri)"

echo
echo "3. Une erreur n'est jamais rangée, ni resservie hors ligne"
for cas in 401 500 no_store; do
  chk "réponse $cas : rendue telle quelle, non rangée, absente hors ligne" \
      "$( [ "$cas" = no_store ] && echo 200 || echo "$cas" )|non|erreur-reseau" \
      "$(val "erreur.$cas.en_ligne")|$(val "erreur.$cas.rangee")|$(val "erreur.$cas.hors_ligne")"
done

echo
echo "4. Les lectures citoyennes : le réseau d'abord, la dernière réponse hors ligne"
chk "les horaires sont lus au réseau et rangés" "HORAIRES-MARDI|oui" "$(val citoyen.premiere)|$(val citoyen.rangee)"
chk "hors ligne, la dernière réponse est rendue" HORAIRES-MARDI "$(val citoyen.hors_ligne)"
chk "en ligne, le réseau l'emporte sur le cache (l'horaire a changé ce matin)" HORAIRES-JEUDI "$(val citoyen.reseau_d_abord)"
chk "elles sont rangées dans le cache de données de la version, celui que la page purge" "siipi-$V-donnees" "$(val citoyen.cache_de_donnees)"
chk "l'adresse et les annonces aussi" "oui|oui" "$(val citoyen.liste/adresse)|$(val citoyen.liste/annonces)"

echo
echo "5. L'application s'ouvre hors ligne, et une version nouvelle arrive"
chk "l'installation garde l'index, le manifeste et les fichiers que l'index charge" "siipi-$V-coquille|oui,oui,oui,oui" \
    "$(val installation.caches)|$(val installation.coquille)"
chk "une page est toujours prise au réseau" INDEX-NOUVEAU "$(val page.en_ligne)"
chk "la page de maintenance passe telle quelle (503)" 503 "$(val page.maintenance)"
chk "hors ligne, une page rend l'index gardé" index "$(val page.hors_ligne)"
chk "un fichier construit lu une fois se relit hors ligne" VUE "$(val fichier.hors_ligne)"
chk "l'index rendu à la place d'un fichier disparu n'est pas rangé sous son nom" non "$(val fichier.index_a_la_place)"
chk "à l'activation, les caches des autres versions partent, données comprises ; ceux d'un autre site restent" \
    "autre-application,siipi-$V-coquille" "$(val version.caches_apres_activation)"

echo
echo "6. Les notifications"
chk "une notification s'affiche telle qu'envoyée, une charge illisible par un message générique" \
    "Collecte décalée:Jeudi;Propreté Intercommunale:Une nouvelle notification est disponible." "$(val push)"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"; exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"; exit 1
fi
