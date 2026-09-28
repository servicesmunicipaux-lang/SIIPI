// Les jeux de colonnes des exports (Jalon 4) : un par route de liste
// exportable. L'ordre des colonnes est celui d'une lecture de gauche à droite
// dans un tableur — ce qui identifie la ligne d'abord, le détail ensuite.
//
// Les libellés des valeurs codées reprennent ceux du front-end
// (web/src/locales) : l'API est un déploiement distinct et ne peut pas les
// lire, d'où cette copie limitée aux seules colonnes exportées.

import type { JeuExport } from './export.js';

const CATEGORIES_CONTACT = {
  administration: { fr: 'Administration', ar: 'إدارة' },
  prestataire: { fr: 'Prestataire', ar: 'متعهد' },
  association: { fr: 'Association', ar: 'جمعية' },
  fournisseur: { fr: 'Fournisseur', ar: 'مزود' },
  elu: { fr: 'Élu', ar: 'منتخب' },
  autre: { fr: 'Autre', ar: 'أخرى' },
};

const ETATS_ENGIN = {
  en_service: { fr: 'En service', ar: 'في الاستعمال' },
  en_panne: { fr: 'En panne', ar: 'معطّبة' },
  a_reformer: { fr: 'À réformer', ar: 'للتفويت' },
  reforme: { fr: 'Réformé', ar: 'مفوّتة' },
};

const TYPES_ENGIN = {
  benne_tasseuse: { fr: 'Benne tasseuse', ar: 'شاحنة ضاغطة' },
  camion: { fr: 'Camion', ar: 'شاحنة' },
  camion_ampliroll: { fr: 'Camion ampliroll', ar: 'شاحنة رافعة' },
  camion_remorque: { fr: 'Camion à remorque', ar: 'شاحنة بمقطورة' },
  balayeuse: { fr: 'Balayeuse mécanique', ar: 'شاحنة كنس آلي' },
  tracteur: { fr: 'Tracteur', ar: 'جرّار' },
  tracteur_remorque: { fr: 'Tracteur + remorque', ar: 'جرّار ومجرورة' },
  remorque: { fr: 'Remorque', ar: 'مجرورة' },
  chargeuse_pelleteuse: { fr: 'Chargeuse-pelleteuse', ar: 'جرافة مجهّزة بمجرفة' },
  chargeuse: { fr: 'Chargeuse', ar: 'آلة شحن' },
  mini_chargeuse: { fr: 'Mini-chargeuse', ar: 'آلة شحن صغيرة الحجم' },
  niveleuse: { fr: 'Niveleuse', ar: 'آلة ماسحة' },
  autre: { fr: 'Autre', ar: 'أخرى' },
};

const CATEGORIES_ENGIN = {
  poids_lourd: { fr: 'Poids lourd', ar: 'وزن ثقيل' },
  engin_lourd: { fr: 'Engin lourd', ar: 'آلية ثقيلة' },
  tracteur: { fr: 'Tracteur', ar: 'جرّار' },
  remorque: { fr: 'Remorque', ar: 'مجرورة' },
};

const TYPES_POINT = {
  porte_a_porte: { fr: 'Porte-à-porte', ar: 'باب/باب' },
  point_de_collecte: { fr: 'Point de collecte', ar: 'نقطة رفع' },
  debut_collecte: { fr: 'Début de collecte', ar: 'بداية الرفع' },
  fin_collecte: { fr: 'Fin de collecte', ar: 'نهاية الرفع' },
  point_noir: { fr: 'Point noir', ar: 'نقطة سوداء' },
  centre_transfert: { fr: 'Centre de transfert', ar: 'مركز التحويل' },
  hors_conteneur: { fr: 'Dépôt hors conteneur', ar: 'فضلات خارج الحاوية' },
  parc_municipal: { fr: 'Parc municipal', ar: 'المستودع البلدي' },
  autre: { fr: 'Autre', ar: 'أخرى' },
};

