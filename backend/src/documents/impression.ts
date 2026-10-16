// L'impression d'un document à numérotation scellée (lot 16.2) : une page A4
// bilingue, en HTML imprimable — pas de moteur PDF dans l'image Docker, et la
// commune l'imprime ou l'archive en PDF depuis le navigateur.
//
// Ce que la page porte, et qui n'est pas décoratif (scripts/skills/pdf-template.mjs) :
// l'en-tête de l'État, du gouvernorat et de la commune ; le numéro d'ordre
// continu, attribué par la base ; la référence ; les signatures avec leurs
// qualités ; la mention d'édition (date, heure de Tunis, auteur) — une pièce
// réimprimée six mois plus tard dit quand et par qui.
//
// MODÈLE PROVISOIRE (décision du 16/10/2026) : tant que le gabarit n'est pas
// validé par un chef de dépôt, la page le dit en bandeau, en français et en
// arabe. ANNULÉ : un document annulé s'imprime encore — son numéro reste au
// registre — mais barré, avec le motif.
//
// Le contenu vient de la base, saisi par un agent : tout est échappé. Un champ
// vide reste une case vide : ni tiret, ni zéro (critère de sortie du lot).

import { GABARITS, type TypeDocument } from './gabarits.js';

export type DocumentAImprimer = {
  type_document: TypeDocument;
  numero_affiche: string;
  exercice: number;
  statut: 'emis' | 'annule';
  contenu: Record<string, unknown>;
  /** Date d'émission, en date de Tunis (AAAA-MM-JJ). */
  emis_le: string;
  motif_annulation: string | null;
  empreinte_contenu: string;
};

export type EnTete = { commune: string; commune_ar: string | null; gouvernorat: string; gouvernorat_ar: string | null };

const echapper = (v: unknown) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

function valeur(v: unknown, nature: string, unite?: string): string {
  if (v === undefined || v === null || v === '') return '';
  if (nature === 'date' && typeof v === 'string') return echapper(dateFr(v));
  if (nature === 'nombre' && typeof v === 'number') {
    return `${echapper(new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(v))}${unite ? ` ${echapper(unite)}` : ''}`;
  }
  if (nature === 'oui_non' && typeof v === 'boolean') return v ? 'Oui — نعم' : 'Non — لا';
  return echapper(v).replace(/\n/g, '<br>');
}

/** L'heure de Tunis (UTC+1, sans heure d'été), quelle que soit celle du serveur. */
function maintenantTunis() {
  const t = new Date(Date.now() + 3_600_000).toISOString();
  return { date: dateFr(t.slice(0, 10)), heure: t.slice(11, 16) };
}

