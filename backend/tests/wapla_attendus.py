#!/usr/bin/env python3
# =============================================================================
# Témoin indépendant du moteur WaPla, mode fidèle (couche WaPla, lot W1a).
#
# Port Python du moteur de l'outil UNIDO WaPla v1.5 (TU Wien, 2021), écrit à
# partir de la lecture de `server.r` (docs/specs_metier/sources/wapla/
# wapla-moteur-reference.md) — jamais à partir de backend/src/wapla/moteur.ts.
# Il a produit les vecteurs de référence de l'annexe (§ 8) ; la campagne
# `wapla-moteur` lui confronte le moteur de l'application, jeu par jeu.
#
# Entrée standard : une liste JSON de jeux d'entrées (seulement ce qui change
# par rapport aux valeurs par défaut de l'outil). Sortie : une liste de
# résultats, mêmes clés que le moteur ; {"erreur": code} quand l'outil
# d'origine s'arrêterait.
# =============================================================================
import json
import sys

FL = {1: (3, 7), 2: (7, 8), 3: (3, 8), 4: (6, 9), 5: (1, 2), 6: (1, 3), 7: (2, 5), 8: (5, 11), 9: (5, 10), 10: (9, 10),
      11: (6, 13), 12: (5, 6), 13: (9, 12), 14: (8, 12), 15: (7, 12), 16: (6, 12), 17: (2, 6), 18: (5, 9), 19: (2, 9),
      20: (1, 10), 21: (10, 10), 22: (11, 12), 23: (11, 9), 24: (10, 13), 25: (9, 14), 26: (8, 14), 27: (2, 11),
      28: (0, 1), 29: (0, 0), 30: (9, 15), 31: (8, 15), 32: (15, 12), 33: (15, 9), 34: (15, 8), 35: (8, 10), 36: (8, 9),
      37: (3, 13)}
CODES = {1: 'WoB', 2: 'BR3', 3: 'D2', 4: 'CR', 5: 'W1', 6: 'W3', 7: 'WR', 8: 'RDF', 9: 'Re1', 10: 'Re2', 11: 'CMP',
         12: 'Org', 13: 'LGE1', 14: 'LGE2', 15: 'OBE', 16: 'CE', 17: 'WC', 18: 'MR', 19: 'D1', 20: 'W2', 21: 'Re3',
         22: 'OFG', 23: 'IRes', 24: 'ReT', 25: 'LS1', 26: 'LS2', 27: 'WI', 28: 'WG', 30: 'WB1', 31: 'WB2', 32: 'EFLD',
         33: 'BR1', 34: 'BR2', 35: 'Re4', 36: 'CU', 37: 'LW'}
TC = [(1, 1, 28, 5), (2, 1, 28, 20), (3, 2, 5, 19), (4, 2, 5, 17), (5, 2, 5, 7), (6, 3, 6, 3), (7, 3, 6, 1), (8, 4, 20, 21),
      (9, 5, 29, 8), (10, 5, 29, 9), (11, 5, 29, 18), (12, 6, 29, 11), (13, 6, 29, 16), (14, 7, 1, 2), (15, 8, 29, 31),
      (16, 8, 29, 14), (17, 9, 29, 30), (18, 9, 29, 10), (19, 9, 29, 13), (20, 11, 29, 22), (21, 1, 28, 6), (22, 2, 5, 27),
      (23, 7, 1, 15), (24, 6, 29, 4), (25, 5, 29, 12), (26, 11, 29, 23), (27, 8, 29, 26), (28, 9, 29, 25), (29, 10, 29, 24),
      (30, 15, 30, 33), (31, 15, 31, 34), (32, 15, 29, 32), (33, 8, 29, 35), (34, 8, 29, 36), (35, 3, 6, 37)]
