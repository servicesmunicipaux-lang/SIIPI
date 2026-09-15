import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, 
  PieChart, Pie 
} from 'recharts';
import { FNCTLogo, TunisianCoatOfArmsLogo, ANGeDLogo, InstitutionalLogosBanner } from './Logos';
import { 
  Users, 
  Trash2, 
  Scale, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  Search, 
  MapPin, 
  FileText, 
  Mail, 
  Phone, 
  Share2, 
  ExternalLink,
  Building2,
  TrendingUp,
  Globe,
  Sparkles,
  ShieldCheck,
  Recycle,
  Layers,
  Activity,
  Boxes,
  Leaf,
  Factory
} from 'lucide-react';
import { Language } from '../types/siipi';

interface NationalHTMLReportEmbedProps {
  language?: Language;
}

// Complete 24 Governorates Dataset from official DMA report
export const RAW_GOVERNORATES_REPORT = [
  { rang: 1, nameFr: "Tunis", nameAr: "تونس", nameEn: "Tunis", pop: 1045000, dma: 342388, part: "9.1%", infraFr: "DC Djebel Chakir ✅", infraAr: "مصب جبل شكير ✅", infraEn: "Djebel Chakir DC ✅", group: "tunis" },
  { rang: 2, nameFr: "Sfax", nameAr: "صفاقس", nameEn: "Sfax", pop: 1053688, dma: 326904, part: "8.7%", infraFr: "DC Sfax ✅", infraAr: "مصب صفاقس ✅", infraEn: "Sfax DC ✅", group: "sfax" },
  { rang: 3, nameFr: "Nabeul", nameAr: "نابل", nameEn: "Nabeul", pop: 897133, dma: 278336, part: "7.4%", infraFr: "DC Nabeul ✅", infraAr: "مصب نابل ✅", infraEn: "Nabeul DC ✅", group: "all" },
  { rang: 4, nameFr: "Sousse", nameAr: "سوسة", nameEn: "Sousse", pop: 773443, dma: 239963, part: "6.4%", infraFr: "DC Sousse ✅", infraAr: "مصب سوسة ✅", infraEn: "Sousse DC ✅", group: "sousse" },
  { rang: 5, nameFr: "Ben Arous", nameAr: "بن عروس", nameEn: "Ben Arous", pop: 712000, dma: 230065, part: "6.1%", infraFr: "DC Djebel Chakir ✅", infraAr: "مصب جبل شكير ✅", infraEn: "Djebel Chakir DC ✅", group: "tunis" },
  { rang: 6, nameFr: "Ariana", nameAr: "أريانة", nameEn: "Ariana", pop: 673000, dma: 214932, part: "5.7%", infraFr: "DC Djebel Chakir ✅", infraAr: "مصب جبل شكير ✅", infraEn: "Djebel Chakir DC ✅", group: "tunis" },
  { rang: 7, nameFr: "Monastir", nameAr: "المنستير", nameEn: "Monastir", pop: 627164, dma: 194578, part: "5.2%", infraFr: "Décharge Municipale 🚨", infraAr: "مصب بلدي غير مراقب 🚨", infraEn: "Municipal Landfill 🚨", group: "monastir" },
  { rang: 8, nameFr: "Kairouan", nameAr: "القيروان", nameEn: "Kairouan", pop: 611200, dma: 191076, part: "5.1%", infraFr: "DC Kairouan ✅", infraAr: "مصب القيروان ✅", infraEn: "Kairouan DC ✅", group: "all" },
  { rang: 9, nameFr: "Bizerte", nameAr: "بنزرت", nameEn: "Bizerte", pop: 614370, dma: 190608, part: "5.1%", infraFr: "DC Bizerte ✅", infraAr: "مصب بنزرت ✅", infraEn: "Bizerte DC ✅", group: "all" },
  { rang: 10, nameFr: "Mahdia", nameAr: "المهدية", nameEn: "Mahdia", pop: 459386, dma: 142525, part: "3.8%", infraFr: "Décharge Municipale 🚨", infraAr: "مصب بلدي غير مراقب 🚨", infraEn: "Municipal Landfill 🚨", group: "all" },
  { rang: 11, nameFr: "Gabès", nameAr: "قابس", nameEn: "Gabes", pop: 417139, dma: 129419, part: "3.5%", infraFr: "DC Gabès ✅", infraAr: "مصب قابس ✅", infraEn: "Gabes DC ✅", group: "all" },
  { rang: 12, nameFr: "Manouba", nameAr: "منوبة", nameEn: "Manouba", pop: 545749, dma: 135842, part: "3.6%", infraFr: "DC Djebel Chakir ✅", infraAr: "مصب جبل شكير ✅", infraEn: "Djebel Chakir DC ✅", group: "tunis" },
  { rang: 13, nameFr: "Medenine", nameAr: "مدنين", nameEn: "Medenine", pop: 520100, dma: 124350, part: "3.3%", infraFr: "DC Medenine ✅", infraAr: "مصب مدنين ✅", infraEn: "Medenine DC ✅", group: "all" },
  { rang: 14, nameFr: "Kasserine", nameAr: "القصرين", nameEn: "Kasserine", pop: 480200, dma: 112100, part: "3.0%", infraFr: "Décharge Municipale 🚨", infraAr: "مصب بلدي غير مراقب 🚨", infraEn: "Municipal Landfill 🚨", group: "all" },
  { rang: 15, nameFr: "Jendouba", nameAr: "جندوبة", nameEn: "Jendouba", pop: 420500, dma: 98400, part: "2.6%", infraFr: "Décharge Municipale 🚨", infraAr: "مصب بلدي غير مراقب 🚨", infraEn: "Municipal Landfill 🚨", group: "all" },
  { rang: 16, nameFr: "Sidi Bouzid", nameAr: "سيدي بوزيد", nameEn: "Sidi Bouzid", pop: 450300, dma: 96500, part: "2.6%", infraFr: "Décharge Municipale 🚨", infraAr: "مصب بلدي غير مراقب 🚨", infraEn: "Municipal Landfill 🚨", group: "all" },
  { rang: 17, nameFr: "Gafsa", nameAr: "قفصة", nameEn: "Gafsa", pop: 380100, dma: 89450, part: "2.4%", infraFr: "Décharge Municipale 🚨", infraAr: "مصب بلدي غير مراقب 🚨", infraEn: "Municipal Landfill 🚨", group: "all" },
  { rang: 18, nameFr: "Béja", nameAr: "باجة", nameEn: "Beja", pop: 312500, dma: 81200, part: "2.2%", infraFr: "DC Béja ✅", infraAr: "مصب باجة ✅", infraEn: "Beja DC ✅", group: "all" },
  { rang: 19, nameFr: "Kef", nameAr: "الكاف", nameEn: "Kef", pop: 250400, dma: 63100, part: "1.7%", infraFr: "Décharge Municipale 🚨", infraAr: "مصب بلدي غير مراقب 🚨", infraEn: "Municipal Landfill 🚨", group: "all" },
  { rang: 20, nameFr: "Siliana", nameAr: "سليانة", nameEn: "Siliana", pop: 230200, dma: 58200, part: "1.5%", infraFr: "Décharge Municipale 🚨", infraAr: "مصب بلدي غير مراقب 🚨", infraEn: "Municipal Landfill 🚨", group: "all" },
  { rang: 21, nameFr: "Kebili", nameAr: "قبلي", nameEn: "Kebili", pop: 170800, dma: 42100, part: "1.1%", infraFr: "Décharge Municipale 🚨", infraAr: "مصب بلدي غير مراقب 🚨", infraEn: "Municipal Landfill 🚨", group: "all" },
  { rang: 22, nameFr: "Zaghouan", nameAr: "زغوان", nameEn: "Zaghouan", pop: 191200, dma: 45200, part: "1.2%", infraFr: "DC Zaghouan ✅", infraAr: "مصب زغوان ✅", infraEn: "Zaghouan DC ✅", group: "all" },
  { rang: 23, nameFr: "Tozeur", nameAr: "توزر", nameEn: "Tozeur", pop: 115300, dma: 32540, part: "0.9%", infraFr: "DC Tozeur ✅", infraAr: "مصب توزر ✅", infraEn: "Tozeur DC ✅", group: "all" },
  { rang: 24, nameFr: "Tataouine", nameAr: "تطاوين", nameEn: "Tataouine", pop: 152100, dma: 30122, part: "0.8%", infraFr: "Décharge Municipale 🚨", infraAr: "مصب بلدي غير مراقب 🚨", infraEn: "Municipal Landfill 🚨", group: "all" }
];

