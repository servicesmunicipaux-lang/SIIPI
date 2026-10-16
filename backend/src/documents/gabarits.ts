// Les gabarits des quatre documents à numérotation scellée (lot 16.2).
//
// Décision du 16 octobre 2026 (docs/specs_metier/DECISIONS_2026-10-16.md) : les
// gabarits sont construits MAINTENANT, et chacun s'imprime « MODÈLE PROVISOIRE »
// tant que le chef de dépôt de Dar Chaâbane ne l'a pas validé pendant la
// recette. La validation se fera en changeant `statut` ci-dessous — dans le code,
// donc dans l'historique, avec la date et le nom de qui a validé.
//
// UN GABARIT EST AUSSI UN CONTRAT. Le contenu d'un document émis est figé par la
// base (migration 057) : ce qui n'y est pas au moment de l'émission n'y sera
// jamais. L'émission vérifie donc le contenu contre le gabarit — les champs
// obligatoires présents, aucun champ que le gabarit ne sait pas imprimer.
// Un champ facultatif laissé vide reste vide à l'impression : ni tiret, ni zéro.

import { z } from 'zod';

export type TypeDocument = 'ordre_mission' | 'bon_carburant' | 'bon_travail' | 'declaration_panne';

type NatureChamp = 'texte' | 'texte_long' | 'date' | 'nombre' | 'oui_non';

export type ChampGabarit = {
  cle: string;
  fr: string;
  ar: string;
  nature: NatureChamp;
  requis?: boolean;
  /** Unité affichée après la valeur (« L », « TND »). */
  unite?: string;
};

export type Gabarit = {
  type: TypeDocument;
  /** « provisoire » jusqu'à la validation par un chef de dépôt (décision du 16/10/2026). */
  statut: 'provisoire' | 'valide';
  fr: string;
  ar: string;
  reference: { fr: string; ar: string };
  champs: ChampGabarit[];
  signatures: { fr: string; ar: string }[];
};

const OBSERVATIONS: ChampGabarit = { cle: 'observations', fr: 'Observations', ar: 'ملاحظات', nature: 'texte_long' };

