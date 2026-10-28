// Les avis de « À vérifier » en arabe (v0.15.67).
//
// Les fonctions `app.incoherences_*` écrivent leurs constats en français, valeurs
// comprises (« L'engin %s (%s) est déclaré %s à l'inventaire. »). Les réécrire pour qu'elles
// rendent un code et des paramètres aurait changé neuf fonctions, leurs retours et tous
// leurs lecteurs : la traduction se fait donc ICI, à la sortie de l'API, sur le texte
// exact que la base a écrit.
//
// LE CATALOGUE GARDE LE MODÈLE FRANÇAIS TEL QU'IL EST DANS LE SQL (`%s` pour une valeur,
// `%` pour un pourcentage). Un modèle reconnaît le texte rendu — chaque `%s` capture une
// valeur — et son équivalent arabe la replace (`{0}`, `{1}`…). Les noms propres (un
// circuit, un engin, une immatriculation) passent tels quels ; les mots d'un vocabulaire
// fermé (l'état d'un engin, la séance d'un carnet) sont traduits par `VOCABULAIRE`.
//
// RIEN NE SE TRADUIT EN SILENCE À MOITIÉ. Un texte qu'aucun modèle ne reconnaît reste en
// français et rend `null` en arabe : l'écran affiche alors le français, pas un arabe
// approximatif. Et la campagne `avis-ar` lit les textes dans les fonctions de la base et
// échoue dès qu'un seul n'a pas de modèle — un nouvel avis sans traduction se voit au premier
// passage des tests, pas en recette.
//
// Les chiffres restent latins, comme dans tous les documents administratifs tunisiens.
// La terminologie est celle de l'interface (engin = المعدة, circuit = المسلك, parc = الحظيرة,
// réclamation = إبلاغ, inventaire = الجرد).

interface Modele {
  fr: string;
  ar: string;
}

/** Les mots à valeurs fermées qui entrent dans un avis : l'état d'un engin, la séance, la catégorie. */
const VOCABULAIRE: Record<string, string> = {
  // L'état d'un engin, en clair (constats de pesées, de registres) et en code (déclassement).
  'en panne': 'معطّبة',
  'en panne, à réformer': 'معطّبة وللتفويت',
  réformé: 'مفوّتة',
  en_service: 'في الاستعمال',
  en_panne: 'معطّبة',
  a_reformer: 'للتفويت',
  reforme: 'مفوّتة',
  // La séance d'un carnet de bord.
  matin: 'صباحية',
  apres_midi: 'مسائية',
  nuit: 'ليلية',
  // Les classes de collecte (lot T), telles que les écrit classes_engins.libelle_fr.
  'Camion à benne tasseuse': 'شاحنة ضاغطة',
  'Camion à benne basculante (Cbb)': 'شاحنة ذات صندوق قلاب',
  'Camionnette pick-up à benne basculante': 'شاحنة خفيفة ذات صندوق قلاب',
  'Tracteur et remorque agricole (Tag)': 'جرار ومجرورة فلاحية',
  'Tracteur et remorque compactrice': 'جرار ومجرورة ضاغطة',
  'Camion ampli-roll et caisson': 'شاحنة ذات ذراع وحاوية',
  // La catégorie d'un acteur informel.
  intermédiaire: 'وسيط',
  'pré-collecteur': 'مجمّع أولي',
};

/** Les valeurs qui portent leur propre petite phrase : « depuis le 03/10/2026 », « jusqu'au … ». */
function valeurAr(valeur: string): string {
  if (valeur in VOCABULAIRE) return VOCABULAIRE[valeur];
  const depuis = /^ depuis le (.+)$/.exec(valeur);
  if (depuis) return ` منذ ${depuis[1]}`;
  const jusque = /^jusqu'au (.+)$/.exec(valeur);
  if (jusque) return `إلى غاية ${jusque[1]}`;
  const le = /^le (\d{2}\/\d{2}\/\d{4})$/.exec(valeur);
  if (le) return `بتاريخ ${le[1]}`;
  return valeur;
}

