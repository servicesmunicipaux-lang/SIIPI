#!/usr/bin/env bash
# =============================================================================
# Couche WaPla, lot W1a — le moteur, en mode fidèle.
# docs/specs_metier/SPEC_wapla_couche_planification.md § 4 et § 7.
#
# Le moteur est une fonction pure : ni base, ni API. La campagne l'appelle en
# ligne de commande (npm run wapla:calculer) et lui confronte un témoin
# indépendant (tests/wapla_attendus.py), port Python écrit à partir de la
# lecture du code de l'outil d'origine — jamais du moteur de l'application.
#
# Elle commence par ce que le moteur REFUSE : une entrée hors des bornes de
# l'outil, une clé inconnue, des coefficients dont la somme dépasse 1, une
# durée d'amortissement nulle, un coût pour un procédé inactif.
#
# Puis les vecteurs de référence (annexe § 8), le témoin sur des jeux fixes et
# sur 200 jeux tirés au hasard, et les défauts de l'outil, reproduits exprès :
# le mode fidèle doit les avoir tous (le mode corrigé, au lot W1b, les ôtera).
#
#   docker compose exec -T api npm run test:wapla-moteur
# =============================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
pass=0; fail=0
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

chk() {
  if [ "$2" = "$3" ]; then printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1))
  else printf '  \033[31m✗\033[0m %s  (attendu %s, obtenu %s)\n' "$1" "$2" "$3"; fail=$((fail+1)); fi
}
# moteur '<liste JSON de jeux>' : les résultats du moteur de l'application dans $T/m.json.
moteur() { printf '%s' "$1" | npx tsx src/wapla/calculer.ts > "$T/m.json" 2> "$T/m.err" || cat "$T/m.err" >&2; }
temoin() { printf '%s' "$1" | python3 tests/wapla_attendus.py > "$T/t.json"; }
# m '<expression python sur d, la liste des résultats du moteur>'
m() { python3 -c "import json;d=json.load(open('$T/m.json'));print($1)" 2>/dev/null || echo erreur; }
erreur() { moteur "[$1]"; m "d[0].get('erreur', 'calculé')"; }

[ -f src/wapla/moteur.ts ] && [ -f tests/wapla_attendus.py ] || { echo "Moteur ou témoin absent." >&2; exit 1; }

# -----------------------------------------------------------------------------
echo
echo "1. Ce que le moteur REFUSE"
chk "un coefficient hors des bornes de l'outil (tc_14 : 0,1 à 0,3)" WAPLA_ENTREE "$(erreur '{"tc_14": 0.05}')"
chk "une clé inconnue (faute de frappe) : refusée, jamais ignorée" WAPLA_ENTREE "$(erreur '{"tc_l": 0.5}')"
chk "un gisement négatif" WAPLA_ENTREE "$(erreur '{"waste_in": -1}')"
chk "une qualité de compostage hors des trois de l'outil" WAPLA_ENTREE "$(erreur '{"ghg_2": 0.1}')"
chk "un niveau d'épuration d'incinérateur inconnu" WAPLA_ENTREE "$(erreur '{"pop_9": 5}')"
chk "une durée d'amortissement nulle (l'outil rendrait un coût infini)" WAPLA_ENTREE "$(erreur '{"cost_13": 0}')"
chk "des coefficients dont la somme dépasse 1 : la part restante serait négative" WAPLA_COEFFICIENTS \
    "$(erreur '{"tc_1": 0.7, "tc_2": 0.5}')"
chk "… au centre de tri aussi" WAPLA_COEFFICIENTS "$(erreur '{"tc_9": 0.5, "tc_10": 0.3, "tc_25": 0.4}')"
chk "un coût saisi pour un procédé inactif : refusé plutôt que deviné" WAPLA_COUT_INACTIF \
    "$(erreur '{"incineration": false, "cost_10": 5000}')"
chk "le message dit quoi faire" t \
    "$(m "'activez-le ou retirez ce coût' in d[0]['message']" | sed 's/True/t/;s/False/f/')"

# -----------------------------------------------------------------------------
echo
echo "2. Les vecteurs de référence (annexe § 8) — valeurs par défaut, 1 000 t"
moteur '[{}]'
# float() : un entier JSON (460) et un décimal (460.0) s'écrivent pareil ici.
r() { m "round(float(d[0]$1), $2)"; }
chk "collecté 460, recyclables des ménages 140, non collecté 400" "460.0|140.0|400.0" \
    "$(r "['flux']['W1']" 2)|$(r "['flux']['W2']" 2)|$(r "['flux']['W3']" 2)"
