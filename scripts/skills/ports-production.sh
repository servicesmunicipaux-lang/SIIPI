#!/usr/bin/env bash
# =============================================================================
# skill:ports-production — le compose de production ne publie que 80 et 443.
#
# CE QUE CET OUTIL CHERCHE, ET POURQUOI. Une base ou une API joignable depuis
# internet contourne le HTTPS et la limite des tentatives de connexion : le
# frontal (Caddy, chantier P, lot P4) doit être la SEULE porte. Un port ajouté
# « pour voir » dans docker-compose.prod.yml ne se voit pas à la lecture d'un
# diff de cinquante lignes ; il se voit ici.
#
# Il lit la configuration résolue (docker compose config) et sort en erreur dès
# qu'un service autre que `frontal` publie un port, ou que `frontal` publie
# autre chose que 80 et 443.
#
#   bash scripts/skills/ports-production.sh
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

# Des valeurs de forme seulement : config exige les variables obligatoires, et rien ne démarre.
# Toutes les variables obligatoires : une seule manquante, et config échoue sans rien vérifier
# (oubli de la v0.15.72, quand SIIPI_SECRET_IDENTITES est devenue obligatoire).
config=$(DB_PASSWORD=verification JWT_SECRET=verification SIIPI_SECRET_IDENTITES=verification \
  SIIPI_DOMAINE=verification.invalid SIIPI_TLS=internal \
  docker compose -f docker-compose.prod.yml config)

alerte=0
service=''
while IFS= read -r ligne; do
  if [[ "$ligne" =~ ^\ \ ([a-z_-]+):$ ]]; then service="${BASH_REMATCH[1]}"; fi
  if [[ "$ligne" =~ published:\ \"?([0-9]+)\"? ]]; then
    port="${BASH_REMATCH[1]}"
    if [ "$service" != frontal ] || { [ "$port" != 80 ] && [ "$port" != 443 ]; }; then
      printf '  \033[31m✗\033[0m %s publie le port %s\n' "$service" "$port"
      alerte=$((alerte + 1))
    else
      printf '  \033[32m✓\033[0m %s publie le port %s\n' "$service" "$port"
    fi
  fi
done < <(sed -n '/^services:/,/^[a-z]/p' <<< "$config")

if [ "$alerte" -gt 0 ]; then
  echo "Seul le frontal publie des ports, et seulement 80 et 443."
  exit 1
fi
echo "Seul le frontal publie des ports : 80 et 443."