export function rendreDocument(doc: DocumentAImprimer, entete: EnTete, editePar: string): string {
  const g = GABARITS[doc.type_document];
  const edite = maintenantTunis();
  const lignes = g.champs
    .filter((c) => c.cle !== 'observations')
    .map(
      (c) => `      <tr><th scope="row">${echapper(c.fr)}<span class="ar">${echapper(c.ar)}</span></th>` +
        `<td>${valeur(doc.contenu[c.cle], c.nature, c.unite)}</td></tr>`
    )
    .join('\n');
  const observations = valeur(doc.contenu.observations, 'texte_long');
  const signatures = g.signatures
    .map((s) => `      <div class="signature"><p>${echapper(s.fr)}<span class="ar">${echapper(s.ar)}</span></p><div class="cadre"></div></div>`)
    .join('\n');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${echapper(`${g.fr} ${doc.numero_affiche}`)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", "Noto Naskh Arabic", system-ui, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 0; }
  .ar { display: block; font-size: .85em; color: #555; direction: rtl; }
  .provisoire { border: 2px dashed #b45309; color: #92400e; text-align: center; font-weight: 700; padding: 2mm; margin-bottom: 6mm; font-size: 9.5pt; }
  .entete { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 6mm; margin-bottom: 7mm; }
  .entete p { margin: 0 0 2px; line-height: 1.35; }
  .entete .ar-bloc { text-align: right; direction: rtl; }
  .entete .etat { font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
  h1 { font-size: 15pt; text-align: center; margin: 0 0 2mm; letter-spacing: .5px; }
  h1 .ar { font-size: .8em; margin-top: 2px; }
  .reference { text-align: center; font-size: 9.5pt; color: #444; margin-bottom: 7mm; }
  .reference strong { color: #1a1a1a; font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 7mm; }
  th, td { border: 1px solid #999; padding: 3mm 4mm; vertical-align: top; }
  th { width: 42%; text-align: start; background: #f4f4f4; font-weight: 600; }
  .observations { border: 1px solid #999; min-height: 22mm; padding: 3mm 4mm; margin-bottom: 9mm; }
  .observations .titre { font-weight: 600; font-size: 9.5pt; margin-bottom: 2mm; }
  .signatures { display: flex; justify-content: space-between; gap: 8mm; }
  .signature { flex: 1; text-align: center; font-size: 9.5pt; }
  .signature .cadre { border: 1px solid #999; height: 26mm; margin-top: 2mm; }
  .annule { position: fixed; top: 40%; left: 0; right: 0; text-align: center; transform: rotate(-20deg);
            font-size: 44pt; font-weight: 800; color: rgba(185, 28, 28, .28); pointer-events: none; }
  .motif { border: 2px solid #b91c1c; color: #7f1d1d; padding: 2mm 3mm; margin-bottom: 6mm; font-size: 9.5pt; }
  .pied { margin-top: 10mm; text-align: center; font-size: 8pt; color: #777; border-top: 1px solid #ddd; padding-top: 2mm; }
</style>
</head>
<body>
${
  g.statut === 'provisoire'
    ? '<p class="provisoire">MODÈLE PROVISOIRE — en attente de validation par le chef de dépôt<span class="ar">نموذج مؤقت — في انتظار مصادقة رئيس المستودع</span></p>'
    : ''
}
<header class="entete">
  <div>
    <p class="etat">République tunisienne</p>
    <p>Ministère de l’Intérieur</p>
    <p>Gouvernorat de ${echapper(entete.gouvernorat)}</p>
    <p><strong>Commune de ${echapper(entete.commune)}</strong></p>
  </div>
  <div class="ar-bloc">
    <p class="etat">الجمهورية التونسية</p>
    <p>وزارة الداخلية</p>
    <p>${entete.gouvernorat_ar ? `ولاية ${echapper(entete.gouvernorat_ar)}` : ''}</p>
    <p><strong>${entete.commune_ar ? `بلدية ${echapper(entete.commune_ar)}` : ''}</strong></p>
  </div>
</header>

<h1>${echapper(g.fr)}<span class="ar">${echapper(g.ar)}</span></h1>
<p class="reference">N° <strong>${echapper(doc.numero_affiche)}</strong> · émis le ${echapper(dateFr(doc.emis_le.slice(0, 10)))}<br>
  ${echapper(g.reference.fr)}<span class="ar">${echapper(g.reference.ar)}</span></p>
${
  doc.statut === 'annule'
    ? `<p class="motif"><strong>Document annulé — وثيقة ملغاة.</strong> Motif : ${echapper(doc.motif_annulation ?? '')}</p>\n<div class="annule">ANNULÉ — ملغى</div>`
    : ''
}
<table>
  <tbody>
${lignes}
  </tbody>
</table>

<div class="observations">
  <div class="titre">Observations<span class="ar">ملاحظات</span></div>
  ${observations}
</div>

<div class="signatures">
${signatures}
</div>

<footer class="pied">
  Édité le ${edite.date} à ${edite.heure} (heure de Tunis) par ${echapper(editePar)} — SIIPI / FNCT<br>
  Empreinte du contenu (SHA-256, à comparer au registre) : ${echapper(doc.empreinte_contenu.slice(0, 16))}…
</footer>
</body>
</html>
`;
}