chk "en décharge directe 460, au dépotoir 200, brûlé à l'air libre 200" "460.0|200.0|200.0" \
    "$(r "['flux']['D1']" 2)|$(r "['flux']['D2']" 2)|$(r "['flux']['WoB']" 2)"
chk "stock de décharge 238,28 t, stock de dépotoir 92,04 t" "238.28|92.04" "$(r "['flux']['LS1']" 2)|$(r "['flux']['LS2']" 2)"
chk "émissions de dégradation : décharge 102,12, dépotoir 49,56" "102.12|49.56" "$(r "['flux']['LGE1']" 2)|$(r "['flux']['LGE2']" 2)"
chk "feux : 115 t en décharge, 96 t au dépotoir, 147,7 t d'émissions" "115.0|96.0|147.7" \
    "$(r "['flux']['WB1']" 2)|$(r "['flux']['WB2']" 2)|$(r "['flux']['EFLD']" 2)"
chk "recyclables au total 147 t (dont 4,6 de la décharge, 2,4 du dépotoir)" "147.0|4.6|2.4" \
    "$(r "['flux']['ReT']" 2)|$(r "['flux']['Re2']" 2)|$(r "['flux']['Re4']" 2)"
chk "uPOPs : brûlage 8,0 (air) et 0,2 (sol), feux 63,3 et 2,11 mg TEQ/an" "8.0|0.2|63.3|2.11" \
    "$(r "['upops']['brulage_air']" 3)|$(r "['upops']['brulage_sol']" 3)|$(r "['upops']['feux_air']" 3)|$(r "['upops']['feux_sol']" 3)"
chk "uPOPs : décharge 0,023 (eau) et 2,3 (résidus)" "0.023|2.3" "$(r "['upops']['decharge_eau']" 4)|$(r "['upops']['decharge_residus']" 4)"
chk "uPOPs du dépotoir, avec le défaut D1 (−36) : 0,0102 et 1,02" "0.0102|1.02" \
    "$(r "['upops']['depotoir_eau']" 4)|$(r "['upops']['depotoir_residus']" 4)"
chk "GES : collecte 2,6, brûlage 35,0, feux 36,925 t CO₂-éq" "2.6|35.0|36.925" \
    "$(r "['ges']['collecte']" 3)|$(r "['ges']['brulage']" 3)|$(r "['ges']['feux']" 3)"
chk "GES : décharge 604,91, dépotoir 144,44, recyclage −124,58" "604.91|144.44|-124.58" \
    "$(r "['ges']['decharge']" 2)|$(r "['ges']['depotoir']" 2)|$(r "['ges']['recyclage']" 2)"
chk "GES : 699,3 au total feux compris, avant arrondi" 699.3 "$(m "round(d[0]['ges']['total_interne'] + d[0]['ges']['feux'], 1)")"
chk "… et 690 dans le tableau de l'outil, après ses arrondis à deux chiffres" 690.0 "$(r "['ges']['total_affiche']" 1)"
chk "sans climat : DOF 0,7 en décharge et au dépotoir" "None|0.7|0.7" \
    "$(m "d[0]['climat']['classe']")|$(r "['climat']['dof_decharge']" 6)|$(r "['climat']['dof_depotoir']" 6)"

echo
echo "3. Le scénario B de l'annexe (10 % vers le tri, le compostage, l'incinération ; 19 °C, 350 mm ; 30 % de biogaz capté)"
moteur '[{"tc_4": 0.1, "tc_5": 0.1, "tc_22": 0.1, "ATY": 19, "APY": 350, "ghg_19": 30}]'
chk "centre de tri 46 t, combustible 9,2, organiques 16,1, résidus d'incinération 11,04, décharge directe 322" \
    "46.0|9.2|16.1|11.04|322.0" \
    "$(r "['flux']['WR']" 3)|$(r "['flux']['RDF']" 3)|$(r "['flux']['Org']" 3)|$(r "['flux']['IRes']" 3)|$(r "['flux']['D1']" 3)"
chk "climat de classe 3 : DOF 0,5 en décharge, 0,525 au dépotoir" "3|0.5|0.525" \
    "$(m "d[0]['climat']['classe']")|$(r "['climat']['dof_decharge']" 6)|$(r "['climat']['dof_depotoir']" 6)"