export const MODELES: Modele[] = [
  // --- Sujets fixes (la colonne « sujet » est un libellé, pas un nom propre) -----------------
  { fr: 'Adresses citoyennes', ar: 'عناوين المواطنين' },
  { fr: 'Bâchage des bennes', ar: 'تغطية الشاحنات' },
  { fr: 'Réclamations', ar: 'الإبلاغات' },
  { fr: 'Entretien des engins', ar: 'صيانة المعدات' },

  // --- Typologie des engins (lot T) ----------------------------------------------------------
  { fr: "Le tracteur %s n'a aucune remorque attelée : le volume de ce circuit est inconnu.", ar: 'الجرار {0} غير مربوط بأي مجرورة: حجم هذا المسلك غير معروف.' },
  { fr: "Plusieurs remorques sont attelées au tracteur %s : SIIPI ne choisit pas laquelle fait ce circuit.", ar: 'عدة مجرورات مربوطة بالجرار {0}: لا تختار المنظومة أيّها تنجز هذا المسلك.' },
  { fr: "L'engin %s n'a pas de classe de collecte ou pas de volume : le tonnage de ce circuit ne pourra pas être estimé.", ar: 'المعدة {0} بلا صنف رفع أو بلا حجم: لا يمكن تقدير كمية هذا المسلك.' },
  { fr: 'Indiquer, dans le parc, la remorque attelée à ce tracteur.', ar: 'تحديد المجرورة المربوطة بهذا الجرار في الحظيرة.' },
  { fr: 'Ne laisser attelée au tracteur que la remorque qui fait ce circuit.', ar: 'عدم الإبقاء مربوطة بالجرار إلا على المجرورة التي تنجز هذا المسلك.' },
  { fr: "Renseigner la classe et le volume de l'engin dans le parc (fiche de l'engin).", ar: 'إدخال صنف المعدة وحجمها في الحظيرة (بطاقة المعدة).' },
  { fr: 'Volume de %s m³, hors de la plage de référence de la classe « %s » (%s à %s m³).', ar: 'حجم قدره {0} م³، خارج المجال المرجعي للصنف «{1}» (من {2} إلى {3} م³).' },
  { fr: "Vérifier le volume saisi. Un volume hors plage n'est pas une erreur (une benne rehaussée de ridelles, par exemple) : SIIPI le signale, il ne le change pas.", ar: 'التثبّت من الحجم المُدخل. الحجم خارج المجال ليس خطأً (صندوق مُعلّى بجوانب إضافية مثلاً): تشير إليه المنظومة ولا تغيّره.' },

  // --- Volumétrie (lot 17.2) ------------------------------------------------------------------
  { fr: 'Benne de %s m³ à %s – %s t/m³ : de %s à %s t par voyage, au-delà de la charge utile de %s t.', ar: 'صندوق حجمه {0} م³ بكثافة {1} – {2} طن/م³: من {3} إلى {4} طن في الرحلة، أكثر من الحمولة النافعة البالغة {5} طن.' },
  { fr: '%s voyage(s) pesé(s) au-delà de la benne pleine (%s m³ à %s t/m³ au plus) sur les 30 derniers jours.', ar: '{0} رحلة موزونة تتجاوز الصندوق الممتلئ ({1} م³ بكثافة {2} طن/م³ على الأكثر) خلال الثلاثين يومًا الأخيرة.' },
  { fr: "Vérifier le volume ou la classe de la benne, ou les pesées. SIIPI ne corrige rien : il signale l'écart.", ar: 'التثبّت من حجم الصندوق أو صنفه، أو من عمليات الوزن. لا تصحّح المنظومة شيئًا، بل تشير إلى الفارق.' },
  { fr: "Vérifier le volume, la classe ou la charge utile de l'engin. SIIPI ne corrige pas l'estimation : il signale l'écart.", ar: 'التثبّت من حجم المعدة أو صنفها أو حمولتها النافعة. لا تصحّح المنظومة التقدير، بل تشير إلى الفارق.' },

  // --- Acteurs informels ----------------------------------------------------------------------
  // Les cartes de pré-collecteur (lot I2).
  { fr: 'La carte %s expire le %s.', ar: 'تنتهي صلوحية البطاقة {0} بتاريخ {1}.' },
  { fr: "Si l'acteur poursuit son activité, enregistrer sa demande de renouvellement.", ar: 'إذا واصل الفاعل نشاطه، يُسجَّل مطلب تجديد بطاقته.' },
  { fr: "Déclaré pré-collecteur, mais achète à d'autres pré-collecteurs : relève de la catégorie intermédiaire.", ar: 'مصرَّح به كمجمّع أولي، لكنه يشتري من مجمّعين أوليين آخرين: يندرج ضمن فئة الوسطاء.' },
  { fr: "Déclaré pré-collecteur, mais dispose d'un local de stockage : relève de la catégorie intermédiaire.", ar: 'مصرَّح به كمجمّع أولي، لكنه يملك محلاًّ للخزن: يندرج ضمن فئة الوسطاء.' },
  { fr: "Vérifier les faits relevés, ou la catégorie déclarée. SIIPI ne change pas la catégorie : il signale l'écart.", ar: 'التثبّت من الوقائع المسجَّلة أو من الفئة المصرَّح بها. لا تغيّر المنظومة الفئة، بل تشير إلى الفارق.' },
  { fr: "Déclaré intermédiaire, sans local ni achat à d'autres pré-collecteurs : rien ne le distingue d'un pré-collecteur.", ar: 'مصرَّح به كوسيط، دون محل ودون شراء من مجمّعين أوليين آخرين: لا شيء يميّزه عن المجمّع الأولي.' },
  { fr: 'Vérifier les faits relevés, ou la catégorie déclarée.', ar: 'التثبّت من الوقائع المسجَّلة أو من الفئة المصرَّح بها.' },
  { fr: 'Catégorie non déclarée ; les faits relevés indiquent : %s.', ar: 'الفئة غير مصرَّح بها؛ والوقائع المسجَّلة تدلّ على: {0}.' },
  { fr: "Déclarer la catégorie de l'acteur.", ar: 'التصريح بفئة الفاعل.' },

  // --- Carburant -------------------------------------------------------------------------------
  { fr: '%s : %s L consommés pour un quota de %s L (+%s %).', ar: '{0} : {1} لتر مستهلكة لحصة قدرها {2} لتر (+{3} %).' },
  { fr: "Vérifier l'état de l'engin : le référentiel lit une hausse de consommation d'abord comme un indicateur d'avarie (diapo 42). C'est un constat, pas une faute.", ar: 'التثبّت من حالة المعدة: يقرأ المرجع ارتفاع الاستهلاك أولاً كمؤشر على عطب (الشريحة 42). هذه معاينة وليست خطأً.' },
  { fr: 'Le %s (%s), compteur à la sortie (%s) inférieur au compteur au retour précédent (%s).', ar: 'في {0} ({1})، عدّاد الخروج ({2}) أقل من عدّاد العودة السابقة ({3}).' },
  { fr: "Vérifier la saisie du carnet, ou consigner un changement de compteur dans l'observation.", ar: 'التثبّت من تسجيل الدفتر، أو تدوين تغيير العدّاد في الملاحظة.' },
  { fr: 'Sortie du %s (%s) jamais rentrée au carnet.', ar: 'خروج يوم {0} ({1}) لم تُسجَّل عودته بالدفتر.' },
  { fr: 'Saisir le compteur au retour : sans lui, la séance ne compte ni dans la distance ni dans le ratio.', ar: 'إدخال العدّاد عند العودة: بدونه لا تُحتسب الحصة لا في المسافة ولا في النسبة.' },

  // --- Communication ---------------------------------------------------------------------------
  { fr: 'Publiée, mais son périmètre ne contient aucun citoyen inscrit.', ar: 'منشورة، لكن نطاقها لا يشمل أي مواطن مسجَّل.' },
  { fr: 'Élargir le périmètre, ou vérifier que les citoyens de ce secteur ont renseigné leur adresse.', ar: 'توسيع النطاق، أو التثبّت من أن مواطني هذا القطاع قد أدخلوا عناوينهم.' },
  { fr: "%s citoyen(s) inscrit(s) sur %s n'ont pas d'adresse : aucun ciblage par secteur ne les atteint.", ar: '{0} مواطن(ين) مسجَّل(ين) من أصل {1} دون عنوان: لا يبلغهم أي استهداف حسب القطاع.' },
  { fr: 'Inviter les citoyens à renseigner leur adresse, ou publier vers la commune entière.', ar: 'دعوة المواطنين إلى إدخال عناوينهم، أو النشر نحو كامل البلدية.' },
  { fr: 'Sondage terminé sans aucune réponse.', ar: 'استطلاع منتهٍ دون أي إجابة.' },
  { fr: "Vérifier le périmètre retenu et la période : un sondage sans réponse n'informe sur rien.", ar: 'التثبّت من النطاق المعتمد ومن الفترة: استطلاع دون إجابات لا يفيد في شيء.' },

  // --- Déclassement ----------------------------------------------------------------------------
  { fr: "Adjugé le %s, l'engin figure toujours au parc (état « %s »).", ar: 'تمّت البتّة بتاريخ {0}، والمعدة لا تزال بالحظيرة (الحالة «{1}»).' },
  { fr: "Passer l'engin à l'état « réformé » : tant qu'il ne l'est pas, il compte dans le taux de disponibilité et dans la valeur du parc.", ar: 'تحويل المعدة إلى حالة «مفوّتة»: ما لم تكن كذلك فهي تُحتسب في نسبة الجاهزية وفي قيمة الحظيرة.' },
  { fr: 'Engin « à réformer » sans dossier de déclassement.', ar: 'معدة «للتفويت» دون ملف طرح.' },
  { fr: "Constituer le dossier (référentiel, diapo 83) : facture d'acquisition, inventaire des dépenses, rapport de rendement, coût estimatif de la réparation. Sans dossier, l'engin ne sortira pas de l'inventaire.", ar: 'تكوين الملف (المرجع، الشريحة 83): فاتورة الاقتناء، جرد المصاريف، تقرير المردودية، الكلفة التقديرية للإصلاح. بدون ملف لن تخرج المعدة من الجرد.' },
  { fr: "Motif « dépenses ≥ 80 % du prix d'acquisition » invoqué ; le cumul enregistré est de %s % (%s TND pour une valeur d'achat de %s TND).", ar: 'تمّ التذرّع بسبب «المصاريف ≥ 80 % من ثمن الاقتناء»؛ والمجموع المسجَّل هو {0} % ({1} د.ت من قيمة اقتناء قدرها {2} د.ت).' },
  { fr: "Compléter l'inventaire des dépenses de l'engin (carnet d'entretien), ou retirer ce motif du dossier tant qu'il n'est pas engagé dans le circuit.", ar: 'استكمال جرد مصاريف المعدة (دفتر الصيانة)، أو سحب هذا السبب من الملف ما دام غير مفعَّل في المسار.' },

  // --- Indicateurs -----------------------------------------------------------------------------
  { fr: '%s % des bennes basculantes sont bâchées pendant le transport (seuil : %s %).', ar: '{0} % من الشاحنات القلّابة مغطّاة أثناء النقل (الحدّ الأدنى: {1} %).' },
  { fr: 'Équiper les bennes de bâches, et mettre à jour la déclaration (onglet Indicateurs).', ar: 'تجهيز الشاحنات بأغطية، وتحيين التصريح (علامة المؤشرات).' },

  // --- Pesées ----------------------------------------------------------------------------------
  { fr: '%s kg pesés sur un engin de %s t de charge utile.', ar: '{0} كغ موزونة على معدة حمولتها النافعة {1} طن.' },
  { fr: "Vérifier la saisie : une décimale déplacée donne ce résultat. S'il s'agit d'une surcharge réelle, elle engage la commune.", ar: 'التثبّت من الإدخال: فاصلة عشرية في غير موضعها تعطي هذه النتيجة. وإذا كان الأمر حمولة زائدة فعلية فهي تُلزم البلدية.' },
  { fr: "Pesée un jour où ce circuit n'est pas programmé.", ar: 'وزن في يوم لا يُبرمج فيه هذا المسلك.' },
  { fr: 'Rattrapage ? Alors le noter en observation. Sinon, corriger la date ou les jours de passage du circuit.', ar: 'تدارك؟ عندئذ يُدوَّن ذلك في الملاحظة. وإلا فتصحيح التاريخ أو أيام مرور المسلك.' },
  { fr: "Engin déclaré %s à l'inventaire%s.", ar: 'معدة مصرَّح بأنها {0} بالجرد{1}.' },
  { fr: "Soit l'engin est reparti et l'inventaire n'a pas suivi, soit la pesée porte sur un autre engin.", ar: 'إما أن المعدة عادت إلى العمل ولم يواكب الجرد ذلك، وإما أن الوزن يخص معدة أخرى.' },
  { fr: 'Immatriculation saisie à la main, introuvable au parc.', ar: 'رقم تسجيل مُدخَل يدويًا، غير موجود بالحظيرة.' },
  { fr: "Engin loué ou d'un prestataire ? Alors c'est normal. Sinon, l'inscrire à l'inventaire.", ar: 'معدة مكتراة أو تابعة لمتعهد؟ عندئذ الأمر عادي. وإلا فتسجيلها بالجرد.' },
  { fr: 'Circuit actif, aucune pesée enregistrée depuis trente jours.', ar: 'مسلك نشيط، لا وزن مسجَّل منذ ثلاثين يومًا.' },
  { fr: "Saisir les pesées de ce circuit, ou indiquer qu'il ne passe pas au pont-bascule.", ar: 'إدخال أوزان هذا المسلك، أو الإشارة إلى أنه لا يمرّ بميزان الشاحنات.' },

  // --- Registres : circuits, parc, personnel ----------------------------------------------------
  { fr: "L'engin %s (%s) est déclaré %s à l'inventaire.", ar: 'المعدة {0} ({1}) مصرَّح بأنها {2} بالجرد.' },
  { fr: "L'engin d'appui déclaré pour ce circuit est %s : confirmer qu'il a bien pris le relais, ou suspendre le circuit.", ar: 'معدة الدعم المصرَّح بها لهذا المسلك هي {0}: التأكد من أنها تولّت المهمة فعلاً، أو تعليق المسلك.' },
  { fr: "Aucun engin d'appui n'est déclaré pour ce circuit. Indiquer quel engin le remplace, ou suspendre le circuit.", ar: 'لا معدة دعم مصرَّح بها لهذا المسلك. تحديد المعدة التي تعوّضه، أو تعليق المسلك.' },
  { fr: "L'immatriculation %s ne correspond à aucun engin du parc.", ar: 'رقم التسجيل {0} لا يطابق أي معدة بالحظيرة.' },
  { fr: "Corriger l'immatriculation au registre des circuits, ou inscrire l'engin à l'inventaire.", ar: 'تصحيح رقم التسجيل بسجلّ المسالك، أو تسجيل المعدة بالجرد.' },
  { fr: 'Aucun point de collecte enregistré.', ar: 'لا نقطة رفع مسجَّلة.' },
  { fr: 'Importer la trace et les points, ou saisir au moins les arrêts principaux.', ar: 'استيراد المسار والنقاط، أو إدخال محطات التوقف الرئيسية على الأقل.' },
  { fr: 'Engin immobilisé sans motif renseigné.', ar: 'معدة متوقفة دون سبب مدوَّن.' },
  { fr: "Indiquer la panne ou la raison de l'immobilisation.", ar: 'بيان العطب أو سبب التوقف.' },
  { fr: 'Engin immobilisé sans date de début.', ar: 'معدة متوقفة دون تاريخ بداية.' },
  { fr: "Dater l'immobilisation : sans cela, la durée d'arrêt ne peut pas être suivie.", ar: 'تأريخ التوقف: بدونه لا يمكن تتبّع مدة التوقف.' },
  { fr: 'Engin en service affecté à aucun circuit.', ar: 'معدة في الاستعمال غير مسندة إلى أي مسلك.' },
  { fr: "Affecter l'engin, ou noter son emploi réel (réserve, appui, atelier).", ar: 'إسناد المعدة، أو تدوين استعمالها الفعلي (احتياط، دعم، ورشة).' },
  { fr: 'Ni exécutant ni engin renseignés.', ar: 'لا منفّذ ولا معدة مدوَّنان.' },
  { fr: "Désigner la régie ou un prestataire, et l'engin affecté.", ar: 'تعيين الإدارة المباشرة أو متعهد، والمعدة المسندة.' },
  { fr: 'Circuit en régie sans aucun agent affecté.', ar: 'مسلك في الإدارة المباشرة دون أي عون مسند.' },
  { fr: "Affecter l'équipe, ou indiquer le prestataire qui exécute le circuit.", ar: 'إسناد الفرقة، أو بيان المتعهد الذي ينفّذ المسلك.' },
  { fr: 'Équipe affectée, mais aucun chauffeur désigné.', ar: 'فرقة مسندة، لكن دون سائق معيَّن.' },
  { fr: "Désigner le chauffeur : c'est lui qui répond de l'engin.", ar: 'تعيين السائق: فهو المسؤول عن المعدة.' },
  { fr: 'Fiche : équipe de %s. Affectés : %s.', ar: 'البطاقة: فرقة من {0}. المسندون: {1}.' },
  { fr: "Mettre la fiche à jour, ou compléter l'équipe.", ar: 'تحيين البطاقة، أو استكمال الفرقة.' },
  { fr: 'Affecté à « %s » (%s-%s) et à « %s » (%s-%s) : les horaires se chevauchent.', ar: 'مسند إلى «{0}» ({1}-{2}) وإلى «{3}» ({4}-{5}): التوقيتان متداخلان.' },
  { fr: "Corriger l'une des deux affectations, ou ajuster les horaires des circuits.", ar: 'تصحيح أحد الإسنادين، أو ضبط توقيت المسالك.' },
  { fr: 'Désigné chauffeur, aucune catégorie de permis enregistrée.', ar: 'معيَّن سائقًا، دون أي صنف رخصة مسجَّل.' },
  { fr: "Saisir les catégories détenues : c'est ce qui dit qui peut conduire quel engin.", ar: 'إدخال الأصناف المحوزة: فهي التي تبيّن من يمكنه سياقة أي معدة.' },

  // --- Seuils : réclamations, entretiens, actions planifiées -------------------------------------
  { fr: '%s réclamation(s) attendent depuis plus de %s jours (la plus ancienne : %s jours).', ar: '{0} إبلاغ(ات) في الانتظار منذ أكثر من {1} يومًا (الأقدم: {2} يومًا).' },
  { fr: "Les traiter ou les assigner. Le délai d'alerte se règle dans Paramètres.", ar: 'معالجتها أو إسنادها. يُضبط أجل التنبيه في الإعدادات.' },
  { fr: '%s entretien(s) en retard, dont %s.', ar: '{0} صيانة(ات) متأخرة، منها {1}.' },
  { fr: "Voir le bandeau d'échéances de l'écran Parc, et saisir les interventions faites.", ar: 'الاطلاع على شريط الآجال في شاشة الحظيرة، وإدخال التدخلات المنجزة.' },
  { fr: 'Action prévue %s, toujours planifiée : %s point(s) fait(s) sur %s.', ar: 'إجراء مبرمج {0}، لا يزال مبرمجًا: {1} نقطة (نقاط) منجزة من أصل {2}.' },
  { fr: "La terminer, l'annuler, ou en reporter la date (onglet Points › Actions planifiées).", ar: 'إنهاؤه، أو إلغاؤه، أو تأجيل تاريخه (علامة النقاط › الأعمال المبرمجة).' },
];

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Le modèle devenu expression régulière : chaque « %s » capture une valeur, et rien d'autre ne varie. */
const compiles = MODELES.map((m) => ({
  ...m,
  expression: new RegExp(`^${m.fr.split('%s').map(echapper).join('(.*?)')}$`, 's'),
}));

