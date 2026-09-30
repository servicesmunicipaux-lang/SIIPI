#!/usr/bin/env node
// =============================================================================
// skill:pdf-template — gabarit d'un document administratif tunisien.
//   الوثائق القانونية المعتمدة
//
// CE QU'UN DOCUMENT ADMINISTRATIF DOIT PORTER, ET QUI N'EST PAS DÉCORATIF.
// Un bon de sortie de carburant sans numéro d'ordre continu ne prouve rien :
// on ne peut pas montrer qu'aucun bon ne manque. Une fiche de déclassement
// sans référence réglementaire ne s'oppose à personne. Un ordre de mission
// sans les deux signatures n'engage pas la commune. Ces éléments sont la
// raison d'être du document ; le gabarit les rend obligatoires.
//
// Cinq invariants, tenus par ce générateur :
//   1. en-tête bilingue — République tunisienne, gouvernorat, commune ;
//   2. numéro d'ordre CONTINU, porté par la base, jamais par l'écran ;
//   3. référence réglementaire explicite ;
//   4. bloc de signatures avec les qualités, pas seulement les noms ;
//   5. mention d'édition (date, heure de Tunis, agent) — un document réimprimé
//      six mois plus tard doit dire quand il a été produit.
//
// Le rendu est du HTML imprimable en A4 : pas de dépendance PDF native dans
// l'image Docker, et la commune peut l'imprimer comme l'archiver.
//
//   node scripts/skills/pdf-template.mjs <type> [--ecrire]
//   types : ordre-mission · bon-carburant · declassement · bon-travail
// =============================================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const TYPES = {
  'ordre-mission': {
    fr: 'ORDRE DE MISSION', ar: 'أمر بمهمة',
    reference: "Arrêté municipal — déplacement d'agent en service commandé",
    champs: [
      ['Agent', 'العون', 'nom_complet'],
      ['Grade / fonction', 'الرتبة / الخطة', 'fonction'],
      ['Destination', 'الوجهة', 'destination'],
      ['Objet de la mission', 'موضوع المهمة', 'objet'],
      ['Du', 'من', 'date_debut'],
      ['Au', 'إلى', 'date_fin'],
      ['Moyen de transport', 'وسيلة النقل', 'vehicule'],
    ],
    signatures: [['L’agent', 'العون'], ['Le Président de la commune', 'رئيس البلدية']],
  },
  'bon-carburant': {
    fr: 'BON DE SORTIE DE CARBURANT', ar: 'إذن بإخراج الوقود',
    reference: 'Registre des carburants — comptabilité matières de la commune',
    champs: [
      ['Engin', 'الآلية', 'registration'],
      ['Type de carburant', 'نوع الوقود', 'carburant'],
      ['Quantité (litres)', 'الكمية (لتر)', 'litres'],
      ['Index kilométrique', 'عداد الكيلومترات', 'kilometrage'],
      ['Chauffeur', 'السائق', 'chauffeur'],
      ['Circuit / destination', 'المسلك / الوجهة', 'circuit'],
      ['Date de sortie', 'تاريخ الإخراج', 'date'],
    ],
    // Trois signatures : celui qui reçoit, celui qui délivre, celui qui
    // autorise. Deux suffiraient à la forme ; trois font la séparation qui
    // rend le contrôle possible.
    signatures: [['Le chauffeur', 'السائق'], ['Le magasinier', 'أمين المخزن'], ['Le chef de parc', 'رئيس الحظيرة']],
  },
  'declassement': {
    fr: 'FICHE DE DÉCLASSEMENT', ar: 'بطاقة طرح المعدات',
    reference: 'Comptabilité matières — sortie d’inventaire pour réforme',
    champs: [
      ['Engin / matériel', 'الآلية / المعدات', 'registration'],
      ['Type', 'النوع', 'type'],
      ['Date de première mise en circulation', 'تاريخ أول تسجيل', 'date_premiere_circulation'],
      ['Valeur d’acquisition (TND)', 'قيمة الاقتناء (د.ت)', 'valeur_achat_tnd'],
      ['Motif du déclassement', 'سبب الطرح', 'motif'],
      ['État constaté', 'الحالة المعاينة', 'etat'],
    ],
    signatures: [['Le chef de parc', 'رئيس الحظيرة'], ['La commission de réforme', 'لجنة الطرح'], ['Le Président de la commune', 'رئيس البلدية']],
  },
  'bon-travail': {
    fr: 'BON DE TRAVAIL — MAINTENANCE', ar: 'إذن بالأشغال — الصيانة',
    reference: 'Registre de maintenance — GMAO communale',
    champs: [
      ['Engin', 'الآلية', 'registration'],
      ['Nature de l’intervention', 'طبيعة التدخل', 'type_intervention'],
      ['Atelier / prestataire', 'الورشة / المزود', 'prestataire'],
      ['Index kilométrique', 'عداد الكيلومترات', 'kilometrage'],
      ['Coût (TND)', 'الكلفة (د.ت)', 'cout_tnd'],
      ['Date d’entrée', 'تاريخ الدخول', 'date_entree'],
      ['Date de sortie', 'تاريخ الخروج', 'date_sortie'],
    ],
    signatures: [['Le chef de parc', 'رئيس الحظيرة'], ['Le prestataire', 'المزود']],
  },
};