chk "GES : incinération 13,8, compostage 3,478, décharge 226,98, dépotoir 108,33" "13.8|3.478|226.98|108.33" \
    "$(r "['ges']['incineration']" 3)|$(r "['ges']['compostage']" 3)|$(r "['ges']['decharge']" 2)|$(r "['ges']['depotoir']" 2)"
chk "uPOPs : incinération 193,2 (air) et 4,14 (résidus), compost 0,1665" "193.2|4.14|0.1665" \
    "$(r "['upops']['incineration_air']" 4)|$(r "['upops']['incineration_residus']" 4)|$(r "['upops']['compost_produit']" 4)"

# -----------------------------------------------------------------------------
echo
echo "4. Le témoin indépendant, jeu par jeu"
# Les jeux : fixes (défauts, scénario B, chaque procédé optionnel retiré,
# coûts saisis, climats), puis 200 tirés au hasard (graine fixe : rejouable).
python3 - > "$T/jeux.json" <<'PY'
import json, random
fixes = [
  {},
  {"tc_4": 0.1, "tc_5": 0.1, "tc_22": 0.1, "ATY": 19, "APY": 350, "ghg_19": 30},
  {"mrf": False, "tc_4": 0.2, "tc_22": 0.1},
  {"compostage": False, "tc_5": 0.2, "tc_22": 0.1},
  {"incineration": False, "tc_4": 0.2, "tc_5": 0.1},
  {"mrf": False, "compostage": False, "incineration": False},
  {"tc_34": 0.2, "tc_35": 0.3, "ghg_10": True, "ghg_17": True, "pop_10": True, "tc_5": 0.2, "tc_22": 0.2},
  {"cost_1": 120000, "cost_12": 900000, "cost_13": 8, "cost_14": 6.5, "cost_5": 40000, "cost_25": 300000, "cost_26": 15,
   "cost_27": 4, "cost_11": 15000, "cost_6": 80, "cost_7": 50, "cost_8": 300, "cost_9": 250, "tc_4": 0.1, "cost_3": 20000,
   "cost_15": 150000, "cost_16": 10, "cost_4": 30, "tc_5": 0.1, "cost_2": 25000, "cost_18": 200000, "cost_19": 12, "cost_20": 3,
   "tc_22": 0.05, "cost_10": 60000, "cost_21": 2000000, "cost_22": 20, "cost_23": 5, "cost_24": 10000},
  {"cost_5": 40000},
  {"cost_6": 80, "cost_7": 50, "cost_8": 300},
  {"ATY": 25, "APY": 1200}, {"ATY": 8, "APY": 500}, {"ATY": 15, "APY": 800, "ghg_4": 0.4, "ghg_16": 0.4},
]
alea = random.Random(20261013)
def jeu():
    j = {"waste_in": round(alea.uniform(0, 50000), 3)}
    j["tc_1"] = round(alea.uniform(0, 0.9), 3); j["tc_2"] = round(alea.uniform(0, 1 - j["tc_1"]), 3)
    for opt in ("mrf", "compostage", "incineration"):
        j[opt] = alea.random() < 0.7
    reste = 1.0
    for k in ("tc_4", "tc_5", "tc_22"):
        j[k] = round(alea.uniform(0, reste / 2), 3); reste -= j[k]
    j["tc_6"] = round(alea.uniform(0, 0.6), 3); j["tc_35"] = round(alea.uniform(0, min(0.4, 1 - j["tc_6"])), 3)
    j["tc_9"] = round(alea.uniform(0, 0.3), 3); j["tc_10"] = round(alea.uniform(0, 0.3), 3); j["tc_25"] = round(alea.uniform(0, 0.3), 3)
    j["tc_12"] = round(alea.uniform(0, 0.5), 3); j["tc_24"] = round(alea.uniform(0, 0.5), 3)
    j["tc_14"] = round(alea.uniform(0.1, 0.3), 3)
    j["tc_15"] = round(alea.uniform(0, 0.5), 3); j["tc_33"] = round(alea.uniform(0, 0.2), 3); j["tc_34"] = round(alea.uniform(0, 0.2), 3)
    j["tc_16"] = round(alea.uniform(0.2, 0.5), 3)
    j["tc_17"] = round(alea.uniform(0, 0.5), 3); j["tc_18"] = round(alea.uniform(0, 0.3), 3); j["tc_19"] = round(alea.uniform(0.2, 0.5), 3)
    j["tc_26"] = round(alea.uniform(0, 0.3), 3)
    for k in ("pop_1", "pop_2", "pop_3", "pop_7", "pop_8", "ghg_3", "ghg_5", "ghg_6", "ghg_7", "ghg_8", "ghg_9", "ghg_11", "ghg_14", "ghg_15", "ghg_18"):
        j[k] = round(alea.uniform(0, 1), 3)   # des sommes > 1 aussi : l'outil les laisse passer (D10)
    j["pop_9"] = alea.choice([1, 2, 3, 4]); j["pop_10"] = alea.random() < 0.3
    for k, b in (("pop_11", 100), ("pop_12", 5), ("pop_13", 600), ("pop_14", 30), ("ghg_1", 200000)):
        j[k] = round(alea.uniform(0, b), 3)
    j["ghg_2"] = alea.choice([0.056, 0.245, 0.648]); j["ghg_4"] = alea.choice([1, 0.8, 0.4]); j["ghg_16"] = alea.choice([0.8, 0.4])
    j["ghg_10"] = alea.random() < 0.3; j["ghg_17"] = alea.random() < 0.3; j["ghg_19"] = round(alea.uniform(0, 50), 1)
    if alea.random() < 0.6:
        j["APY"] = round(alea.uniform(50, 1500), 1); j["ATY"] = round(alea.uniform(5, 30), 1)
    def cout(cle, actif=True, maxi=1e6):
        if actif and alea.random() < 0.6: j[cle] = round(alea.uniform(0, maxi), 2)
    for k in ("cost_1", "cost_12", "cost_5", "cost_25", "cost_11", "cost_6", "cost_7", "cost_8", "cost_9"):
        cout(k)
    for k in ("cost_2", "cost_18"): cout(k, j["mrf"])
    for k in ("cost_3", "cost_15", "cost_4"): cout(k, j["compostage"])
    for k in ("cost_10", "cost_21", "cost_24"): cout(k, j["incineration"])
    for k in ("cost_13", "cost_16", "cost_19", "cost_22", "cost_26"): j[k] = alea.choice([1, 5, 10, 20, 30])
    for k in ("cost_14", "cost_17", "cost_20", "cost_23", "cost_27"): j[k] = alea.choice([0, 0, 2.5, 7, 12])
    return j