const STATUTS_COMMUNE = {
  active: { fr: 'Active', ar: 'نشطة' },
  incomplete: { fr: 'Incomplète', ar: 'غير مكتملة' },
  desactivee: { fr: 'Désactivée', ar: 'معطّلة' },
};

const PROVENANCE = {
  estime: { fr: 'Estimé', ar: 'تقديري' },
  declare: { fr: 'Déclaré', ar: 'مصرّح به' },
  mesure: { fr: 'Mesuré', ar: 'مقيس' },
};

/** A3.4 — le tableau national, une ligne par gouvernorat. */
export const JEU_GOUVERNORATS: JeuExport = {
  nom: 'observatoire-gouvernorats',
  titre: { fr: 'Par gouvernorat', ar: 'حسب الولاية' },
  colonnes: [
    { cle: 'gouvernorat', fr: 'Gouvernorat', ar: 'الولاية' },
    { cle: 'communes', fr: 'Communes', ar: 'البلديات', type: 'nombre' },
    { cle: 'communes_actives', fr: 'Communes actives', ar: 'البلديات النشطة', type: 'nombre' },
    { cle: 'communes_incompletes', fr: 'Communes incomplètes', ar: 'البلديات غير المكتملة', type: 'nombre' },
    { cle: 'communes_desactivees', fr: 'Communes désactivées', ar: 'البلديات المعطّلة', type: 'nombre' },
    { cle: 'population', fr: 'Population', ar: 'السكان', type: 'nombre' },
    { cle: 'tonnage_jour', fr: 'Tonnage (t/jour)', ar: 'الكمية (طن/يوم)', type: 'nombre' },
    { cle: 'production_kg_hab_jour', fr: 'Production (kg/hab/jour)', ar: 'الإنتاج (كغ/ساكن/يوم)', type: 'nombre' },
    { cle: 'taux_collecte', fr: 'Taux de collecte', ar: 'نسبة الجمع', type: 'nombre' },
    { cle: 'indice_proprete', fr: 'Indice de propreté', ar: 'مؤشر النظافة', type: 'nombre' },
    { cle: 'pcgd_valides', fr: 'PCGD validés', ar: 'المخططات البلدية المصادق عليها', type: 'nombre' },
    { cle: 'reclamations_ouvertes', fr: 'Réclamations ouvertes', ar: 'التشكيات المفتوحة', type: 'nombre' },
    { cle: 'reclamations_30j', fr: 'Réclamations (30 j)', ar: 'التشكيات (30 يوما)', type: 'nombre' },
    { cle: 'delai_traitement_jours', fr: 'Délai de traitement (j)', ar: 'أجل المعالجة (يوم)', type: 'nombre' },
    { cle: 'communes_donnees_mesurees', fr: 'Communes à données mesurées', ar: 'بلديات ببيانات مقيسة', type: 'nombre' },
    { cle: 'communes_donnees_estimees', fr: 'Communes à données estimées', ar: 'بلديات ببيانات تقديرية', type: 'nombre' },
    { cle: 'derniere_activite', fr: 'Dernière activité', ar: 'آخر نشاط', type: 'horodatage' },
  ],
};

/** A3.4 — l'annuaire des 350 communes et leur statut de déploiement. */
export const JEU_COMMUNES: JeuExport = {
  nom: 'observatoire-communes',
  titre: { fr: 'Communes', ar: 'البلديات' },
  colonnes: [
    { cle: 'commune_id', fr: 'Identifiant', ar: 'المعرّف' },
    { cle: 'name', fr: 'Commune', ar: 'البلدية' },
    { cle: 'name_ar', fr: 'Nom en arabe', ar: 'الاسم بالعربية' },
    { cle: 'gouvernorat', fr: 'Gouvernorat', ar: 'الولاية' },
    { cle: 'population', fr: 'Population', ar: 'السكان', type: 'nombre' },
    { cle: 'statut', fr: 'Statut', ar: 'الحالة', libelles: STATUTS_COMMUNE },
    { cle: 'is_pilot', fr: 'Pilote', ar: 'نموذجية', type: 'booleen' },
    { cle: 'donnees_source', fr: 'Provenance des données', ar: 'مصدر البيانات', libelles: PROVENANCE },
    { cle: 'pcgd_status', fr: 'PCGD', ar: 'المخطط البلدي' },
    { cle: 'ecritures_30j', fr: 'Saisies (30 j)', ar: 'الإدخالات (30 يوما)', type: 'nombre' },
    { cle: 'a_des_pesees', fr: 'Pesées importées', ar: 'عمليات وزن مستوردة', type: 'booleen' },
    { cle: 'derniere_activite', fr: 'Dernière activité', ar: 'آخر نشاط', type: 'horodatage' },
  ],
};

