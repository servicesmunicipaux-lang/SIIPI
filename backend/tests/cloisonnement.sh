#!/usr/bin/env bash
# =============================================================================
# Test de non-régression du cloisonnement entre communes (migration 013).
#
# Ce script vérifie, contre une API réellement démarrée et une base réellement
# peuplée, que chaque fuite identifiée avant la mise en place du Row-Level
# Security reste fermée, et que ce qui doit rester accessible l'est toujours.
#
# Il ne teste PAS le code des routes : il teste ce que la base accepte de
# montrer. Une route à qui on retirerait son filtre par commune doit continuer
# à ne rien laisser passer.
#
# Usage :
#   docker compose up -d
#   docker compose run --rm api npm run migrate
#   docker compose run --rm api npm run seed
#   docker compose run --rm api npm run test:cloisonnement
#
# Note : l'API limite les tentatives de connexion à 20 par quart d'heure et par
# adresse IP (anti-bruteforce). Pour rejouer plusieurs campagnes d'affilée,
# démarrer l'API avec AUTH_RATE_LIMIT_MAX=200 — jamais en production.
#
# Variables : API_URL (défaut http://localhost:4000)
# Les comptes utilisés sont ceux créés par le seed de démonstration.
# =============================================================================

set -u
API="${API_URL:-http://localhost:4000}"
MDP="Siipi2026!"
pass=0; fail=0

tok() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$MDP\"}" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null
}
code() { curl -s -o /tmp/siipi_test_body.json -w '%{http_code}' "$@"; }
len()  { python3 -c "import json;d=json.load(open('/tmp/siipi_test_body.json'));print(len(d) if isinstance(d,list) else 'non-liste')" 2>/dev/null || echo erreur; }
chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}

T_FNCT=$(tok admin.national@siipi.tn)
T_MARSA=$(tok directeur.marsa@siipi.tn)
T_SFAX=$(tok directeur.sfax@siipi.tn)
T_PREST_MARSA=$(tok prestataire.marsa@siipi.tn)
T_PREST_HS=$(tok prestataire.houmtsouk@siipi.tn)
T_CITOYEN=$(tok citoyen.demo@siipi.tn)

if [ -z "$T_FNCT" ] || [ -z "$T_MARSA" ]; then
  echo "Impossible de se connecter à $API — l'API est-elle démarrée et la base seedée ?" >&2
  exit 1
fi