print(json.dumps(fixes + [jeu() for _ in range(200)]))
PY
JEUX=$(cat "$T/jeux.json")
moteur "$JEUX"
temoin "$JEUX"
python3 - "$T/m.json" "$T/t.json" > "$T/comparaison.txt" <<'PY'
import json, math, sys
moteur, temoin = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
ecarts, calcules, arrets = [], 0, 0
def comparer(chemin, a, b):
    if isinstance(b, dict):
        for k in b:
            comparer(f"{chemin}.{k}", (a or {}).get(k, 'ABSENT') if isinstance(a, dict) else 'ABSENT', b[k])
    elif b is None or a is None:
        if a is not b: ecarts.append(f"{chemin}: moteur {a!r}, témoin {b!r}")
    elif isinstance(b, bool) or isinstance(a, str):
        if a != b: ecarts.append(f"{chemin}: moteur {a!r}, témoin {b!r}")
    elif not math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9):
        ecarts.append(f"{chemin}: moteur {a!r}, témoin {b!r}")
for i, (a, b) in enumerate(zip(moteur, temoin)):
    if 'erreur' in b or 'erreur' in a:
        arrets += 1
        if a.get('erreur') != b.get('erreur'): ecarts.append(f"jeu {i}: moteur {a.get('erreur')}, témoin {b.get('erreur')}")
        continue
    calcules += 1
    comparer(f"jeu {i}", a, b)
print(f"{len(moteur)}|{len(temoin)}|{calcules}|{arrets}|{len(ecarts)}")
for e in ecarts[:10]: print(e, file=sys.stderr)
PY
IFS='|' read -r N_M N_T N_CALC N_ARRET N_ECARTS < "$T/comparaison.txt"
chk "le moteur et le témoin rendent un résultat pour chacun des 213 jeux" "213|213" "$N_M|$N_T"
chk "au moins 150 jeux calculés de bout en bout (pas seulement des refus)" t "$([ "${N_CALC:-0}" -ge 150 ] && echo t || echo f)"
chk "aucun écart entre le moteur et le témoin — flux, uPOPs, GES, climat, coûts à 10⁻⁹ près, et les mêmes arrêts aux mêmes jeux ($N_ARRET)" 0 "${N_ECARTS:-erreur}"

