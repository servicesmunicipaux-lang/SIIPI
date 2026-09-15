// ⚠️ Ce fichier est conservé uniquement pour compatibilité mais n'est plus utilisé par
// l'application : l'annuaire des 350 communes est désormais servi par la vraie API
// (table `communes` en PostgreSQL, importée une fois via `backend/npm run seed` à partir
// de communes_350.json) au lieu d'un fichier JSON statique + overrides en localStorage.
//
// Utilisez src/hooks/useCommunesDirectory.ts dans les composants React.
// Ce fichier ne fait plus aucun accès réseau ni localStorage.

export {};
