#!/usr/bin/env python3
"""Valeurs attendues du rejeu du coût complet (lot 17.5).

Script INDÉPENDANT : il ne lit que le fichier « agrégats de PCGD » donné en
argument et la méthode du skill pcgd-cout-complet-methodologie —
Z = (A + B) + (C + D). Il ne lit jamais le code de l'API
(services/coutComplet.ts) : c'est ce qui en fait un témoin.

Règles de la méthode, telles que le lot les fixe :
  - A : personnel, engins, transfert et mise en décharge (et tout autre poste
        direct déclaré) ; B : amortissements ; C : parc municipal ;
        D : siège et direction du service. Un poste absent n'est pas compté :
        il est « non renseigné ».
  - Les chiffres principaux sont retenus ; ceux de « autres_chiffres_du_rapport »
    sont d'autres versions publiées. Des deux totaux indirects, est retenu celui
    qui égale la somme siège + parc + direction.
  - Un ratio publié v avec d décimales couvre [v − 0,5·10^-d ; v + 0,5·10^-d] :
    son dénominateur implicite est l'intervalle [N/(v+½pas) ; N/(v−½pas)].

    python3 cout_complet_attendus.py fichier.json
"""
import json
import sys

POSTES_ATTENDUS = ['personnel', 'charges_patronales', 'engins', 'transfert_decharge', 'redevance_anged',
                   'sous_traitance', 'interets_dette', 'assurance', 'habillement', 'taxes_circulation',
                   'amortissement', 'qp_parc']
FLUX_ATTENDUS = ['dma', 'demolition', 'balayage']
ABSENTS = [('cpscl', 'interets_dette'), ('intérêts de la dette', 'interets_dette'),
           ('charges patronales', 'charges_patronales'), ('redevance anged', 'redevance_anged'),
           ('sous-traitance', 'sous_traitance'), ('assurance', 'assurance'), ('habillement', 'habillement'),
           ('taxe de circulation', 'taxes_circulation'), ('taxes de circulation', 'taxes_circulation')]


def pas(v):
    """Le pas d'arrondi d'un nombre tel qu'il est écrit : 155 → 1 ; 11.7 → 0.1."""
    texte = repr(float(v))
    if texte.endswith('.0'):
        return 1.0
    return 10 ** -len(texte.split('.')[1])


def r(v, d):
    return None if v is None else round(v + 0.0, d)