DEF = dict(waste_in=1000, mrf=True, compostage=True, incineration=True,
           tc_1=.46, tc_2=.14, tc_4=0, tc_5=0, tc_6=.5, tc_9=.2, tc_10=.05, tc_12=.15, tc_14=.2, tc_15=.4, tc_16=.35,
           tc_17=.25, tc_18=.01, tc_19=.3, tc_22=0, tc_24=.14, tc_25=.35, tc_26=.2, tc_33=.01, tc_34=0, tc_35=0,
           pop_1=.5, pop_2=0, pop_3=1, pop_7=0, pop_8=1, pop_9=1, pop_10=False, pop_11=40, pop_12=1, pop_13=300, pop_14=10,
           ghg_1=1000, ghg_2=.056, ghg_3=.1, ghg_4=1.0, ghg_5=.1, ghg_6=.6, ghg_7=.35, ghg_8=.2, ghg_9=.25, ghg_10=False,
           ghg_11=.1, ghg_14=.1, ghg_15=.6, ghg_16=.8, ghg_17=False, ghg_18=.1, ghg_19=0, ATY=None, APY=None,
           cost_1=None, cost_12=None, cost_13=1, cost_14=0, cost_2=None, cost_18=None, cost_19=1, cost_20=0,
           cost_3=None, cost_15=None, cost_16=1, cost_17=0, cost_4=None, cost_5=None, cost_25=None, cost_26=1, cost_27=0,
           cost_10=None, cost_21=None, cost_22=1, cost_23=0, cost_24=None, cost_11=None,
           cost_6=None, cost_7=None, cost_8=None, cost_9=None)


class ArretOutil(Exception):
    pass


def signif2(x):
    return 0.0 if x == 0 else float(f'{x:.2g}')


def somme_na_rm(*t):
    # R : sum(..., na.rm = TRUE) — NA et NaN ne comptent pas.
    return sum(x for x in t if x is not None and x == x)


def annuite(p, n, taux):
    if p is None:
        return None
    i = taux / 100
    if i == 0:
        return p / n
    f = (1 + i) ** n
    return p * f * i / (f - 1)


def quotient(a, b):
    return None if a is None or not (b > 0) else a / b