export const REGION_INSIGHTS_DATA = {
  all: {
    fr: {
      name: "Toutes les Régions de Tunisie",
      status: "13 DC (67.5%) | 11 Non Contrôlées (32.5%)",
      pop: "12 144 222 hab.",
      dma: "3 767 752 T/an",
      spec: "0,815 kg/hab/j",
      desc: "La gestion globale montre une disparité majeure entre les gouvernorats disposant de centres de décharge contrôlés (DC) conformes aux normes et les territoires tributaires de décharges municipales non contrôlées.",
      recom: "Mettre en œuvre de toute urgence le Programme National de fermeture et réhabilitation des décharges non contrôlées à l'intérieur du pays."
    },
    ar: {
      name: "كامل تراب الجمهورية التونسية",
      status: "13 مصب مراقب (67.5%) | 11 مصب عشوائي (32.5%)",
      pop: "12 144 222 ساكن",
      dma: "3 767 752 طن/سنة",
      spec: "0.815 كغ/ساكن/يوم",
      desc: "يظهر تباين هيكلي حاد بين الولايات التي تحتوي على مصبات مراقبة والولايات الداخلية التي تفتقر للبنية التحتية، مما يعرض الساكنة لمخاطر بيئية وصحية.",
      recom: "الإسراع في تفعيل البرنامج الوطني لغلق وإعادة تهيئة المصبات العشوائية بالولايات الداخلية قبل حلول سنة 2028."
    },
    en: {
      name: "All Regions of Tunisia",
      status: "13 Controlled DC (67.5%) | 11 Uncontrolled (32.5%)",
      pop: "12 144 222 inhab.",
      dma: "3 767 752 T/year",
      spec: "0.815 kg/cap/day",
      desc: "The overall waste management structure shows a significant disparity between urban coastal areas with controlled landfills and the inland governorates.",
      recom: "Expedite the National Action Plan for closing and rehabilitating uncontrolled landfills across all interior governorates by 2028."
    }
  },
  tunis: {
    fr: {
      name: "Métropole du Grand Tunis",
      status: "100% Collecté - DC Djebel Chakir ✅",
      pop: "2 975 749 hab.",
      dma: "923 227 T/an",
      spec: "0,850 kg/hab/j",
      desc: "Le Grand Tunis génère le quart des déchets du pays. La dépendance absolue envers l'unique centre d'enfouissement de Djebel Chakir pose un risque systémique en cas d'arrêt technique ou de saturation complète du site.",
      recom: "Lancer immédiatement les études et aménagements du site successeur de Djebel Chakir et déployer une filière de valorisation organique industrielle."
    },
    ar: {
      name: "إقليم تونس الكبرى",
      status: "100% مصب مراقب - جبل شكير ✅",
      pop: "2 975 749 ساكن",
      dma: "923 227 طن/سنة",
      spec: "0.850 كغ/ساكن/يوم",
      desc: "ينتج هذا الإقليم ربع النفايات الوطنية. يمثل الاعتماد الحصري والكامل على مصب جبل شكير خطراً بيئياً وتشغيلياً داهماً في حال توقف المصب أو امتلائه بالكامل.",
      recom: "البدء فوراً في إيجاد وتهيئة مصب بديل لجبل شكير مع إرساء وحدات فرز ميكانيكي وبيولوجي وتثمين الأسمدة العضوية."
    },
    en: {
      name: "Grand Tunis Metropolitan Area",
      status: "100% Controlled - Djebel Chakir DC ✅",
      pop: "2 975 749 inhab.",
      dma: "923 227 T/year",
      spec: "0.850 kg/cap/day",
      desc: "Grand Tunis produces a quarter of the country's waste. The absolute reliance on Djebel Chakir landfill creates a major operational hazard if any technical failure or full saturation occurs.",
      recom: "Urgently plan and design the successor landfill site for Djebel Chakir and implement large-scale mechanical biological treatment (MBT)."
    }
  },
  sfax: {
    fr: {
      name: "Grand Sfax",
      status: "100% Collecté - DC Sfax ✅",
      pop: "1 053 688 hab.",
      dma: "326 904 T/an",
      spec: "0,850 kg/hab/j",
      desc: "Deuxième pôle économique de Tunisie. La forte mixité avec les flux industriels locaux (phosphates, chimie) requiert un contrôle strict. Le gisement local offre un immense potentiel de compostage agricole.",
      recom: "Isoler de manière irréprochable les flux ménagers des flux industriels dangereux et lancer un projet de compostage dédié à l'oléiculture du Sahel."
    },
    ar: {
      name: "صفاقس الكبرى",
      status: "100% مصب مراقب - صفاقس ✅",
      pop: "1 053 688 ساكن",
      dma: "326 904 طن/سنة",
      spec: "0.850 كغ/ساكن/يوم",
      desc: "القطب الاقتصادي الثاني في البلاد. التداخل الكثيف مع النفايات الصناعية المحلية يفرض تشديد الرقابة. يمثل حجم النفايات العضوية فرصة ممتازة لإنتاج الأسمدة.",
      recom: "الفصل الصارم بين مسارات النفايات المنزلية والنفايات الصناعية الخطرة، وإطلاق وحدة نموذجية لإنتاج الأسمدة لقطاع الزيتون."
    },
    en: {
      name: "Grand Sfax Area",
      status: "100% Controlled - Sfax DC ✅",
      pop: "1 053 688 inhab.",
      dma: "326 904 T/year",
      spec: "0.850 kg/cap/day",
      desc: "The second economic center in Tunisia. High intersection with industrial waste streams requires strict inspection. The region's organic stream has massive potential for agricultural composting.",
      recom: "Ensure perfect segregation between household and industrial waste, and start a green composting facility adapted for olive groves."
    }
  },
  sousse: {
    fr: {
      name: "Sousse Littoral",
      status: "100% Collecté - DC Sousse ✅",
      pop: "773 443 hab.",
      dma: "239 963 T/an",
      spec: "0,850 kg/hab/j",
      desc: "La dimension hautement touristique du gouvernorat de Sousse entraîne des pics saisonniers massifs (jusqu'à +50% en été), surchargeant le matériel et les équipes opérationnelles.",
      recom: "Adapter la flotte de collecte et les fréquences de ramassage à la saisonnalité touristique côtière de Hammamet Sud à Monastir."
    },
    ar: {
      name: "ولاية سوسة الساحلية",
      status: "100% مصب مراقب - سوسة ✅",
      pop: "773 443 ساكن",
      dma: "239 963 طن/سنة",
      spec: "0.850 كغ/ساكن/يوم",
      desc: "يتسبب النشاط السياحي الكثيف بسوسة في ذروة موسمية ضخمة للنفايات (تصل لـ +50% في الصيف)، مما يشكل ضغطاً كبيراً على معدات وأطقم البلديات.",
      recom: "ملاءمة أسطول الجمع البلدي وعدد الدوريات والترددات مع فترات النشاط السياحي المكثف بالمنطقة الساحلية."
    },
    en: {
      name: "Sousse Coastal Area",
      status: "100% Controlled - Sousse DC ✅",
      pop: "773 443 inhab.",
      dma: "239 963 T/year",
      spec: "0.850 kg/cap/day",
      desc: "Sousse's high tourist activity leads to massive seasonal waste spikes (up to +50% during summer), overloading municipal collection vehicles and workforce.",
      recom: "Tailor the collection fleet scheduling and logistics to match coastal tourism peak seasons from South Hammamet to Monastir."
    }
  },
  monastir: {
    fr: {
      name: "Monastir — Urgence Nationale 🚨",
      status: "0% DC - Décharge Municipale Non Contrôlée 🚨",
      pop: "627 164 hab.",
      dma: "194 578 T/an",
      spec: "0,850 kg/hab/j",
      desc: "Monastir présente le paradoxe le plus lourd de Tunisie : 7e gisement national avec 31 communes (le record national) mais aucune infrastructure contrôlée pour traiter ses 533 tonnes quotidiennes.",
      recom: "Construire d'extrême urgence le Centre de Décharge Contrôlé de Monastir ou l'intégrer au pôle régional Sousse-Monastir pour éradiquer les décharges municipales."
    },
    ar: {
      name: "المنستير — حالة طوارئ وطنية 🚨",
      status: "0% مراقبة - مصب بلدي عشوائي 🚨",
      pop: "627 164 ساكن",
      dma: "194 578 طن/سنة",
      spec: "0.850 كغ/ساكن/يوم",
      desc: "تمثل المنستير أكبر مفارقة في تونس: تحتل المرتبة السابعة وطنياً بـ 31 بلدية (الرقم القياسي للبلديات) لكن بدون أي مصب مراقب لمعالجة 533 طناً يومياً.",
      recom: "بناء مصب مراقب لولاية المنستير بصفة عاجلة للغاية أو دمجها في مصب إقليمي مشترك مع ولاية سوسة للقضاء على المصبات العشوائية."
    },
    en: {
      name: "Monastir — National Emergency 🚨",
      status: "0% DC - Uncontrolled Municipal Landfill 🚨",
      pop: "627 164 inhab.",
      dma: "194 578 T/year",
      spec: "0.850 kg/cap/day",
      desc: "Monastir shows the most critical anomaly in Tunisia: 7th national waste producer with 31 municipalities (national record) but zero controlled infrastructure for its 533 daily tonnes.",
      recom: "Construct an emergency Controlled Landfill for Monastir or integrate it into a shared regional facility with Sousse to shut down wild landfills."
    }
  }
};