echo
echo "Préparation : dépôt d'une réclamation citoyenne sur La Marsa"
TICKET=$(curl -s -X POST "$API/tickets" -H "Authorization: Bearer $T_CITOYEN" \
  -H 'Content-Type: application/json' \
  -d '{"communeId":"tunis_la_marsa","category":"point_noir","title":"Test automatise de cloisonnement","lat":36.88,"lng":10.32}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
[ -n "$TICKET" ] || { echo "Échec de la création de la réclamation de test." >&2; exit 1; }

# Les compteurs sont relevés avant, pour que la campagne puisse être rejouée
# sans base vierge : ce sont les ÉCARTS qui sont vérifiés, pas des valeurs
# absolues qui dépendraient de l'historique.
PREST_AVANT=$(code "$API/tickets?assignedToMe=true" -H "Authorization: Bearer $T_PREST_MARSA" >/dev/null; len)
PREST_COMMUNE_AVANT=$(code "$API/tickets?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_PREST_MARSA" >/dev/null; len)

echo
echo "1. Étanchéité entre communes"
c=$(code "$API/tickets?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_SFAX")
chk "Sfax ne voit aucune réclamation de La Marsa" 0 "$(len)"
c=$(code "$API/trucks?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_SFAX")
chk "Sfax ne voit aucun engin de La Marsa" 0 "$(len)"
c=$(code "$API/containers?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_SFAX")
chk "Sfax ne voit aucun conteneur de La Marsa" 0 "$(len)"
c=$(code "$API/zones?communeId=medenine_djerba_houmt_souk" -H "Authorization: Bearer $T_MARSA")
chk "La Marsa ne voit pas le découpage de Houmt Souk" 0 "$(len)"
c=$(code -X PATCH "$API/communes/sfax_sfax_ville_medina" -H "Authorization: Bearer $T_MARSA" \
      -H 'Content-Type: application/json' -d '{"notes":"intrusion"}')
chk "La Marsa ne peut pas modifier la fiche de Sfax" 403 "$c"
c=$(code -X POST "$API/kpi/five-axis" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
      -d '{"communeId":"sfax_sfax_ville_medina","efficaciteOperationnelle":10,"qualiteService":10,"performanceEnvironnementale":10,"performanceEconomique":10,"securiteRh":10}')
chk "La Marsa ne peut pas noter la commune de Sfax" 403 "$c"

echo
echo "2. Périmètre des prestataires privés (TDR §3.2.11)"
c=$(code "$API/tickets?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_PREST_MARSA")
chk "un prestataire ne voit pas la réclamation qu'on vient de déposer" "$PREST_COMMUNE_AVANT" "$(len)"
c=$(code "$API/trucks?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_PREST_MARSA")
chk "un prestataire sans zone ne voit aucun engin" 0 "$(len)"
c=$(code "$API/zones?communeId=medenine_djerba_houmt_souk" -H "Authorization: Bearer $T_PREST_HS")
chk "un prestataire voit le découpage de sa commune" 1 "$(len)"
c=$(code "$API/zones?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_PREST_HS")
chk "un prestataire ne voit pas le découpage d'une autre commune" 0 "$(len)"

echo
echo "3. Données citoyennes"
c=$(code "$API/zones?communeId=medenine_djerba_houmt_souk" -H "Authorization: Bearer $T_CITOYEN")
chk "un citoyen ne voit aucun découpage communal" 0 "$(len)"
c=$(code "$API/trucks?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_CITOYEN")
chk "un citoyen ne voit aucune flotte municipale" 0 "$(len)"
c=$(code -X PATCH "$API/tickets/$TICKET/accept" -H "Authorization: Bearer $T_CITOYEN" \
      -H 'Content-Type: application/json' -d '{}')
chk "un citoyen ne peut pas instruire une réclamation" 403 "$c"

echo
echo "4. Aucun accès sans authentification"
for ep in /communes /communes/stats /communes/boundaries /trucks /tickets /kpi/five-axis/tunis_la_marsa; do
  c=$(code "$API$ep"); chk "GET $ep refusé sans jeton" 401 "$c"
done

echo
echo "5. Ce qui doit rester accessible"
c=$(code "$API/communes" -H "Authorization: Bearer $T_SFAX")
chk "annuaire des 350 communes visible par toute commune" 350 "$(len)"
c=$(code "$API/communes/stats" -H "Authorization: Bearer $T_MARSA")
chk "statistiques nationales" 200 "$c"
c=$(code -X POST "$API/kpi/five-axis" -H "Authorization: Bearer $T_MARSA" -H 'Content-Type: application/json' \
      -d '{"communeId":"tunis_la_marsa","efficaciteOperationnelle":82,"qualiteService":75,"performanceEnvironnementale":60,"performanceEconomique":70,"securiteRh":88}')
chk "une commune note sa propre performance" 201 "$c"
c=$(code "$API/kpi/five-axis/tunis_la_marsa" -H "Authorization: Bearer $T_SFAX")
chk "une commune consulte le score d'une autre (émulation)" 200 "$c"
c=$(code "$API/trucks?communeId=tunis_la_marsa" -H "Authorization: Bearer $T_MARSA")
chk "une commune voit sa propre flotte" 2 "$(len)"
c=$(code -X PATCH "$API/communes/tunis_la_marsa" -H "Authorization: Bearer $T_MARSA" \
      -H 'Content-Type: application/json' -d '{"notes":"mise a jour legitime"}')
chk "une commune met à jour sa propre fiche" 200 "$c"
c=$(code "$API/auth/me" -H "Authorization: Bearer $T_MARSA")
chk "/auth/me reste appelable (pas de limitation de débit)" 200 "$c"

echo
echo "6. Workflow complet d'une réclamation"
c=$(code -X PATCH "$API/tickets/$TICKET/accept" -H "Authorization: Bearer $T_MARSA" \
      -H 'Content-Type: application/json' -d '{}')
chk "la commune accepte la réclamation" 200 "$c"
PRESTATAIRE=$(curl -s "$API/communes/tunis_la_marsa/prestataires" -H "Authorization: Bearer $T_MARSA" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['id'] if d else '')" 2>/dev/null)
c=$(code -X PATCH "$API/tickets/$TICKET/assign" -H "Authorization: Bearer $T_MARSA" \
      -H 'Content-Type: application/json' -d "{\"prestataireUserId\":\"$PRESTATAIRE\"}")
chk "transfert au prestataire" 200 "$c"
c=$(code "$API/tickets?assignedToMe=true" -H "Authorization: Bearer $T_PREST_MARSA")
chk "le prestataire voit la réclamation qui lui est transférée" "$((PREST_AVANT+1))" "$(len)"
c=$(code -X PATCH "$API/tickets/$TICKET/treat" -H "Authorization: Bearer $T_PREST_MARSA" \
      -H 'Content-Type: application/json' -d '{"status":"resolu","resolutionNote":"traite par test automatise"}')
chk "le prestataire traite la réclamation" 200 "$c"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s tests réussis, aucun échec.\033[0m\n\n' "$pass"
  exit 0
else
  printf '\033[31m%s réussis, %s ÉCHOUÉS.\033[0m\n\n' "$pass" "$fail"
  exit 1
fi
