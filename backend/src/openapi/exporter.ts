// Écrit le contrat d'API dans un fichier, pour le versionner, le transmettre à
// un intégrateur, ou générer un client typé :
//
//   npm run openapi:export          -> openapi.json à la racine du back-end
//
import fs from 'node:fs';
import path from 'node:path';
import { genererDocumentOpenApi } from './document.js';

const destination = process.argv[2] ?? path.resolve(process.cwd(), 'openapi.json');
fs.writeFileSync(destination, JSON.stringify(genererDocumentOpenApi(), null, 2) + '\n', 'utf-8');
console.log(`[openapi] Contrat écrit dans ${destination}`);