/** B2.4 — le parc d'une commune. */
export const JEU_PARC: JeuExport = {
  nom: 'parc',
  titre: { fr: 'Parc', ar: 'الأسطول' },
  colonnes: [
    { cle: 'registration', fr: 'Immatriculation', ar: 'الترقيم', import: 'registration', alias: ['immat', 'matricule'] },
    { cle: 'type', fr: 'Type', ar: 'النوع', libelles: TYPES_ENGIN, import: 'type' },
    { cle: 'categorie', fr: 'Catégorie', ar: 'الصنف', libelles: CATEGORIES_ENGIN, import: 'categorie' },
    { cle: 'marque', fr: 'Marque', ar: 'العلامة', import: 'marque' },
    { cle: 'etat', fr: 'État', ar: 'الحالة', libelles: ETATS_ENGIN, import: 'etat' },
    { cle: 'etat_depuis', fr: 'Dans cet état depuis', ar: 'في هذه الحالة منذ', type: 'date', import: 'etatDepuis' },
    { cle: 'motif_immobilisation', fr: "Motif d'immobilisation", ar: 'سبب التوقف', import: 'motifImmobilisation' },
    { cle: 'date_premiere_circulation', fr: '1re mise en circulation', ar: 'أوّل إذن بالجولان', type: 'date', import: 'datePremiereCirculation' },
    { cle: 'age_annees', fr: 'Âge (années)', ar: 'العمر (سنوات)', type: 'nombre' },
    { cle: 'capacity_m3', fr: 'Capacité (m³)', ar: 'السعة (م³)', type: 'nombre', import: 'capacityM3' },
    { cle: 'charge_utile_t', fr: 'Charge utile (t)', ar: 'الحمولة (طن)', type: 'nombre', import: 'chargeUtileT' },
    { cle: 'valeur_achat_tnd', fr: "Valeur d'achat (TND)", ar: 'قيمة الشراء (دينار)', type: 'nombre', import: 'valeurAchatTnd' },
    { cle: 'domaine_emploi', fr: "Domaine d'emploi", ar: 'مجال الاستعمال', import: 'domaineEmploi' },
    // Export seulement : un relevé passe par le contrôle du compteur (qui ne
    // recule pas), pas par un import de masse.
    { cle: 'kilometrage', fr: 'Kilométrage', ar: 'عدد الكيلومترات', type: 'nombre' },
    { cle: 'kilometrage_le', fr: 'Kilométrage relevé le', ar: 'تاريخ قراءة العداد', type: 'date' },
    { cle: 'attele_a_immat', fr: 'Attelé à', ar: 'مربوط بـ' },
    { cle: 'inventaire_le', fr: 'Inventorié le', ar: 'تاريخ الجرد', type: 'date' },
  ],
};