export const GABARITS: Record<TypeDocument, Gabarit> = {
  ordre_mission: {
    type: 'ordre_mission',
    statut: 'provisoire',
    fr: 'ORDRE DE MISSION',
    ar: 'إذن بمأمورية',
    reference: { fr: 'Déplacement d’un agent de la commune en service commandé', ar: 'تنقّل عون بلدي في مهمة رسمية' },
    champs: [
      { cle: 'agent', fr: 'Agent', ar: 'العون', nature: 'texte', requis: true },
      { cle: 'fonction', fr: 'Grade / fonction', ar: 'الرتبة / الخطة', nature: 'texte' },
      { cle: 'destination', fr: 'Destination', ar: 'الوجهة', nature: 'texte', requis: true },
      { cle: 'objet', fr: 'Objet de la mission', ar: 'موضوع المأمورية', nature: 'texte_long', requis: true },
      { cle: 'date_debut', fr: 'Du', ar: 'من', nature: 'date', requis: true },
      { cle: 'date_fin', fr: 'Au', ar: 'إلى', nature: 'date' },
      { cle: 'moyen_transport', fr: 'Moyen de transport', ar: 'وسيلة النقل', nature: 'texte' },
      OBSERVATIONS,
    ],
    signatures: [
      { fr: 'L’agent', ar: 'العون' },
      { fr: 'Le chef de service', ar: 'رئيس المصلحة' },
      { fr: 'Le Président de la commune', ar: 'رئيس البلدية' },
    ],
  },
  bon_carburant: {
    type: 'bon_carburant',
    statut: 'provisoire',
    fr: 'BON DE SORTIE DE CARBURANT',
    ar: 'إذن بإخراج المحروقات',
    reference: { fr: 'Registre des carburants — comptabilité matières de la commune', ar: 'سجلّ المحروقات — محاسبة المواد بالبلدية' },
    // Les clés sont celles qu'écrit app.emettre_bon_carburant (migration 058) :
    // le bon émis depuis le carnet s'imprime sans traduction.
    champs: [
      { cle: 'engin', fr: 'Engin (immatriculation)', ar: 'الآلية (الترقيم)', nature: 'texte', requis: true },
      { cle: 'date', fr: 'Date de sortie', ar: 'تاريخ الإخراج', nature: 'date', requis: true },
      { cle: 'carburant', fr: 'Carburant', ar: 'نوع المحروقات', nature: 'texte', requis: true },
      { cle: 'litres', fr: 'Quantité', ar: 'الكمية', nature: 'nombre', requis: true, unite: 'L' },
      { cle: 'montant_tnd', fr: 'Montant', ar: 'المبلغ', nature: 'nombre', unite: 'TND' },
      { cle: 'compteur', fr: 'Index du compteur', ar: 'مؤشر العدّاد', nature: 'nombre' },
      { cle: 'unite_compteur', fr: 'Unité du compteur', ar: 'وحدة العدّاد', nature: 'texte' },
      { cle: 'chauffeur_matricule', fr: 'Chauffeur (matricule)', ar: 'السائق (المعرّف)', nature: 'texte' },
      OBSERVATIONS,
    ],
    // Trois signatures : celui qui reçoit, celui qui délivre, celui qui
    // autorise. La séparation des trois rend le contrôle possible.
    signatures: [
      { fr: 'Le chauffeur', ar: 'السائق' },
      { fr: 'Le magasinier', ar: 'أمين المخزن' },
      { fr: 'Le chef de parc', ar: 'رئيس الحظيرة' },
    ],
  },
  bon_travail: {
    type: 'bon_travail',
    statut: 'provisoire',
    fr: 'BON DE TRAVAIL — MAINTENANCE',
    ar: 'إذن بأشغال — الصيانة',
    reference: { fr: 'Registre de maintenance du parc communal', ar: 'سجلّ صيانة الحظيرة البلدية' },
    champs: [
      { cle: 'engin', fr: 'Engin (immatriculation)', ar: 'الآلية (الترقيم)', nature: 'texte', requis: true },
      { cle: 'nature', fr: 'Nature de l’intervention', ar: 'طبيعة التدخّل', nature: 'texte', requis: true },
      { cle: 'travaux', fr: 'Travaux demandés', ar: 'الأشغال المطلوبة', nature: 'texte_long', requis: true },
      { cle: 'atelier', fr: 'Atelier / prestataire', ar: 'الورشة / المزوّد', nature: 'texte' },
      { cle: 'compteur', fr: 'Index du compteur', ar: 'مؤشر العدّاد', nature: 'nombre' },
      { cle: 'date_entree', fr: 'Date d’entrée', ar: 'تاريخ الدخول', nature: 'date', requis: true },
      { cle: 'date_sortie', fr: 'Date de sortie', ar: 'تاريخ الخروج', nature: 'date' },
      { cle: 'cout_tnd', fr: 'Coût', ar: 'الكلفة', nature: 'nombre', unite: 'TND' },
      OBSERVATIONS,
    ],
    signatures: [
      { fr: 'Le chef de parc', ar: 'رئيس الحظيرة' },
      { fr: 'L’atelier / le prestataire', ar: 'الورشة / المزوّد' },
    ],
  },
  declaration_panne: {
    type: 'declaration_panne',
    statut: 'provisoire',
    fr: 'FICHE DE DÉCLARATION DE PANNE',
    ar: 'بطاقة التصريح بعطب',
    reference: { fr: 'Registre de maintenance du parc communal', ar: 'سجلّ صيانة الحظيرة البلدية' },
    champs: [
      { cle: 'engin', fr: 'Engin (immatriculation)', ar: 'الآلية (الترقيم)', nature: 'texte', requis: true },
      { cle: 'date_panne', fr: 'Date de la panne', ar: 'تاريخ العطب', nature: 'date', requis: true },
      { cle: 'lieu', fr: 'Lieu', ar: 'المكان', nature: 'texte' },
      { cle: 'circuit', fr: 'Circuit en cours', ar: 'الدورة الجارية', nature: 'texte' },
      { cle: 'description', fr: 'Description de la panne', ar: 'وصف العطب', nature: 'texte_long', requis: true },
      { cle: 'immobilise', fr: 'Engin immobilisé', ar: 'الآلية متوقفة', nature: 'oui_non' },
      { cle: 'chauffeur_matricule', fr: 'Chauffeur (matricule)', ar: 'السائق (المعرّف)', nature: 'texte' },
      OBSERVATIONS,
    ],
    signatures: [
      { fr: 'Le chauffeur', ar: 'السائق' },
      { fr: 'Le chef de parc', ar: 'رئيس الحظيرة' },
    ],
  },
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Le schéma du contenu d'un type : ses champs, et eux seuls ; les obligatoires présents. */
export function schemaContenu(type: TypeDocument) {
  const forme: Record<string, z.ZodTypeAny> = {};
  for (const c of GABARITS[type].champs) {
    let s: z.ZodTypeAny =
      c.nature === 'nombre'
        ? z.number().finite().nonnegative()
        : c.nature === 'oui_non'
          ? z.boolean()
          : c.nature === 'date'
            ? z.string().regex(DATE, `${c.fr} : date attendue au format AAAA-MM-JJ.`)
            : z.string().trim().min(1).max(c.nature === 'texte_long' ? 2000 : 200);
    if (!c.requis) s = s.optional();
    forme[c.cle] = s;
  }
  return z.object(forme).strict();
}

/** Les champs obligatoires manquants, nommés en français, pour le message d'erreur. */
export function champsManquants(type: TypeDocument, contenu: Record<string, unknown>): string[] {
  return GABARITS[type].champs.filter((c) => c.requis && (contenu[c.cle] === undefined || contenu[c.cle] === '')).map((c) => c.fr);
}