def run(**kw):
    I = dict(DEF)
    I.update(kw)
    used = {1, 2, 3, 7, 8, 9, 10, 12, 13, 14, 15}
    if I['mrf']:
        used.add(5)
    if I['compostage']:
        used.add(6)
    if I['incineration']:
        used.add(11)
    flu = {k: v for k, v in FL.items() if (v[0] in used | {0}) and (v[1] in used | {0})}
    val = {k: None for k in flu}
    val[28] = I['waste_in']
    val[21] = 0.0
    t = I
    tc30 = 0.3
    raw = {1: t['tc_1'], 2: t['tc_2'], 3: None, 4: t['tc_4'], 5: t['tc_5'], 6: t['tc_6'], 7: None, 8: None, 9: t['tc_9'],
           10: t['tc_10'], 11: None, 12: t['tc_12'], 13: None, 14: t['tc_14'], 15: t['tc_15'],
           16: (1 - t['tc_15'] - t['tc_33'] - t['tc_34']) * t['tc_16'], 17: t['tc_17'], 18: t['tc_18'],
           19: (1 - t['tc_17'] - t['tc_18']) * t['tc_19'], 20: None, 21: None, 22: t['tc_22'], 23: None, 24: t['tc_24'],
           25: t['tc_25'], 26: t['tc_26'], 27: None, 28: None, 29: None, 30: tc30, 31: tc30, 32: 1 - tc30,
           33: t['tc_33'], 34: t['tc_34'], 35: t['tc_35']}
    tcs = [(i, p, s, g, raw[i]) for (i, p, s, g) in TC if s in flu and g in flu]
    res = {}
    for p in range(1, 15):
        rows = [r for r in tcs if r[1] == p]
        s = sum(r[4] for r in rows if r[4] is not None)
        for r in rows:
            res[r[0]] = (r[1], r[3], r[4] if r[4] is not None else 1 - s)
    for r in tcs:
        if r[1] == 15:
            res[r[0]] = (15, r[3], r[4])
    if any(v < -1e-12 for (_, _, v) in res.values()):
        raise ArretOutil('WAPLA_COEFFICIENTS')
    for _ in range(5):
        for p in range(1, 17):
            ins = [val[k] for k, (s, g) in flu.items() if g == p and s != 15]
            y = None if any(v is None for v in ins) else sum(ins)
            for (pp, tg, v) in res.values():
                if pp == p:
                    val[tg] = None if y is None else v * y
    tcv = {r[1]: r[2] for r in res.values()}
    val[33] = val[30] * tcv[33]
    val[34] = val[31] * tcv[34]
    val[32] = val[31] * tcv[32] + val[30] * tcv[32]

    def f(k):
        return val.get(k, 0.0) or 0.0

    out = {'flux': {CODES[k]: (val[k] if k in val else None) for k in CODES}}

    # uPOPs — avec le défaut de l'outil : la constante 36 au lieu du flux CU.
    SHWLF = 1 - I['pop_2'] - I['pop_3']
    SHWID = 1 - I['pop_7'] - I['pop_8']
    lfin = f(4) + f(18) + f(19) + f(23) + f(36)
    ifdin = f(2) + f(3)
    EFIAIR = [3500, 350, 30, 0.5][I['pop_9'] - 1]
    EFIR = [75, 75, 30, 3][I['pop_9'] - 1]
    ck = 1 if I['pop_10'] else 0
    RDF = f(8) if 5 in used else 0
    WI = f(27)
    out['upops'] = dict(
        brulage_air=f(1) * I['pop_11'] / 1000, brulage_sol=f(1) * I['pop_12'] / 1000,
        feux_air=(f(30) + f(31)) * I['pop_13'] / 1000, feux_sol=(f(30) + f(31)) * I['pop_14'] / 1000,
        decharge_eau=(5 * SHWLF + .5 * I['pop_2'] + .05 * I['pop_3']) / 1000 * lfin,
        decharge_residus=(500 * SHWLF + 50 * I['pop_2'] + 5 * I['pop_3']) / 1000 * lfin,
        depotoir_eau=(5 * SHWID + .5 * I['pop_7'] + .05 * I['pop_8']) / 1000 * (ifdin - 36),
        depotoir_residus=(500 * SHWID + 50 * I['pop_7'] + 5 * I['pop_8']) / 1000 * (ifdin - 36),
        incineration_air=(EFIAIR / 1000 * (RDF * (1 - ck) + WI) + 3 / 1000 * RDF * ck) if 11 in used else 0,
        incineration_residus=(EFIR / 1000 * (RDF * (1 - ck) + WI)) if 11 in used else 0,
        compost_produit=(f(11) * (5 * I['pop_1'] + 50 * (1 - I['pop_1'])) / 1000 * 0.65) if 6 in used else 0)

    # Climat, avec son trou (plus de 20 °C et exactement 400 mm).
    A, T = I['APY'], I['ATY']
    if A is None or T is None:
        cl = None
    elif T <= 10 and A <= 400:
        cl = 1
    elif T <= 10 and A > 400:
        cl = 2
    elif 10 < T <= 20 and A <= 400:
        cl = 3
    elif T > 20 and A < 400:
        cl = 4
    elif 10 < T <= 20 and 400 < A <= 1000:
        cl = 5
    elif 10 < T <= 20 and A > 1000:
        cl = 6
    elif T > 20 and 400 < A <= 1000:
        cl = 7
    elif T > 20 and A > 1000:
        cl = 8
    else:
        raise ArretOutil('WAPLA_CLIMAT')
    base = {1: .4, 2: .45, 3: .5, 4: .5, 5: .55, 6: .6, 7: .6, 8: .7}
    xL = {1.0: 1, 0.8: 1.05, 0.4: 1.1}[I['ghg_4']]
    xD = {0.8: 1.05, 0.4: 1.1}[I['ghg_16']]
    DOF_LF = base.get(cl, .7) * xL
    DOF_ID = base[cl] * xD if cl else .7
    out['climat'] = dict(classe=cl, dof_decharge=DOF_LF, dof_depotoir=DOF_ID)

    rdfI = 1 if I['ghg_17'] else 0
    er = 1 if I['ghg_10'] else 0
    Aq = RDF * (1 - rdfI) + WI
    SCM = 1 - I['ghg_7'] - I['ghg_8'] - I['ghg_9']
    ges = dict(
        collecte=I['ghg_1'] * 0.0026,
        incineration=(I['ghg_11'] * 2.5 * (Aq * (1 - er)) + Aq * er * (-0.35) + RDF * rdfI * (-0.55)) if 11 in used else 0,
        brulage=f(1) * I['ghg_3'] * 2.5 * 0.7,
        feux=(f(30) + f(31)) * I['ghg_18'] * 2.5 * 0.7,
        compostage=(f(17) + f(12)) * I['ghg_2'] if 6 in used else 0,
        decharge=I['ghg_4'] * (I['ghg_6'] * .16 + I['ghg_5'] * .4) * .5 * (16 / 12) * 28 * DOF_LF
        * (f(19) + f(18) + f(4) + f(36) - f(10) - f(30)) * (1 - I['ghg_19'] / 100),
        depotoir=I['ghg_16'] * (I['ghg_15'] * .16 + I['ghg_14'] * .4) * .5 * (16 / 12) * 28 * DOF_ID
        * (f(3) - f(35) - f(31) - f(36)),
        recyclage=(f(9) + f(10) + f(20) + f(21) + f(35))
        * (I['ghg_7'] * -.15 + I['ghg_8'] * -.3 + I['ghg_9'] * -1.5 + SCM * -1.8))
    # TAGHG (server.r:2358) oublie les feux ; le tableau affiché les compte, après arrondis.
    ges['total_interne'] = sum(v for k, v in ges.items() if k != 'feux')
    ges['total_affiche'] = signif2(sum(signif2(ges[k]) for k in
                                       ['collecte', 'decharge', 'depotoir', 'brulage', 'feux', 'recyclage', 'compostage', 'incineration']))
    out['ges'] = ges

    # Coûts (référence § 5).
    c = I
    aic_col = annuite(c['cost_12'], c['cost_13'], c['cost_14'])
    aic_inc = annuite(c['cost_21'], c['cost_22'], c['cost_23']) if 11 in used else 0
    aic_cp = annuite(c['cost_15'], c['cost_16'], c['cost_17']) if 6 in used else 0
    aic_lf = annuite(c['cost_25'], c['cost_26'], c['cost_27'])
    aic_mrf = annuite(c['cost_18'], c['cost_19'], c['cost_20']) if 5 in used else float('nan')
    prix = [c['cost_6'], c['cost_7'], c['cost_8'], c['cost_9']]
    den_lf = f(4) + f(18) + f(19) + f(23)
    proc = dict(
        collecte=dict(annuite=aic_col, exploitation=c['cost_1'], total=somme_na_rm(aic_col, c['cost_1']),
                      specifique_investissement=quotient(c['cost_12'], f(5)), specifique_exploitation=quotient(c['cost_1'], f(5))),
        incineration=dict(annuite=aic_inc, exploitation=c['cost_10'],
                          total=somme_na_rm(aic_inc, c['cost_10'], None if c['cost_24'] is None else -c['cost_24']),
                          specifique_investissement=quotient(c['cost_21'], RDF + WI), specifique_exploitation=quotient(c['cost_10'], RDF + WI)),
        compostage=dict(annuite=aic_cp, exploitation=c['cost_3'],
                        total=somme_na_rm(aic_cp, c['cost_3'], None if c['cost_4'] is None else -f(11) * c['cost_4']),
                        specifique_investissement=quotient(c['cost_15'], f(12) + f(17)), specifique_exploitation=quotient(c['cost_3'], f(12) + f(17))),
        decharge=dict(annuite=aic_lf, exploitation=c['cost_5'],
                      total=0 if aic_lf is None or c['cost_5'] is None else aic_lf + c['cost_5'],
                      specifique_investissement=quotient(c['cost_25'], den_lf), specifique_exploitation=quotient(c['cost_5'], den_lf)),
        mrf=dict(annuite=None if aic_mrf is not None and aic_mrf != aic_mrf else aic_mrf, exploitation=c['cost_2'],
                 total=somme_na_rm(c['cost_2'], aic_mrf),
                 specifique_investissement=quotient(c['cost_18'], f(7)), specifique_exploitation=quotient(c['cost_2'], f(7))),
        depotoir=dict(annuite=None, exploitation=c['cost_11'], total=c['cost_11'],
                      specifique_investissement=None, specifique_exploitation=quotient(c['cost_11'], f(3))),
        brulage=dict(annuite=None, exploitation=None, total=0, specifique_investissement=None, specifique_exploitation=None),
        recyclage=dict(annuite=None, exploitation=None,
                       total=None if any(p is None for p in prix) else
                       f(24) * (I['ghg_7'] * -prix[0] + I['ghg_8'] * -prix[1] + I['ghg_9'] * -prix[2] + SCM * -prix[3]),
                       specifique_investissement=None, specifique_exploitation=None))
    out['couts'] = dict(procedes=proc, total_affiche=somme_na_rm(*[p['total'] for p in proc.values()]))
    return out


if __name__ == '__main__':
    sortie = []
    for jeu in json.load(sys.stdin):
        try:
            sortie.append(run(**jeu))
        except ArretOutil as arret:
            sortie.append({'erreur': str(arret)})
    json.dump(sortie, sys.stdout)