/** Le texte français que la base a écrit, en arabe — ou `null` si aucun modèle ne le reconnaît. */
export function traduireAvis(texte: string | null | undefined): string | null {
  if (texte == null || texte === '') return null;
  for (const m of compiles) {
    const correspondance = m.expression.exec(texte);
    if (!correspondance) continue;
    const valeurs = correspondance.slice(1).map(valeurAr);
    return m.ar.replace(/\{(\d+)\}/g, (_, i: string) => valeurs[Number(i)] ?? '');
  }
  return null;
}

/** Un avis de « À vérifier » avec ses trois textes en arabe (`null` quand le français n'a pas de modèle). */
export function avecTraduction<T extends { sujet: string; constat: string; quoi_faire: string }>(
  ligne: T
): T & { sujet_ar: string | null; constat_ar: string | null; quoi_faire_ar: string | null } {
  return {
    ...ligne,
    sujet_ar: traduireAvis(ligne.sujet),
    constat_ar: traduireAvis(ligne.constat),
    quoi_faire_ar: traduireAvis(ligne.quoi_faire),
  };
}

/**
 * Les textes à traduire écrits dans le SQL d'une fonction : les chaînes littérales qui ont
 * une phrase (une espace et un point, ou une valeur « %s »), commentaires retirés, apostrophes
 * doublées ramenées à une, « %% » ramené à « % ». Sert à la campagne `avis-ar`, qui exige un
 * modèle pour chacune.
 */
export function textesDuSql(definition: string): string[] {
  const sansCommentaires = definition.replace(/--[^\n]*/g, '');
  const trouves = new Set<string>();
  for (const m of sansCommentaires.matchAll(/'((?:[^']|'')*)'/g)) {
    const texte = m[1].replace(/''/g, "'").replace(/%%/g, '%');
    // « %s — %s » (une date, un nom) n'est pas une phrase : il n'y a rien à y traduire.
    const aDesMots = /[A-Za-zÀ-ÿ]{3,}/.test(texte.replace(/%s/g, ''));
    if (aDesMots && texte.includes(' ') && (texte.endsWith('.') || texte.includes('%s'))) trouves.add(texte);
  }
  return [...trouves];
}