# -----------------------------------------------------------------------------
echo
echo "5. Les défauts de l'outil, reproduits exprès (le mode corrigé les ôtera au lot W1b)"
moteur '[{"tc_34": 0.5}, {}, {"cost_5": 40000}, {"cost_6": 80, "cost_7": 50, "cost_8": 300}, {"ghg_10": true, "tc_22": 0.2}, {"pop_2": 0.8, "pop_3": 0.8}]'
chk "D1 : les uPOPs du dépotoir ignorent le nettoyage (la constante 36 est soustraite)" t \
    "$(m "abs(d[0]['upops']['depotoir_residus'] - d[1]['upops']['depotoir_residus']) < 1e-12 and d[0]['flux']['CU'] > 0" | sed 's/True/t/;s/False/f/')"
chk "D2 : avec valorisation énergétique, le CO₂ fossile des plastiques disparaît (seul le crédit reste)" t \
    "$(m "abs(d[4]['ges']['incineration'] - (d[4]['flux']['WI'] + d[4]['flux']['RDF']) * -0.35) < 1e-9" | sed 's/True/t/;s/False/f/')"
chk "D3 : le total interne oublie les feux" t \
    "$(m "abs(d[1]['ges']['total_interne'] - (sum(v for k, v in d[1]['ges'].items() if k not in ('total_interne', 'total_affiche')) - d[1]['ges']['feux'])) < 1e-9" | sed 's/True/t/;s/False/f/')"
chk "D4 : une exploitation de décharge saisie sans investissement donne un coût de décharge nul" 0 \
    "$(m "d[2]['couts']['procedes']['decharge']['total']")"
chk "D5 : un seul prix de recyclage manquant, et la ligne des recettes disparaît" None \
    "$(m "d[3]['couts']['procedes']['recyclage']['total']")"
chk "D6 : plus de 20 °C et exactement 400 mm — aucune classe, l'outil s'arrête" WAPLA_CLIMAT "$(erreur '{"ATY": 25, "APY": 400}')"
# D7 : la base du méthane laisse de côté les résidus d'incinération, mais en
# retire les tonnes brûlées en décharge — qui, elles, en dépendent. Plus de
# résidus en décharge, et le méthane BAISSE.
moteur '[{"tc_22": 0.2, "tc_26": 0}, {"tc_22": 0.2, "tc_26": 0.3}]'
chk "D7 : plus de résidus d'incinération en décharge, et le méthane de décharge baisse" t \
    "$(m "d[1]['flux']['IRes'] > d[0]['flux']['IRes'] and d[1]['ges']['decharge'] < d[0]['ges']['decharge']" | sed 's/True/t/;s/False/f/')"
moteur '[{}]'
chk "D8 : le bilan de masse fuit, exactement des résidus des feux (BR1 + BR2)" t \
    "$(m "abs(d[0]['flux']['WG'] - sum(d[0]['flux'][k] or 0 for k in ('LGE1','LGE2','OBE','CE','OFG','EFLD','ReT','CMP','LW','LS1','LS2')) - (d[0]['flux']['BR1'] + d[0]['flux']['BR2'])) < 1e-9" | sed 's/True/t/;s/False/f/')"
chk "D9 : sans climat, le dépotoir garde 0,7 sans le multiplicateur de gestion (0,7 × 1,05 en décharge à MCF 0,8)" "0.735|0.7" \
    "$(moteur '[{"ghg_4": 0.8}]'; m "str(round(d[0]['climat']['dof_decharge'], 6)) + '|' + str(round(d[0]['climat']['dof_depotoir'], 6))")"
chk "D10 : des parts dont la somme dépasse 1 passent, et la part déduite devient négative" t \
    "$(moteur '[{"pop_2": 0.8, "pop_3": 0.8}]'; m "d[0]['upops']['decharge_eau'] < 0" | sed 's/True/t/;s/False/f/')"

# -----------------------------------------------------------------------------
echo
echo "6. Une couche à part"
chk "le moteur n'importe que zod : ni base, ni route, ni rien de SIIPI" "zod" \
    "$(grep -E "^import .* from '" src/wapla/moteur.ts | sed -E "s/.* from '([^']+)'.*/\1/" | sort -u | paste -sd, -)"
chk "aucun fichier de SIIPI hors de src/wapla n'importe le moteur" 0 \
    "$(grep -rlE "from '(\.\./)+wapla/" src | grep '\.ts$' | grep -vc '^src/wapla/')"
chk "chaque résultat porte la version du moteur et son mode" "w1a-fidele-1|fidele" \
    "$(moteur '[{}]'; m "d[0]['version_moteur'] + '|' + d[0]['mode']")"

echo
echo "----------------------------------------------------------------"
printf '  %s réussis, %s échecs\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