const [type, ...reste] = process.argv.slice(2);
if (!type || !TYPES[type]) {
  console.error('Usage : node scripts/skills/pdf-template.mjs <type> [--ecrire]');
  console.error('Types :', Object.keys(TYPES).join(' · '));
  process.exit(2);
}
const d = TYPES[type];
const ecrire = reste.includes('--ecrire');

const ligne = ([fr, ar, champ]) => `      <tr>
        <th scope="row">${fr}<span class="ar">${ar}</span></th>
        <td>{{${champ}}}</td>
      </tr>`;

const signature = ([fr, ar]) => `      <div class="signature">
        <p>${fr}<span class="ar">${ar}</span></p>
        <div class="cadre"></div>
      </div>`;

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${d.fr}</title>
<style>
  /* A4 avec des marges d'administration : 2 cm, pour la reliure et le tampon. */
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 0; }
  .ar { display: block; font-size: 0.85em; color: #555; direction: rtl; }

  /* En-tête : l'État, puis le gouvernorat, puis la commune. L'ordre est celui
     de la hiérarchie administrative, et il ne s'inverse pas. */
  .entete { display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 2px solid #1a1a1a; padding-bottom: 8mm; margin-bottom: 8mm; }
  .entete .fr { text-align: left; } .entete .ar-bloc { text-align: right; direction: rtl; }
  .entete p { margin: 0 0 2px; line-height: 1.35; }
  .entete .etat { font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }

  h1 { font-size: 15pt; text-align: center; margin: 0 0 2mm; letter-spacing: .5px; }
  h1 .ar { font-size: 0.8em; margin-top: 2px; }

  /* Le numéro d'ordre et la référence réglementaire : c'est ce qui fait la
     valeur juridique du document, pas sa mise en page. */
  .reference { text-align: center; font-size: 9.5pt; color: #444; margin-bottom: 8mm; }
  .reference strong { color: #1a1a1a; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; }
  th, td { border: 1px solid #999; padding: 3mm 4mm; vertical-align: top; }
  th { width: 45%; text-align: start; background: #f4f4f4; font-weight: 600; }

  .observations { border: 1px solid #999; min-height: 25mm; padding: 3mm 4mm; margin-bottom: 10mm; }
  .observations .titre { font-weight: 600; font-size: 9.5pt; margin-bottom: 2mm; }

  .signatures { display: flex; justify-content: space-between; gap: 8mm; }
  .signature { flex: 1; text-align: center; font-size: 9.5pt; }
  .signature .cadre { border: 1px solid #999; height: 28mm; margin-top: 2mm; }

  /* Mention d'édition : un document réimprimé six mois plus tard doit dire
     quand il a été produit, et par qui. */
  .pied { position: fixed; bottom: 8mm; left: 0; right: 0; text-align: center;
          font-size: 8pt; color: #777; border-top: 1px solid #ddd; padding-top: 2mm; }
</style>
</head>
<body>

<header class="entete">
  <div class="fr">
    <p class="etat">République Tunisienne</p>
    <p>Ministère de l’Intérieur</p>
    <p>Gouvernorat de {{gouvernorat}}</p>
    <p><strong>Commune de {{commune}}</strong></p>
  </div>
  <div class="ar-bloc">
    <p class="etat">الجمهورية التونسية</p>
    <p>وزارة الداخلية</p>
    <p>ولاية {{gouvernorat_ar}}</p>
    <p><strong>بلدية {{commune_ar}}</strong></p>
  </div>
</header>

<h1>${d.fr}<span class="ar">${d.ar}</span></h1>

<p class="reference">
  N° <strong>{{numero}}</strong> / {{annee}} &nbsp;·&nbsp; ${d.reference}
</p>

<table>
  <tbody>
${d.champs.map(ligne).join('\n')}
  </tbody>
</table>

<div class="observations">
  <div class="titre">Observations<span class="ar">ملاحظات</span></div>
  {{observations}}
</div>

<div class="signatures">
${d.signatures.map(signature).join('\n')}
</div>

<footer class="pied">
  Édité le {{edite_le}} à {{edite_a}} (heure de Tunis) par {{edite_par}} — SIIPI / FNCT
</footer>

</body>
</html>
`;

const racine = join(dirname(new URL(import.meta.url).pathname), '..', '..');
const chemin = join(racine, 'backend', 'src', 'documents', 'gabarits', `${type}.html`);

if (ecrire) {
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, html, 'utf8');
  console.log(`\u001b[32mGabarit écrit :\u001b[0m ${chemin.replace(racine + '/', '')}`);
} else {
  console.log(html);
}

console.error(`
\u001b[90mCe que le code appelant DOIT fournir, et qui ne s'improvise pas :
  numero      un numéro d'ordre CONTINU, tiré d'une séquence en base et par
              type de document. Un numéro calculé à l'écran ne prouve rien :
              on ne peut pas montrer qu'aucun bon ne manque.
  edite_le / edite_a   date et heure de TUNIS (UTC+1), pas l'heure du serveur.
  edite_par   l'agent qui édite, tiré du jeton — jamais saisi.
  {{...}} non renseigné : laisser VIDE. Ne jamais écrire « 0 » ni « N/A » dans
              un document qui engage la commune.\u001b[0m
`);
