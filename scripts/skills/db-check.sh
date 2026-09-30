#!/usr/bin/env bash
# =============================================================================
# skill:db-check — inspection du schéma PostGIS et contrôle du cloisonnement.
#
# CE QUE CET OUTIL CHERCHE, ET POURQUOI. Une table métier qui porte un
# commune_id sans politique RLS est un trou de cloisonnement : elle paraît
# rangée, elle se lit d'une commune à l'autre. Le défaut ne se voit pas à la
# lecture du code — il se voit en interrogeant le catalogue de PostgreSQL, ce
# que personne ne fait spontanément.
#
# Il vérifie cinq choses :
#   1. RLS activée ET forcée sur toute table portant commune_id
#   2. chaque table protégée a bien des politiques, et lesquelles
#   3. les politiques s'appuient sur app.mes_communes() et non sur la seule
#      commune principale (défaut rencontré trois fois)
#   4. les colonnes géographiques ont le bon SRID et un index GIST
#   5. les fonctions SECURITY DEFINER fixent bien leur search_path
#
#   bash scripts/skills/db-check.sh            # tout
#   bash scripts/skills/db-check.sh rls        # un seul bloc
# =============================================================================
set -u
BLOC="${1:-tout}"
DC="docker compose"; docker compose version >/dev/null 2>&1 || DC="docker-compose"
PSQL="$DC exec -T db psql -qtA -U ${PGUSER:-siipi_admin} -d ${PGDATABASE:-siipi_national} -F| -c"
alerte=0
titre() { printf '\n\033[1m%s\033[0m\n' "$1"; }
ko()    { printf '  \033[31m✗\033[0m %s\n' "$1"; alerte=$((alerte+1)); }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$1"; }

if [ "$BLOC" = tout ] || [ "$BLOC" = rls ]; then
titre "1. Cloisonnement — toute table portant commune_id doit être protégée"
$PSQL "
SELECT c.relname,
       c.relrowsecurity::text, c.relforcerowsecurity::text,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
   AND EXISTS (SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attname = 'commune_id' AND NOT a.attisdropped)
 ORDER BY 1;" 2>/dev/null | while IFS='|' read -r t rls force nb; do
  [ -z "$t" ] && continue
  if [ "$rls" != t ];        then ko "$t : RLS non activée"
  elif [ "$force" != t ];    then ko "$t : RLS non FORCÉE (le propriétaire de la table y échappe)"
  elif [ "$nb" = 0 ];        then ko "$t : RLS activée mais AUCUNE politique — la table est fermée à tous"
  else ok "$t ($nb politiques)"; fi
done

titre "2. Les politiques qui ignorent l'intercommunalité"
# app.current_commune() seul = la commune PRINCIPALE. Trois défauts sont nés là :
# un agent rattaché à deux communes obtenait un écran vide sur la seconde.
$PSQL "
SELECT c.relname || ' / ' || p.polname
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND pg_get_expr(COALESCE(p.polqual, p.polwithcheck), p.polrelid) LIKE '%current_commune%'
   AND pg_get_expr(COALESCE(p.polqual, p.polwithcheck), p.polrelid) NOT LIKE '%mes_communes%'
   AND pg_get_expr(COALESCE(p.polqual, p.polwithcheck), p.polrelid) NOT LIKE '%can_read_commune%'
   AND pg_get_expr(COALESCE(p.polqual, p.polwithcheck), p.polrelid) NOT LIKE '%can_write_commune%'
 ORDER BY 1;" 2>/dev/null | while read -r l; do
  [ -n "$l" ] && ko "$l : compare à la commune PRINCIPALE, pas au périmètre réel"
done
echo "  (aucune ligne ci-dessus = aucune politique suspecte)"
fi

if [ "$BLOC" = tout ] || [ "$BLOC" = geo ]; then
titre "3. Colonnes géographiques : SRID et index"
$PSQL "
SELECT g.f_table_name || '.' || g.f_geometry_column, g.srid::text, g.type,
       (SELECT count(*) FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
         WHERE i.indrelid = (quote_ident(g.f_table_name))::regclass
           AND ic.relam = (SELECT oid FROM pg_am WHERE amname='gist'))::text
  FROM geometry_columns g WHERE g.f_table_schema='public' ORDER BY 1;" 2>/dev/null |
while IFS='|' read -r col srid typ gist; do
  [ -z "$col" ] && continue
  # 4326 : le système de coordonnées de tous les relevés GPS. Une géométrie dans
  # un autre système se superposerait mal aux traces du terrain.
  if [ "$srid" != 4326 ]; then ko "$col : SRID $srid (4326 attendu)"
  elif [ "$gist" = 0 ];   then ko "$col : aucun index GIST — toute recherche de proximité balaiera la table"
  else ok "$col ($typ, SRID $srid, index GIST)"; fi
done
fi

if [ "$BLOC" = tout ] || [ "$BLOC" = fonctions ]; then
titre "4. Fonctions SECURITY DEFINER sans search_path fixé"
# Une fonction SECURITY DEFINER s'exécute avec les droits de son propriétaire.
# Sans search_path figé, un schéma glissé devant public détourne ses appels.
$PSQL "
SELECT n.nspname || '.' || p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE p.prosecdef AND n.nspname IN ('app','public')
   AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
 ORDER BY 1;" 2>/dev/null | while read -r f; do
  [ -n "$f" ] && ko "$f : SECURITY DEFINER sans search_path"
done
echo "  (aucune ligne ci-dessus = toutes les fonctions sont sûres)"

titre "5. Ce que le rôle applicatif peut détruire"
# siipi_app ne doit jamais pouvoir effacer : la suppression est LOGIQUE.
$PSQL "
SELECT table_name FROM information_schema.table_privileges
 WHERE grantee='siipi_app' AND privilege_type IN ('DELETE','TRUNCATE')
 GROUP BY 1 ORDER BY 1;" 2>/dev/null | while read -r t; do
  [ -n "$t" ] && ko "$t : siipi_app peut effacer des lignes (la suppression doit être logique)"
done
echo "  (sondage_questions est la seule exception admise — voir migration 037)"
fi

printf '\n'
if [ "$alerte" -eq 0 ]; then printf '\033[32mAucune alerte.\033[0m\n\n'; else printf '\033[31m%s alerte(s).\033[0m\n\n' "$alerte"; exit 1; fi
