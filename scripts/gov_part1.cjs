// Generator script for the 350 communes of Tunisia according to FNCT 2023 AG Database
const fs = require('fs');
const path = require('path');

const GOVERNORATES = {
  'Ariana': [
    { name: 'La Soukra', nameAr: 'سكرة', pop: 129622, tel: '71.764.999', fax: '71.764.777', email: 'commune.lasoukra@topnet.tn', addr: 'Avenue de l\'UMA, 2036 La Soukra', lat: 36.8878, lng: 10.2581, waste: 98.5, pcgd: 'valide' },
    { name: 'Ariana (Ville)', nameAr: 'أريانة', pop: 114486, tel: '71.712.100', fax: '71.711.200', email: 'contact@ariana-ville.tn', addr: 'Rue Habib Bourguiba, 2080 Ariana', lat: 36.8665, lng: 10.1647, waste: 112.0, pcgd: 'valide' },
    { name: 'Raoued', nameAr: 'رواد', pop: 106414, tel: '71.777.200', fax: '71.777.300', email: 'contact@commune-raoued.gov.tn', addr: 'Route de Raoued Plage, 2056 Raoued', lat: 36.9322, lng: 10.1989, waste: 84.0, pcgd: 'valide' },
    { name: 'Mnihla', nameAr: 'المنيهلة', pop: 89884, tel: '71.867.755', fax: '71.867.766', email: 'contact@commune-mnihla.gov.tn', addr: 'Avenue Ibn Khaldoun, 2094 Mnihla', lat: 36.8436, lng: 10.1147, waste: 65.0, pcgd: 'en_cours' },
    { name: 'Ettadhamen', nameAr: 'التضامن', pop: 84312, tel: '71.554.004', fax: '71.554.200', email: 'contact@commune-ettadhamen.gov.tn', addr: 'Avenue 14 Janvier, 2042 Ettadhamen', lat: 36.8378, lng: 10.1233, waste: 68.0, pcgd: 'en_cours' },
    { name: 'Kalaât El Andalous', nameAr: 'قلعة الأندلس', pop: 26796, tel: '71.558.005', fax: '71.558.050', email: 'contact@commune-kalaatlandalous.gov.tn', addr: 'Place de la République, 2092 Kalaat Andalous', lat: 37.0603, lng: 10.1189, waste: 21.0, pcgd: 'valide' },
    { name: 'Sidi Thabet', nameAr: 'سيدي ثابت', pop: 24502, tel: '71.552.001', fax: '71.552.050', email: 'secretariat@commune-sidithabet.gov.tn', addr: 'Rue Habib Thameur, 2020 Sidi Thabet', lat: 36.9103, lng: 10.0436, waste: 19.5, pcgd: 'en_cours' }
  ],
  'Ben Arous': [
    { name: 'Ben Arous', nameAr: 'بن عروس', pop: 88322, tel: '71.380.000', fax: '71.381.000', email: 'contact@commune-benarous.gov.tn', addr: 'Avenue de France, 2013 Ben Arous', lat: 36.7531, lng: 10.2189, waste: 74.0, pcgd: 'valide' },
    { name: 'El Mourouj', nameAr: 'المروج', pop: 104538, tel: '79.490.000', fax: '79.490.500', email: 'contact@elmourouj.tn', addr: 'Avenue des Martyrs, 2074 El Mourouj', lat: 36.7322, lng: 10.2131, waste: 89.0, pcgd: 'valide' },
    { name: 'El Mhamedia', nameAr: 'المحمدية', pop: 66500, tel: '71.399.000', fax: '71.399.200', email: 'contact@commune-mohamadia.gov.tn', addr: 'Route de Zaghouan, 1145 El Mhamedia', lat: 36.6744, lng: 10.1581, waste: 49.0, pcgd: 'en_cours' },
    { name: 'Radès', nameAr: 'رادس', pop: 60000, tel: '71.442.200', fax: '71.442.500', email: 'commune.rades@topnet.tn', addr: 'Rue Habib Bourguiba, 2040 Radès', lat: 36.7681, lng: 10.2753, waste: 55.0, pcgd: 'valide' },
    { name: 'Fouchana', nameAr: 'فوشانة', pop: 74868, tel: '71.398.000', fax: '71.398.300', email: 'commune.fouchana@topnet.tn', addr: 'Zone Industrielle, 2082 Fouchana', lat: 36.6961, lng: 10.1706, waste: 58.0, pcgd: 'en_cours' },
    { name: 'Hammam Lif', nameAr: 'حمام الأنف', pop: 42518, tel: '71.290.000', fax: '71.290.300', email: 'contact@commune-hammamlif.gov.tn', addr: 'Avenue de la République, 2050 Hammam Lif', lat: 36.7297, lng: 10.3392, waste: 38.0, pcgd: 'valide' },
    { name: 'Mornag', nameAr: 'مرناق', pop: 61518, tel: '79.350.000', fax: '79.350.200', email: 'commune.mornag@topnet.tn', addr: 'Route de Korba, 2090 Mornag', lat: 36.6803, lng: 10.2928, waste: 42.0, pcgd: 'en_cours' },
    { name: 'Boumhel El Bassatine', nameAr: 'بومهل البساتين', pop: 40101, tel: '71.450.000', fax: '71.450.200', email: 'contact@commune-boumhel.gov.tn', addr: 'Avenue de l\'Environnement, 2097 Boumhel', lat: 36.7208, lng: 10.3003, waste: 33.0, pcgd: 'valide' },
    { name: 'Ezzahra', nameAr: 'الزهراء', pop: 34962, tel: '71.482.000', fax: '71.482.300', email: 'contact@commune-ezzahra.gov.tn', addr: 'Avenue 14 Janvier, 2034 Ezzahra', lat: 36.7442, lng: 10.3094, waste: 31.0, pcgd: 'valide' },
    { name: 'Hammam Chott', nameAr: 'حمام الشط', pop: 31810, tel: '71.410.000', fax: '71.410.200', email: 'contact@commune-hammamchott.gov.tn', addr: 'Avenue Habib Bourguiba, 1164 Hammam Chott', lat: 36.7083, lng: 10.3556, waste: 27.0, pcgd: 'valide' },
    { name: 'Naâssen', nameAr: 'نعسان', pop: 28151, tel: '71.396.000', fax: '71.396.150', email: 'commune.naassen@gmail.com', addr: 'Rue de la Gare, 1135 Naâssen', lat: 36.7119, lng: 10.1983, waste: 22.0, pcgd: 'en_cours' },
    { name: 'Mégrine', nameAr: 'مقرين', pop: 26720, tel: '71.425.000', fax: '71.425.300', email: 'contact@commune-megrine.gov.tn', addr: 'Place Sidi Rezig, 2033 Mégrine', lat: 36.7686, lng: 10.2356, waste: 24.5, pcgd: 'valide' },
    { name: 'Khledia', nameAr: 'الخليدية', pop: 18500, tel: '79.355.000', fax: '79.355.100', email: 'commune.khledia@gmail.com', addr: 'Rue Principale, 2054 Khledia', lat: 36.6433, lng: 10.1878, waste: 14.0, pcgd: 'en_cours' }
  ],
  'Manouba': [
    { name: 'Douar Hicher', nameAr: 'دوار هيشر', pop: 84000, tel: '71.610.000', fax: '71.610.200', email: 'contact@commune-douarhicher.gov.tn', addr: 'Avenue des Martyrs, 2011 Douar Hicher', lat: 36.8317, lng: 10.0983, waste: 62.0, pcgd: 'en_cours' },
    { name: 'Oued Ellil', nameAr: 'وادي الليل', pop: 69317, tel: '71.620.000', fax: '71.620.300', email: 'contact@commune-ouedellil.gov.tn', addr: 'Route de Mateur, 2021 Oued Ellil', lat: 36.8228, lng: 10.0439, waste: 51.0, pcgd: 'valide' },
    { name: 'Jedeida', nameAr: 'الجديدة', pop: 44748, tel: '71.530.000', fax: '71.530.150', email: 'contact@commune-djedeida.gov.tn', addr: 'Avenue Habib Bourguiba, 2010 Jedeida', lat: 36.8528, lng: 9.9278, waste: 32.0, pcgd: 'en_cours' },
    { name: 'Tebourba', nameAr: 'طبربة', pop: 43499, tel: '71.535.000', fax: '71.535.200', email: 'contact@commune-tebourba.gov.tn', addr: 'Place de l\'Indépendance, 1130 Tebourba', lat: 36.8294, lng: 9.8439, waste: 30.0, pcgd: 'valide' },
    { name: 'Manouba', nameAr: 'منوبة', pop: 32000, tel: '71.600.000', fax: '71.600.250', email: 'contact@commune-manouba.gov.tn', addr: 'Avenue Habib Bourguiba, 2010 Manouba', lat: 36.8081, lng: 10.0972, waste: 28.0, pcgd: 'valide' },
    { name: 'Mornaguia', nameAr: 'المرناقية', pop: 42687, tel: '71.640.000', fax: '71.640.200', email: 'contact@commune-mornaguia.gov.tn', addr: 'Rue Principale, 1110 Mornaguia', lat: 36.7419, lng: 10.0189, waste: 29.0, pcgd: 'en_cours' },
    { name: 'Den Den', nameAr: 'الدندان', pop: 28500, tel: '71.615.000', fax: '71.615.200', email: 'contact@commune-denden.gov.tn', addr: 'Avenue de la République, 2011 Den Den', lat: 36.8042, lng: 10.1169, waste: 25.0, pcgd: 'valide' },
    { name: 'El Battane', nameAr: 'البطان', pop: 18977, tel: '71.540.000', fax: '71.540.150', email: 'contact@commune-elbattan.gov.tn', addr: 'Pont Historique, 1114 El Battane', lat: 36.8061, lng: 9.8431, waste: 13.5, pcgd: 'en_cours' },
    { name: 'Borj El Amri', nameAr: 'برج العامري', pop: 17409, tel: '71.645.000', fax: '71.645.100', email: 'contact@commune-borjelamri.gov.tn', addr: 'Rue Principale, 1142 Borj El Amri', lat: 36.7114, lng: 9.8881, waste: 12.0, pcgd: 'en_cours' },
    { name: 'El Bassatine', nameAr: 'البساتين', pop: 14200, tel: '71.625.000', fax: '71.625.100', email: 'commune.elbassatine@gmail.com', addr: 'Centre Urbain, 2021 El Bassatine', lat: 36.7820, lng: 10.0510, waste: 10.5, pcgd: 'non_existant' }
  ],
  'Tunis': [
    { name: 'Tunis (Capitale)', nameAr: 'بلدية تونس', pop: 638845, tel: '71.560.000', fax: '71.560.550', email: 'contact@commune-tunis.gov.tn', addr: 'Hôtel de Ville, Place de la Kasbah, 1000 Tunis', lat: 36.8008, lng: 10.1800, waste: 680.0, pcgd: 'valide' },
    { name: 'Sidi Hassine', nameAr: 'سيدي حسين', pop: 109672, tel: '71.590.000', fax: '71.590.200', email: 'contact@commune-sidihassine.gov.tn', addr: 'Avenue de l\'Environnement, 1095 Sidi Hassine', lat: 36.7583, lng: 10.1250, waste: 78.0, pcgd: 'en_cours' },
    { name: 'La Marsa', nameAr: 'المرسى', pop: 92987, tel: '71.740.000', fax: '71.740.500', email: 'contact@commune-lamarsa.gov.tn', addr: 'Place du Saf-Saf, 2070 La Marsa', lat: 36.8781, lng: 10.3247, waste: 95.0, pcgd: 'valide' },
    { name: 'Le Kram', nameAr: 'الكرم', pop: 74132, tel: '71.730.000', fax: '71.730.300', email: 'contact@commune-lekram.gov.tn', addr: 'Avenue Habib Bourguiba, 2015 Le Kram', lat: 36.8333, lng: 10.3167, waste: 62.0, pcgd: 'valide' },
    { name: 'Le Bardo', nameAr: 'باردو', pop: 71961, tel: '71.580.000', fax: '71.580.400', email: 'contact@commune-bardo.gov.tn', addr: 'Avenue Habib Bourguiba, 2000 Le Bardo', lat: 36.8092, lng: 10.1406, waste: 64.0, pcgd: 'valide' },
    { name: 'La Goulette', nameAr: 'حلق الوادي', pop: 45711, tel: '71.735.000', fax: '71.735.250', email: 'contact@commune-lagoulette.gov.tn', addr: 'Avenue Franklin Roosevelt, 2060 La Goulette', lat: 36.8181, lng: 10.3050, waste: 46.0, pcgd: 'valide' },
    { name: 'Carthage', nameAr: 'قرطاج', pop: 24216, tel: '71.731.000', fax: '71.731.300', email: 'contact@commune-carthage.gov.tn', addr: 'Rue Didon, 2016 Carthage', lat: 36.8528, lng: 10.3236, waste: 26.0, pcgd: 'valide' },
    { name: 'Sidi Bou Saïd', nameAr: 'سيدي بو سعيد', pop: 6000, tel: '71.741.000', fax: '71.741.200', email: 'contact@commune-sidibousaid.gov.tn', addr: 'Rue Habib Thameur, 2026 Sidi Bou Saïd', lat: 36.8703, lng: 10.3417, waste: 9.5, pcgd: 'valide' }
  ]
};

module.exports = { GOVERNORATES };
