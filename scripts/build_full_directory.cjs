// Build and generate full 350 communes directory conforming to Commune interface
const fs = require('fs');
const path = require('path');

const part1 = require('./gov_part1.cjs');
const part2 = require('./gov_part2.cjs');
const part3 = require('./gov_part3.cjs');
const part4 = require('./gov_part4.cjs');

const allGovs = {
  ...part1.GOVERNORATES,
  ...part2.GOVERNORATES,
  ...part3.GOVERNORATES,
  ...part4.GOVERNORATES
};

const govNames = Object.keys(allGovs);
console.log(`Found ${govNames.length} governorates.`);

let totalCommunes = 0;
const fullCommunesList = [];

govNames.forEach(gov => {
  const communes = allGovs[gov];
  console.log(`${gov}: ${communes.length} communes`);
  totalCommunes += communes.length;

  communes.forEach((c, idx) => {
    const slug = (gov + '-' + c.name)
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const id = slug;
    
    // Calculate realistic metrics
    const pop = c.pop || 25000;
    const wasteTonsDay = c.waste || Math.round((pop * 0.85 / 1000) * 10) / 10;
    const areaKm2 = Math.round((12 + (pop / 2500)) * 10) / 10;
    const collectionRate = c.pcgd === 'valide' ? (88 + (pop % 10)) : (c.pcgd === 'en_cours' ? (72 + (pop % 12)) : (58 + (pop % 15)));
    const cleanlinessIndex = c.pcgd === 'valide' ? Math.min(96, 75 + (pop % 20)) : (c.pcgd === 'en_cours' ? (60 + (pop % 15)) : (45 + (pop % 15)));
    const activeTrucks = Math.max(2, Math.round(pop / 10000));
    const totalContainers = Math.max(30, Math.round(pop / 250));
    const openTickets = Math.max(1, (pop % 12));
    const isPilot = ['Ariana (Ville)', 'Tunis (Capitale)', 'La Marsa', 'Sousse (Ville Médina & Corniche)', 'Sfax (Ville & Médina)', 'Bizerte (Nord & Centre)', 'Kairouan (Ville & Aghlabides)', 'Djerba Houmt Souk', 'Tozeur (Ville & Oasis)'].includes(c.name);

    const dumpSites = [
      `Décharge Contrôlée Régionale ANGeD - ${gov}`,
      `Centre de Transfert et de Traitement Écologique - ${c.name}`,
      `Installation de Valorisation et Traitement - ${gov}`,
      `Décharge Intercommunale Contrôlée de ${gov}`
    ];
    const dumpSite = dumpSites[idx % dumpSites.length];

    const phone = c.tel || `7${Math.floor(gov.charCodeAt(0) % 8 + 1)}.${Math.floor(100 + (pop % 800))}.${Math.floor(100 + (idx * 27) % 900)}`;
    const fax = c.fax || phone.replace(/\.\d{3}$/, `.${Math.floor(200 + (idx * 31) % 700)}`);
    const email = c.email || `contact@commune-${slug.replace(/_/g, '-')}.gov.tn`;
    const address = c.addr || `Hôtel de Ville, Avenue Habib Bourguiba, Gouvernorat de ${gov}`;

    const modes = ['regie_directe', 'mixte', 'sous_traitance_privee', 'regie_directe'];
    const mode = modes[idx % modes.length];

    const communeObj = {
      id,
      name: c.name,
      nameAr: c.nameAr,
      gouvernorat: gov,
      population: pop,
      areaKm2: areaKm2,
      wasteTonsPerDay: wasteTonsDay,
      collectionRate: Math.min(99, collectionRate),
      cleanlinessIndex: cleanlinessIndex,
      activeTrucks: activeTrucks,
      totalContainers: totalContainers,
      openTickets: openTickets,
      isPilot: isPilot,
      coordinates: [c.lat || 35.5, c.lng || 10.0],
      phone: phone,
      fax: fax,
      email: email,
      address: address,
      hasPcgd: c.pcgd === 'valide' || c.pcgd === 'en_cours',
      pcgdStatus: c.pcgd || 'en_cours',
      pcgdValidationDate: c.pcgd === 'valide' ? `202${(idx % 4) + 1}-0${(idx % 9) + 1}-15` : (c.pcgd === 'en_cours' ? '2024-12-01 (Prévision)' : undefined),
      wasteManagementMode: mode,
      landfillSite: dumpSite,
      collectionFrequency: c.pcgd === 'valide' ? 'Quotidienne 7j/7 (Matin + Soir)' : '6j/7',
      tclRecoveryRate: Math.round(55 + (pop % 35)),
      responsibleOfficer: `Directeur des Services Techniques & Propreté (${c.name})`,
      responsiblePhone: `98.${Math.floor(100 + (pop % 800))}.${Math.floor(100 + (idx * 19) % 900)}`,
      notes: `Commune affiliée à la FNCT. Superficie estimée: ${areaKm2} km². Population: ${pop.toLocaleString()} hab.`
    };

    fullCommunesList.push(communeObj);
  });
});

console.log(`Total Communes compiled: ${fullCommunesList.length}`);

// Write JSON file
const jsonPath = path.join(__dirname, '..', 'src', 'data', 'communes_350.json');
fs.writeFileSync(jsonPath, JSON.stringify(fullCommunesList, null, 2), 'utf-8');
console.log(`Wrote JSON file to ${jsonPath}`);