/** B3.6 — les points de collecte, tels que filtrés à l'écran. */
export const JEU_POINTS: JeuExport = {
  nom: 'points-collecte',
  titre: { fr: 'Points de collecte', ar: 'نقاط الرفع' },
  colonnes: [
    { cle: 'circuit_nom', fr: 'Circuit', ar: 'الدورة' },
    { cle: 'voyage', fr: 'Voyage', ar: 'الرحلة', type: 'nombre', import: 'voyage' },
    { cle: 'ordre', fr: 'Ordre', ar: 'الترتيب', type: 'nombre', import: 'ordre' },
    { cle: 'nom', fr: 'Nom', ar: 'الاسم', import: 'nom' },
    { cle: 'type', fr: 'Type', ar: 'النوع', libelles: TYPES_POINT, import: 'type' },
    { cle: 'lat', fr: 'Latitude', ar: 'خط العرض', type: 'nombre', import: 'lat', alias: ['y'] },
    { cle: 'lng', fr: 'Longitude', ar: 'خط الطول', type: 'nombre', import: 'lng', alias: ['lon', 'long', 'x'] },
    { cle: 'precision_m', fr: 'Précision (m)', ar: 'الدقة (م)', type: 'nombre', import: 'precisionM' },
    { cle: 'heure_observee', fr: 'Heure observée', ar: 'الساعة الملاحظة', import: 'heureObservee', alias: ['heure'] },
    { cle: 'heure_estimee', fr: 'Heure estimée', ar: 'الساعة التقديرية' },
    { cle: 'observation', fr: 'Observation', ar: 'ملاحظة', import: 'observation' },
    { cle: 'actif', fr: 'Actif', ar: 'نشط', type: 'booleen' },
  ],
};

/** B5.2.4 — le dépouillement d'un sondage, une ligne par option. */
export const JEU_DEPOUILLEMENT: JeuExport = {
  nom: 'sondage-resultats',
  titre: { fr: 'Résultats du sondage', ar: 'نتائج الاستطلاع' },
  colonnes: [
    { cle: 'ordre', fr: 'Question n°', ar: 'رقم السؤال', type: 'nombre' },
    { cle: 'libelle_fr', fr: 'Question (FR)', ar: 'السؤال (بالفرنسية)' },
    { cle: 'libelle_ar', fr: 'Question (AR)', ar: 'السؤال (بالعربية)' },
    {
      cle: 'type',
      fr: 'Type de question',
      ar: 'نوع السؤال',
      libelles: {
        choix_unique: { fr: 'Choix unique', ar: 'اختيار واحد' },
        choix_multiple: { fr: 'Choix multiple', ar: 'اختيار متعدد' },
        note: { fr: 'Note', ar: 'تقييم' },
        texte: { fr: 'Texte libre', ar: 'نص حر' },
      },
    },
    { cle: 'option_rang', fr: 'Option n°', ar: 'رقم الخيار', type: 'nombre' },
    { cle: 'option_fr', fr: 'Option (FR)', ar: 'الخيار (بالفرنسية)' },
    { cle: 'option_ar', fr: 'Option (AR)', ar: 'الخيار (بالعربية)' },
    { cle: 'reponses', fr: 'Réponses', ar: 'الإجابات', type: 'nombre' },
    { cle: 'note_moyenne', fr: 'Note moyenne', ar: 'متوسط التقييم', type: 'nombre' },
  ],
};

/** C1.4 — l'annuaire de travail de la commune. */
export const JEU_CONTACTS: JeuExport = {
  nom: 'contacts',
  titre: { fr: 'Contacts', ar: 'جهات الاتصال' },
  colonnes: [
    { cle: 'nom_complet', fr: 'Nom complet', ar: 'الاسم الكامل', import: 'nomComplet', alias: ['nom'] },
    { cle: 'categorie', fr: 'Catégorie', ar: 'الصنف', libelles: CATEGORIES_CONTACT, import: 'categorie' },
    { cle: 'organisation', fr: 'Organisation', ar: 'الهيكل', import: 'organisation' },
    { cle: 'fonction', fr: 'Fonction', ar: 'الخطة', import: 'fonction' },
    { cle: 'telephone', fr: 'Téléphone', ar: 'الهاتف', import: 'telephone', alias: ['tel', 'tél'] },
    { cle: 'email', fr: 'Courriel', ar: 'البريد الإلكتروني', import: 'email', alias: ['e-mail', 'mail', 'adresse électronique'] },
    { cle: 'notes', fr: 'Notes', ar: 'ملاحظات', import: 'notes' },
    { cle: 'updated_at', fr: 'Mis à jour le', ar: 'آخر تحديث', type: 'horodatage' },
  ],
};