export const NationalHTMLReportEmbed: React.FC<NationalHTMLReportEmbedProps> = ({ language = 'fr' }) => {
  const [currentLang, setCurrentLang] = useState<'fr' | 'ar' | 'en'>(language === 'ar' ? 'ar' : 'fr');
  const [selectedAgg, setSelectedAgg] = useState<'all' | 'tunis' | 'sfax' | 'sousse' | 'monastir'>('all');
  const [searchFilter, setSearchFilter] = useState('');

  const isAr = currentLang === 'ar';

  // Typologie Recharts Data
  const compositionData = useMemo(() => [
    { name: isAr ? 'المواد العضوية' : 'Matières organiques', percent: 58.7, fill: '#10b981' },
    { name: isAr ? 'البلاستيك' : 'Plastiques', percent: 12.1, fill: '#f59e0b' },
    { name: isAr ? 'الورق والكرتون' : 'Papiers et cartons', percent: 9.0, fill: '#3b82f6' },
    { name: isAr ? 'المنسوجات' : 'Textiles', percent: 8.1, fill: '#8b5cf6' },
    { name: isAr ? 'مواد مختلفة' : 'Divers', percent: 8.1, fill: '#64748b' },
    { name: isAr ? 'المعادن' : 'Métaux', percent: 2.4, fill: '#ec4899' },
    { name: isAr ? 'البلور' : 'Verres', percent: 1.6, fill: '#06b6d4' }
  ], [isAr]);

  // Elimination Recharts Data
  const eliminationData = useMemo(() => [
    { name: isAr ? 'مصبات مراقبة (DC)' : 'Décharge Contrôlée (DC)', value: 67.5, color: '#10b981' },
    { name: isAr ? 'مصبات غير مراقبة' : 'Décharge Non Contrôlée', value: 32.5, color: '#f43f5e' }
  ], [isAr]);

  // Filtered Governorates list
  const filteredGovs = useMemo(() => {
    return RAW_GOVERNORATES_REPORT.filter(g => {
      const matchAgg = selectedAgg === 'all' || g.group === selectedAgg || (selectedAgg === 'tunis' && g.group === 'tunis');
      const name = currentLang === 'ar' ? g.nameAr : (currentLang === 'en' ? g.nameEn : g.nameFr);
      const matchSearch = searchFilter.trim() === '' || name.toLowerCase().includes(searchFilter.toLowerCase());
      return matchAgg && matchSearch;
    });
  }, [selectedAgg, searchFilter, currentLang]);

  // Full table filtered list
  const tableGovs = useMemo(() => {
    return RAW_GOVERNORATES_REPORT.filter(g => {
      const name = currentLang === 'ar' ? g.nameAr : (currentLang === 'en' ? g.nameEn : g.nameFr);
      return searchFilter.trim() === '' || name.toLowerCase().includes(searchFilter.toLowerCase());
    });
  }, [searchFilter, currentLang]);

  const activeInsight = REGION_INSIGHTS_DATA[selectedAgg][currentLang];

  // Function to download the full original standalone HTML file
  const handleDownloadStandaloneHTML = () => {
    const htmlContent = `<!DOCTYPE html>
<html lang="${currentLang}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rapport national de gestion des déchets année 2026</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
        body { font-family: 'Plus Jakarta Sans', 'Cairo', sans-serif; background-color: #f8fafc; color: #0f172a; }
        .bold-text, p, span, td, th, h1, h2, h3, h4, h5, h6, li, button, select, div { font-weight: 700 !important; }
        .super-bold { font-weight: 900 !important; }
    </style>
</head>
<body class="bg-slate-50 min-h-screen">
    <div class="max-w-7xl mx-auto p-6 space-y-6">
        <header class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <h1 class="text-2xl text-emerald-800 font-black">Rapport national de gestion des déchets année 2026</h1>
                <p class="text-sm text-slate-500">Tunisie — État des Lieux, Indicateurs et Stratégies • Observatoire National FNCT / ANGeD</p>
            </div>
            <div class="text-sm font-bold text-slate-700">
                <span>12 144 222 Habitants • 349 Communes • 3 767 752 T/an</span>
            </div>
        </header>
        <div class="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <h2 class="text-lg font-bold text-emerald-900 mb-2">Synthèse Nationale Exécutive</h2>
            <p class="text-sm text-emerald-800">Production nationale de 10 323 Tonnes/jour avec 0,815 kg/hab/j. 67,5% acheminés vers des décharges contrôlées (13 gouvernorats) et 32,5% vers des décharges non contrôlées (11 gouvernorats). Potentiel de valorisation matière et organique de 91,9%.</p>
        </div>
    </div>
</body>
</html>`;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rapport_national_dechets_tunisie_2026.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`space-y-6 ${isAr ? 'rtl' : 'ltr'}`} dir={isAr ? 'rtl' : 'ltr'}>
      
      {/* HEADER PRINCIPAL DU RAPPORT */}
      <header className="bg-slate-900/95 border border-slate-800 rounded-2xl p-6 text-white shadow-2xl relative overflow-hidden space-y-4">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        
        {/* Official Institutional Logos Showcase */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 relative z-10">
          <FNCTLogo variant="full" theme="dark" size="sm" />
          
          <div className="flex items-center gap-2.5 px-3 py-1 border-x border-slate-800">
            <TunisianCoatOfArmsLogo size="sm" />
            <div className="text-center hidden sm:block">
              <span className="text-xs font-black text-amber-400 block" style={{ fontFamily: 'Cairo, sans-serif' }}>
                الجمهورية التونسية
              </span>
              <span className="text-[9px] text-slate-400 font-bold block">
                RÉPUBLIQUE TUNISIENNE
              </span>
            </div>
          </div>

          <ANGeDLogo variant="full" theme="dark" size="sm" />
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10 pt-1">
          
          {/* CÔTÉ GAUCHE : Bouton de téléchargement */}
          <div className="flex items-center gap-3 order-3 md:order-1">
            <button 
              id="downloadBtn" 
              onClick={handleDownloadStandaloneHTML}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition-all text-xs font-bold cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isAr ? 'تحميل لوحة التحكم (HTML)' : 'Télécharger le Tableau (HTML)'}</span>
            </button>
          </div>

          {/* CENTRE : Titre principal */}
          <div className="text-center order-1 md:order-2 flex-1">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[11px] font-bold border border-emerald-500/30">
                RAPPORT OFFICIEL ANNUEL DMA 2026
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-emerald-400 tracking-tight">
              {isAr ? 'التقرير الوطني لإدارة النفايات لسنة 2026' : 'Rapport national de gestion des déchets année 2026'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 uppercase tracking-wider font-semibold">
              {isAr ? 'تونس — حالة القطاع، المؤشرات والاستراتيجيات' : 'Tunisie — État des Lieux, Indicateurs et Stratégies'}
            </p>
          </div>

          {/* CÔTÉ DROIT : Sélecteur de langue interactif */}
          <div className="flex items-center justify-end gap-3 order-2 md:order-3">
            <div className="flex items-center bg-slate-800/80 border border-slate-700 rounded-xl p-1 text-xs font-bold">
              <button
                onClick={() => setCurrentLang('fr')}
                className={`px-2.5 py-1 rounded-lg transition-all ${currentLang === 'fr' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                🇫🇷 FR
              </button>
              <button
                onClick={() => setCurrentLang('ar')}
                className={`px-2.5 py-1 rounded-lg transition-all ${currentLang === 'ar' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                🇹🇳 عربي
              </button>
              <button
                onClick={() => setCurrentLang('en')}
                className={`px-2.5 py-1 rounded-lg transition-all ${currentLang === 'en' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
              >
                🇬🇧 EN
              </button>
            </div>
          </div>

        </div>
      </header>

      {/* SECTION 1 : CHIFFRES CLÉS (KPIs) */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-white border-l-4 border-emerald-500 pl-3 flex items-center gap-2">
          <span>{isAr ? 'مؤشرات الأداء الرئيسية العالمية (KPI 2026)' : 'Indicateurs Clés de Performance Globaux (KPI 2026)'}</span>
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* KPI 1 : Population */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex items-center gap-4">
            <div className="p-3.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase block font-bold">
                {isAr ? 'إجمالي السكان' : 'Population Totale'}
              </span>
              <span className="text-2xl text-white font-black block">12 144 222</span>
              <span className="text-xs text-emerald-400 font-bold">349 Communes</span>
            </div>
          </div>

          {/* KPI 2 : Gisement National */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex items-center gap-4">
            <div className="p-3.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase block font-bold">
                {isAr ? 'الكميات السنوية' : 'Gisement Annuel'}
              </span>
              <span className="text-2xl text-white font-black block">3 767 752 T</span>
              <span className="text-xs text-slate-400 font-bold">10 323 Tonnes / Jour</span>
            </div>
          </div>

          {/* KPI 3 : Ratio Spécifique */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex items-center gap-4">
            <div className="p-3.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase block font-bold">
                {isAr ? 'المعدل الفردي للنفايات' : 'Production Spécifique'}
              </span>
              <span className="text-2xl text-white font-black block">0,815 kg</span>
              <span className="text-xs text-slate-400 font-bold">par Habitant / Jour</span>
            </div>
          </div>

          {/* KPI 4 : Taux de Décharge Contrôlée */}
          <div className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl flex items-center gap-4">
            <div className="p-3.5 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs text-slate-400 uppercase block font-bold">
                {isAr ? 'المصبات المراقبة' : 'Décharges Contrôlées'}
              </span>
              <span className="text-2xl text-white font-black block">67,5 %</span>
              <span className="text-xs text-rose-400 font-bold">32,5 % Non Contrôlées</span>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 2 : VISUALISATION GRAPHIQUE (DOUBLES COLONNES) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Graphique 1 : Composition des déchets et Potentiel de valorisation (Col 7) */}
        <div className="lg:col-span-7 bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm sm:text-base text-white font-bold border-l-4 border-amber-500 pl-3">
              {isAr ? 'تركيبة النفايات ونسبة تثمينها وتدويرها (%)' : 'Composition Typologique des Déchets (% & Valorisation)'}
            </h3>
            <div className="bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-2.5 py-1 rounded-lg text-xs font-bold">
              <span>91.9% Valorisable</span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={compositionData} margin={{ top: 10, right: 30, left: 40, bottom: 0 }}>
                <XAxis type="number" domain={[0, 70]} stroke="#94a3b8" fontSize={11} />
                <YAxis dataKey="name" type="category" stroke="#cbd5e1" fontSize={11} width={130} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(val: any) => [`${val} %`, 'Part Nationale']}
                />
                <Bar dataKey="percent" radius={[0, 6, 6, 0]}>
                  {compositionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graphique 2 : Modes de traitement et Clivage Territorial (Col 5) */}
        <div className="lg:col-span-5 bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm sm:text-base text-white font-bold border-l-4 border-blue-500 pl-3 mb-2">
              {isAr ? 'التوزيع الوطني لطرق التخلص من النفايات' : 'Répartition Nationale des Modes d\'Élimination'}
            </h3>
            
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={eliminationData}
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {eliminationData.map((entry, index) => (
                      <Cell key={`pie-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(val: any) => [`${val} %`, 'Pourcentage']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
            <div className="p-3 bg-emerald-950/40 border border-emerald-900/60 rounded-xl text-center">
              <span className="text-[11px] text-slate-400 block font-bold">
                {isAr ? 'مصبات مراقبة (DC)' : 'Décharge Contrôlée (DC)'}
              </span>
              <span className="text-sm font-black text-emerald-400 block">13 Gouvernorats</span>
              <span className="text-[11px] text-slate-400 block">8 197 715 hab. (67,5%)</span>
            </div>
            <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-xl text-center">
              <span className="text-[11px] text-slate-400 block font-bold">
                {isAr ? 'مصبات بلدية غير مراقبة' : 'Non Contrôlée (MC)'}
              </span>
              <span className="text-sm font-black text-rose-400 block">11 Gouvernorats</span>
              <span className="text-[11px] text-slate-400 block">3 946 507 hab. (32,5%)</span>
            </div>
          </div>
        </div>

      </section>

      {/* SECTION 3 : CONSOLE INTERACTIVE (EXPLORATION PAR AGGLOMÉRATION ET GOUVERNORATS) */}
      <section className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-white border-l-4 border-emerald-500 pl-3">
              {isAr ? 'المستكشف التفاعلي للمستودعات الجهوية' : 'Explorateur Dynamique Territorial des Déchets'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAr 
                ? 'اختر إقليماً أو قم بتصفية الولايات للحصول على تحليل معمق وتوصيات ملائمة.'
                : 'Sélectionnez une agglomération ou filtrez par gouvernorat pour une analyse approfondie et des recommandations adaptées.'}
            </p>
          </div>
          
          {/* Sélecteur d'agglomération / Filtre */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: isAr ? 'كل الولايات' : 'Toutes les Régions' },
              { id: 'tunis', label: isAr ? 'تونس الكبرى' : 'Grand Tunis' },
              { id: 'sfax', label: isAr ? 'صفاقس' : 'Sfax' },
              { id: 'sousse', label: isAr ? 'سوسة' : 'Sousse' },
              { id: 'monastir', label: isAr ? 'المنستير 🚨' : 'Monastir 🚨', isAlert: true }
            ].map(btn => (
              <button
                key={btn.id}
                onClick={() => setSelectedAgg(btn.id as any)}
                className={`px-3.5 py-2 text-xs rounded-xl font-bold transition-all cursor-pointer ${
                  selectedAgg === btn.id
                    ? btn.isAlert ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30' : 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dashboard interactif du filtre */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Colonne 1 : Liste interactive des gouvernorats de la région */}
          <div className="lg:col-span-1 border-r border-slate-800 pr-0 lg:pr-4">
            <h3 className="text-xs text-slate-400 uppercase mb-3 font-bold">
              {isAr ? 'الولايات المفلترة' : 'Gouvernorats Filtrés'} ({filteredGovs.length})
            </h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
              {filteredGovs.map(gov => {
                const name = isAr ? gov.nameAr : (currentLang === 'en' ? gov.nameEn : gov.nameFr);
                const isDC = !gov.infraFr.includes("🚨");
                return (
                  <div key={gov.rang} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-850 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isDC ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                      <span className="font-bold text-slate-200 text-xs">{name}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono font-bold">
                      {gov.dma.toLocaleString('fr-FR')} T/an
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Colonne 2 & 3 : Zoom analytique détaillé et Recommandations */}
          <div className="lg:col-span-2 flex flex-col justify-between space-y-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
              <div className="flex items-center gap-3">
                <span className={`p-2.5 rounded-lg text-sm ${selectedAgg === 'monastir' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'}`}>
                  <MapPin className="w-5 h-5" />
                </span>
                <div>
                  <h4 className="text-base text-white font-black">{activeInsight.name}</h4>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold inline-block mt-0.5 ${selectedAgg === 'monastir' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'}`}>
                    {activeInsight.status}
                  </span>
                </div>
              </div>

              {/* Chiffres clés de la sélection */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-900 p-2.5 rounded-lg text-center border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Population</span>
                  <span className="text-xs text-white font-black block">{activeInsight.pop}</span>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg text-center border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Gisement DMA</span>
                  <span className="text-xs text-emerald-400 font-black block">{activeInsight.dma}</span>
                </div>
                <div className="bg-slate-900 p-2.5 rounded-lg text-center border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Spécifique</span>
                  <span className="text-xs text-cyan-400 font-black block">{activeInsight.spec}</span>
                </div>
              </div>

              {/* Focus Enjeux et opportunités de la région */}
              <div>
                <span className="text-xs text-slate-400 uppercase block mb-1 font-bold">
                  {isAr ? 'التحليل الموضوعي للخبير' : 'Analyse Thématique de l\'Expert'}
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {activeInsight.desc}
                </p>
              </div>
            </div>

            {/* Recommandation clé en évidence */}
            <div className="p-4 bg-amber-950/40 rounded-xl border border-amber-800/80 flex items-start gap-3">
              <span className="text-amber-400 text-lg mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div>
                <span className="text-xs text-amber-300 uppercase block font-bold">
                  {isAr ? 'التوصية الإستراتيجية ذات الأولوية المطلقة' : 'Recommandation Stratégique Prioritaire'}
                </span>
                <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                  {activeInsight.recom}
                </p>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* SECTION 4 : TABLEAU DE DONNÉES NATIONAL COMPLET */}
      <section className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-base text-white font-bold border-l-4 border-emerald-500 pl-3">
              {isAr ? 'قاعدة البيانات الكاملة وترتيب الولايات (2026)' : 'Base de données complète et classement des Gouvernorats (2026)'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isAr 
                ? 'البيانات الوطنية المرجعية لـ 24 ولاية مرتبة حسب حجم النفايات السنوية.'
                : 'Données nationales de cadrage pour les 24 gouvernorats classées par niveau de gisement.'}
            </p>
          </div>
          
          {/* Recherche rapide */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={isAr ? 'ابحث عن ولاية...' : 'Rechercher un gouvernorat...'}
              className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full sm:w-64 font-bold"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4 text-center">Rang</th>
                <th className="py-3 px-4">{isAr ? 'الولاية' : 'Gouvernorat'}</th>
                <th className="py-3 px-4 text-right">{isAr ? 'السكان' : 'Population'}</th>
                <th className="py-3 px-4 text-right">{isAr ? 'النفايات (طن/سنة)' : 'DMA (Tonnes/an)'}</th>
                <th className="py-3 px-4 text-right">{isAr ? 'النسبة الوطنية' : 'Part Nationale'}</th>
                <th className="py-3 px-4 text-center">{isAr ? 'البنية التحتية الرئيسية' : 'Infrastructure Principale'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {tableGovs.map(gov => {
                const name = isAr ? gov.nameAr : (currentLang === 'en' ? gov.nameEn : gov.nameFr);
                const infra = isAr ? gov.infraAr : (currentLang === 'en' ? gov.infraEn : gov.infraFr);
                const isDC = !gov.infraFr.includes("🚨");

                return (
                  <tr key={gov.rang} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 text-center text-slate-400 font-bold">{gov.rang}</td>
                    <td className="py-3.5 px-4 font-bold text-white">{name}</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-300">
                      {gov.pop.toLocaleString('fr-FR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400">
                      {gov.dma.toLocaleString('fr-FR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-cyan-400">
                      {gov.part}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        isDC 
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}>
                        {infra}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 5 : STRATÉGIE & FEUILLE DE ROUTE D'EXPERT */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Défis majeurs du secteur */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-base text-rose-400 font-bold border-l-4 border-rose-500 pl-3">
            {isAr ? 'التحديات الكبرى للقطاع في تونس' : 'Défis Majeurs du Secteur en Tunisie'}
          </h3>
          <div className="space-y-4">
            <div className="flex gap-3">
              <span className="p-2.5 bg-rose-500/10 text-rose-400 rounded-lg text-sm h-fit shrink-0 border border-rose-500/20">
                <MapPin className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm text-white block font-bold">
                  {isAr ? 'الفوارق الإقليمية والبنية التحتية' : 'Inégalités Territoriales & Infrastructure'}
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr 
                    ? 'تعتمد 11 ولاية داخلية وبعض الولايات الساحلية على مصبات عشوائية، مما يؤثر على 3.9 مليون ساكن.'
                    : '11 gouvernorats de l\'intérieur et certains littoraux dépendent de décharges sauvages, impactant 3.9 millions de Tunisiens.'}
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <span className="p-2.5 bg-rose-500/10 text-rose-400 rounded-lg text-sm h-fit shrink-0 border border-rose-500/20">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm text-white block font-bold">
                  {isAr ? 'الامتلاء الوشيك للمصبات الحالية' : 'Saturation Imminente des Centres Existants'}
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr
                    ? 'الحالة الحرجة لمصب برج شاكير، المصب الوحيد لتونس الكبرى، والذي يهدد امتلاؤه بشلل تام للعاصمة.'
                    : 'Le cas critique de Djebel Chakir, exutoire unique du Grand Tunis, dont la fermeture ou la saturation paralyse la capitale.'}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="p-2.5 bg-rose-500/10 text-rose-400 rounded-lg text-sm h-fit shrink-0 border border-rose-500/20">
                <Scale className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm text-white block font-bold">
                  {isAr ? 'العجز المالي الهيكلي والمزمن' : 'Déficit de Financement Chronique'}
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr
                    ? 'غياب جباية بيئية حقيقية، ضعف الاستفادة من المواد القابلة لإعادة التدوير وعدم تطبيق مبدأ الملوث يدفع.'
                    : 'Absence de redevance déchet réaliste, manque de valorisation des matières recyclables et sous-application du principe pollueur-payeur.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Opportunités et Plan National */}
        <div className="bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-base text-emerald-400 font-bold border-l-4 border-emerald-500 pl-3">
            {isAr ? 'الفرص الكبرى والتحول الاقتصادي' : 'Opportunités Majeurs & Transition Économique'}
          </h3>
          <div className="space-y-4">
            <div className="flex gap-3">
              <span className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm h-fit shrink-0 border border-emerald-500/20">
                <Leaf className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm text-white block font-bold">
                  {isAr ? 'الاقتصاد الدائري للمواد العضوية (الأسمدة والغاز الحيوى)' : 'Économie Circulaire Organique (Compostage & Biogaz)'}
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr
                    ? 'تمثل النفايات العضوية 58.7% (2.2 مليون طن/سنة) مخزوناً هائلاً لتعويض الأسمدة الكيميائية المستوردة وإنتاج الميثان.'
                    : 'La fraction organique de 58,7 % (2,2 millions de T/an) représente un gisement massif pour substituer les engrais importés et générer du méthane.'}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm h-fit shrink-0 border border-emerald-500/20">
                <Recycle className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm text-white block font-bold">
                  {isAr ? 'تطوير مسالك إعادة التدوير' : 'Développement des Filières de Recyclage'}
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr
                    ? 'توفر المواد البلاستيكية (455 ألف طن) والورق (339 ألف طن) قيمة مضافة عالية في حال إقرار الفرز الانتقائي من المصدر.'
                    : 'Plastiques (455 k tonnes) et carton (339 k tonnes) constituent un potentiel à forte valeur ajoutée en cas d\'instauration du tri sélectif à la source.'}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm h-fit shrink-0 border border-emerald-500/20">
                <Factory className="w-4 h-4" />
              </span>
              <div>
                <span className="text-sm text-white block font-bold">
                  {isAr ? 'خلق الوظائف الخضراء والتمويلات المناخية' : 'Création d\'Emplois Verts & Financement Climatique'}
                </span>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr
                    ? 'هيكلة جامعي النفايات غير الرسميين (البرباشة) والوصول للتمويل الدولي عبر الانتقال الأخضر (صندوق المناخ الأخضر).'
                    : 'Structuration des collecteurs informels et accès aux financements internationaux via la transition verte (Fonds Vert pour le Climat).'}
                </p>
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* FOOTER / SIGNATURE INSTITUTIONNELLE AVEC LOGOS OFFICIELS */}
      <footer className="bg-slate-950 text-white p-6 rounded-2xl border-t-4 border-emerald-600 shadow-xl space-y-6">
        
        {/* Showcase of 3 official logos */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
          <FNCTLogo variant="full" theme="dark" size="sm" />
          
          <div className="flex items-center gap-3 border-y md:border-y-0 md:border-x border-slate-800 py-2 md:py-0 md:px-6">
            <TunisianCoatOfArmsLogo size="sm" />
            <div className="text-center">
              <span className="text-xs font-black text-amber-400 block" style={{ fontFamily: 'Cairo, sans-serif' }}>
                الجمهورية التونسية
              </span>
              <span className="text-[10px] text-slate-400 font-bold block">
                RÉPUBLIQUE TUNISIENNE
              </span>
            </div>
          </div>

          <ANGeDLogo variant="full" theme="dark" size="sm" />
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div>
            <span className="text-lg text-emerald-400 font-bold block">
              {isAr ? 'المرصد الوطني للتصرف في النفايات المنزلية والمشابهة' : 'Observatoire National de Gestion des Déchets (DMA)'}
            </span>
            <span className="text-sm text-slate-400 block font-semibold">
              {isAr ? 'الجامعة الوطنية للبلديات التونسية (FNCT) • الوكالة الوطنية للتصرف في النفايات (ANGeD)' : 'Fédération Nationale des Communes Tunisiennes (FNCT) • Agence Nationale de Gestion des Déchets (ANGeD)'}
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">
              {isAr
                ? 'المصدر: قاعدة البيانات الوطنية للنفايات المنزلية والمشابهة 2025/2026 — وزارة البيئة والشؤون المحلية'
                : 'Source: Base de données nationale DMA 2025/2026 — Ministère de l\'Environnement et des Affaires Locales'}
            </span>
          </div>
          <div className="flex flex-col md:items-end gap-1.5 text-xs text-slate-300 font-mono">
            <span className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span>République Tunisienne — 349 Communes</span>
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Système National de Suivi & Indicateurs DMA</span>
            </span>
          </div>
        </div>
        <div className="border-t border-slate-800 pt-3 text-center text-xs text-slate-500 font-medium">
          <span>{isAr ? '© 2026 التقرير الوطني التونسي للنفايات — تصميم تفاعلي متطور. جميع الحقوق محفوظة.' : '© 2026 Rapport National Tunisien DMA — Conception Interactive de pointe. Tous droits réservés.'}</span>
        </div>
      </footer>

    </div>
  );
};