def calculer(f):
    ex = f['_meta']['exercice']
    dir_ = f[f'charges_directes_collecte_{ex}']
    ind = f[f'charges_indirectes_collecte_{ex}']
    pub = f['totaux_et_ratios_publies']
    autres = dir_.get('autres_chiffres_du_rapport', {})
    pese = f['tonnages']['annuel'].get(str(ex))
    commune = f['commune']
    population = next((v for k, v in commune.items() if k.startswith('population')), None)
    menages = commune.get('menages')

    postes = {
        'personnel': dir_.get('frais_de_personnel'),
        'engins': dir_.get('depenses_engins_carburant_entretien'),
        'transfert_decharge': dir_.get('transfert_et_mise_en_decharge'),
        'amortissement': dir_.get('amortissements_materiel_collecte_et_precollecte'),
        'qp_parc': ind.get('parc_municipal'),
        'qp_siege': ind.get('siege'),
        'qp_direction': ind.get('direction_proprete'),
    }
    postes = {k: v for k, v in postes.items() if v is not None}
    absents = set()
    for libelle in dir_.get('postes_absents_du_rapport_a_la_lecture', []):
        bas = libelle.lower()
        for motif, code in ABSENTS:
            if motif in bas and code not in postes:
                absents.add(code)

    bloc = {'A': ['personnel', 'engins', 'transfert_decharge', 'charges_patronales', 'redevance_anged', 'sous_traitance',
                  'interets_dette', 'assurance', 'habillement', 'taxes_circulation', 'autres_directes'],
            'B': ['amortissement'], 'C': ['qp_parc'], 'D': ['qp_siege', 'qp_direction', 'qp_administration']}
    blocs = {}
    for b, codes in bloc.items():
        presents = [postes[c] for c in codes if c in postes]
        blocs[b] = r(sum(presents), 3) if presents else None
    X = r(blocs['A'] + blocs['B'], 3)
    Y = r(blocs['C'] + blocs['D'], 3)
    Z = r(X + Y, 3)

    somme_ind = sum(ind[k] for k in ('siege', 'parc_municipal', 'direction_proprete'))
    totaux_ind = {k: v for k, v in ind.items() if k.startswith('total') and isinstance(v, (int, float))}
    total_indirect = next((v for v in totaux_ind.values() if v == somme_ind), None)
    variantes_ind = [v for v in totaux_ind.values() if v != total_indirect]
    publie = {'A': dir_.get('sous_total_hors_amortissements'), 'X': dir_.get('total_charges_directes'),
              'Y': total_indirect, 'Z': pub.get('cout_total')}

    numerateurs = {
        'cout_par_tonne': pub.get('cout_total'), 'cout_direct_par_tonne': publie['X'],
        'cout_indirect_par_tonne': total_indirect, 'personnel_par_tonne': postes.get('personnel'),
        'engins_par_tonne': postes.get('engins'), 'transfert_par_tonne': postes.get('transfert_decharge'),
        'amortissement_par_tonne': postes.get('amortissement'),
        'maintenance_par_tonne': autres.get('cout_maintenance_parc_total'),
        'gasoil_par_tonne': autres.get('carburant_gasoil'),
        'cout_par_jour': pub.get('cout_total'), 'cout_direct_par_jour': publie['X'],
        'cout_indirect_par_jour': total_indirect, 'cout_par_habitant': pub.get('cout_total'),
        'cout_par_menage': pub.get('cout_total'), 'cout_par_habitat': pub.get('cout_total'),
    }
    declares = {'cout_par_habitant': population, 'cout_par_menage': menages}
    ratios = {}
    for code, N in numerateurs.items():
        v = pub.get(code)
        if not isinstance(v, (int, float)) or v <= 0:
            continue
        p = pas(v)
        intervalle = None if N is None else {'min': r(N / (v + p / 2), 2), 'max': r(N / (v - p / 2), 2)}
        ref = pese if code.endswith('par_tonne') else declares.get(code)
        compatible = None if intervalle is None or ref is None else intervalle['min'] <= ref <= intervalle['max']
        ratios[code] = {'valeur': v, 'pas': p, 'intervalle': intervalle, 'compatible': compatible}

    # Les écarts.
    e = {}
    c = ratios.get('cout_par_tonne')
    e['E1'] = 'non_verifiable' if not c or c['compatible'] is None else ('aucun' if c['compatible'] else 'constate')
    tonne = [x for k, x in ratios.items() if k.endswith('par_tonne') and x['intervalle']]
    if len(tonne) < 2:
        e['E2'] = 'non_verifiable'
    else:
        e['E2'] = 'aucun' if max(x['intervalle']['min'] for x in tonne) <= min(x['intervalle']['max'] for x in tonne) else 'constate'
    recoupements = []
    for nom, attendu, obtenu in (('A_sous_total', blocs['A'], publie['A']), ('X_total_direct', X, publie['X']),
                                  ('Y_total_indirect', Y, publie['Y']), ('Z_cout_total', Z, publie['Z'])):
        if attendu is not None and obtenu is not None and abs(attendu - obtenu) >= 0.5:
            recoupements.append(nom)
    for v in variantes_ind:
        if abs(publie['Z'] - (publie['X'] + v)) >= 0.5:
            recoupements.append('direct_plus_indirect_variante')
    e['E3'] = 'constate' if variantes_ind or recoupements else 'aucun'
    versions = sorted(code for code, cle in (('personnel', 'frais_de_personnel_tableau_III_5_2_2'),
                                             ('engins', 'entretien_engins_tableau_III_5_2_2')) if cle in autres)
    e['E4'] = 'constate' if versions else 'aucun'
    par_tete = [ratios[k] for k in ('cout_par_habitant', 'cout_par_menage', 'cout_par_habitat') if k in ratios]
    if not par_tete:
        e['E5'] = 'non_verifiable'
    elif any(x['compatible'] is False for x in par_tete):
        e['E5'] = 'constate'
    elif any(x['compatible'] is None for x in par_tete):
        e['E5'] = 'non_verifiable'
    else:
        e['E5'] = 'aucun'
    notes_e6 = [x for x in f.get('ecarts_constates_a_la_lecture', []) if x.get('id') == 'E6']
    e['E6'] = 'declare' if notes_e6 else 'aucun'
    non_renseignes = [p for p in POSTES_ATTENDUS if p not in postes]
    if not any(k in postes for k in ('qp_siege', 'qp_direction', 'qp_administration')):
        non_renseignes.append('qp_administration')
    e['E7'] = 'constate' if non_renseignes else 'aucun'
    campagnes = f.get(f'campagnes_de_proprete_{ex}')
    flux = ['campagnes_proprete'] if campagnes and isinstance(campagnes.get('total_publie'), (int, float)) else []
    manquants = [x for x in FLUX_ATTENDUS if x not in flux]
    e['E8'] = 'constate' if manquants else 'aucun'

    return {
        'blocs': blocs, 'X': X, 'Y': Y, 'Z': Z,
        'publie': publie,
        'cout_par_tonne_pese': r(Z / pese, 2) if pese else None,
        'ratio_sur_tonnage_pese': r(Z / pese, 1) if pese else None,
        'ratios': ratios,
        'ecarts': e,
        'recoupements': recoupements,
        'versions_postes': versions,
        'non_renseignes': non_renseignes,
        'declares_absents': sorted(absents),
        'flux_manquants': manquants,
        'notes_e6': len(notes_e6),
    }


if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8') as fichier:
        print(json.dumps(calculer(json.load(fichier)), ensure_ascii=False))