const TYPES_INTERVENTION = {
  vidange: { fr: 'Vidange', ar: 'تغيير الزيت' },
  revision: { fr: 'Révision', ar: 'مراجعة' },
  pneumatiques: { fr: 'Pneumatiques', ar: 'العجلات' },
  freinage: { fr: 'Freinage', ar: 'الفرامل' },
  hydraulique: { fr: 'Hydraulique', ar: 'المنظومة الهيدروليكية' },
  electricite: { fr: 'Électricité', ar: 'الكهرباء' },
  carrosserie: { fr: 'Carrosserie', ar: 'الهيكل' },
  controle_technique: { fr: 'Contrôle technique', ar: 'الفحص الفني' },
  reparation: { fr: 'Réparation', ar: 'إصلاح' },
  autre: { fr: 'Autre', ar: 'أخرى' },
};

/** B2.2 — le carnet d'entretien : une ligne par intervention. */
export const JEU_INTERVENTIONS: JeuExport = {
  nom: 'entretien-interventions',
  titre: { fr: "Carnet d'entretien", ar: 'دفتر الصيانة' },
  colonnes: [
    { cle: 'date_intervention', fr: 'Date', ar: 'التاريخ', type: 'date' },
    { cle: 'registration', fr: 'Immatriculation', ar: 'الترقيم' },
    { cle: 'type', fr: 'Intervention', ar: 'التدخل', libelles: TYPES_INTERVENTION },
    {
      cle: 'nature',
      fr: 'Nature',
      ar: 'الطبيعة',
      libelles: { preventive: { fr: 'Préventive', ar: 'وقائية' }, corrective: { fr: 'Corrective', ar: 'علاجية' } },
    },
    { cle: 'description', fr: 'Description', ar: 'الوصف' },
    { cle: 'cout_tnd', fr: 'Coût (TND)', ar: 'الكلفة (دينار)', type: 'nombre' },
    { cle: 'kilometrage', fr: 'Kilométrage', ar: 'عدد الكيلومترات', type: 'nombre' },
    { cle: 'prestataire', fr: 'Garage / atelier', ar: 'الورشة' },
  ],
};

/** B2.3 — les échéances d'entretien, en retard d'abord. */
export const JEU_ECHEANCES: JeuExport = {
  nom: 'entretien-echeances',
  titre: { fr: "Échéances d'entretien", ar: 'آجال الصيانة' },
  colonnes: [
    {
      cle: 'statut',
      fr: 'Statut',
      ar: 'الحالة',
      libelles: {
        en_retard: { fr: 'En retard', ar: 'متأخرة' },
        a_prevoir: { fr: 'À prévoir', ar: 'يجب برمجتها' },
        a_verifier: { fr: 'À vérifier (kilométrage inconnu)', ar: 'للتثبت (عدد الكيلومترات غير معروف)' },
        a_jour: { fr: 'À jour', ar: 'محيّنة' },
      },
    },
    { cle: 'registration', fr: 'Immatriculation', ar: 'الترقيم' },
    { cle: 'type', fr: 'Entretien', ar: 'الصيانة', libelles: TYPES_INTERVENTION },
    { cle: 'libelle', fr: 'Libellé', ar: 'التسمية' },
    { cle: 'derniere_date', fr: 'Dernier entretien', ar: 'آخر صيانة', type: 'date' },
    { cle: 'dernier_km', fr: 'Au kilométrage', ar: 'عند عدد الكيلومترات', type: 'nombre' },
    { cle: 'echeance_date', fr: 'Échéance (date)', ar: 'الأجل (التاريخ)', type: 'date' },
    { cle: 'echeance_km', fr: 'Échéance (km)', ar: 'الأجل (كلم)', type: 'nombre' },
    { cle: 'jours_restants', fr: 'Jours restants', ar: 'الأيام المتبقية', type: 'nombre' },
    { cle: 'km_actuel', fr: 'Kilométrage actuel', ar: 'عدد الكيلومترات الحالي', type: 'nombre' },
    { cle: 'km_restants', fr: 'Km restants', ar: 'الكيلومترات المتبقية', type: 'nombre' },
  ],
};
