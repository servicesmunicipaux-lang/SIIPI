# UNIDO WaPla Tool: calculation engine specification

Source: `app/shiny/server.r` (4417 lines), TU Wien / UNIDO "WaPla" Solid Waste Management Plan tool. Input widgets and defaults come from `app/shiny/ui.r`.
Every formula carries a reference of the form `server.r:NNN`. A reference to `ui.r:NNN` points to a widget definition.

Layout notes:
- The global definitions at `server.r:1-585` are the same as `ui.r:1-585` (only whitespace differs).
- The commented-out UI copy runs from `server.r:587` to `server.r:1203`. The live `server <- function(...)` starts at `server.r:1205`.
- Calculations are at `server.r:1593-2746`. Result tables are at `server.r:2752-3104` and `server.r:3665-3736`, plus the summaries at `server.r:4057-4092`.

A Python port of the mass-flow, uPOP and GHG parts produced the reference values in §8. Use them as test vectors. Its successor, extended to costs, is the independent witness of the `wapla-moteur` campaign: `backend/tests/wapla_attendus.py`.

---

## 1. Processes, flows and transfer coefficients

### 1.1 Processes `p_` (server.r:19-51)

| id_p | code | label | optional? (server.r:194-196) |
|---|---|---|---|
| 1 | WG | Waste Generation | n |
| 2 | WC | Waste Collection | n |
| 3 | uCW | Uncollected Waste | n |
| 4 | SHH | Separation of Recyclables in Households | n, but always removed (server.r:1603) |
| 5 | MRF | Materials Recovery Facility | **y** |
| 6 | CP | Composting | **y** |
| 7 | OB | Open Burning | n |
| 8 | IFD | Informal Dumping | n |
| 9 | LF | Landfill / Formal Disposal | n |
| 10 | Rec | Recycling | n |
| 11 | Inc | Incineration | **y** |
| 12 | Env | Environment (sink) | n |
| 13 | Prod | Products (sink) | n |
| 14 | SLF | Stock Landfill (sink) | n |
| 15 | FLD | Fires at Landfills / Dumpsites | n |
| 0 | not applicable | (system boundary) | – |

**Active process set** (`p_used`, server.r:1596-1606) = {1,2,3,7,8,9,10,12,13,14,15} ∪ (selected subset of {5,6,11}).
- The selection comes from checkbox `p_opt` (ui.r:601). By default all three optional processes are selected.
- Process 4 is always excluded.

### 1.2 Flows `fl_` (server.r:204-288)

| id_fl | code | label | from → to |
|---|---|---|---|
| 1 | WoB | Waste to open burning | 3 → 7 |
| 2 | BR3 | Burning residuals | 7 → 8 |
| 3 | D2 | Waste to dumping | 3 → 8 |
| 4 | CR | Composting residuals | 6 → 9 |
| 5 | W1 | Waste collected | 1 → 2 |
| 6 | W3 | Waste not collected | 1 → 3 |
| 7 | WR | Waste to materials recovery facility | 2 → 5 |
| 8 | RDF | Refuse derived fuel | 5 → 11 |
| 9 | Re1 | Recyclable materials | 5 → 10 |
| 10 | Re2 | Recyclables from landfills | 9 → 10 |
| 11 | CMP | Compost | 6 → 13 |
| 12 | Org | Organic material for composting | 5 → 6 |
| 13 | LGE1 | Landfill emissions | 9 → 12 |
| 14 | LGE2 | Dumpsite emissions | 8 → 12 |
| 15 | OBE | Open burning emissions | 7 → 12 |
| 16 | CE | Gaseous and liquid composting losses | 6 → 12 |
| 17 | WC | Waste to composting | 2 → 6 |
| 18 | MR | Residuals of materials recovery facility | 5 → 9 |
| 19 | D1 | Direct waste disposal | 2 → 9 |
| 20 | W2 | Recyclables from households | 1 → 10 |
| 21 | Re3 | Recyclables from households (legacy SHH; value fixed at 0) | 10 → 10 |
| 22 | OFG | Off-gas | 11 → 12 |
| 23 | IRes | Incineration residuals | 11 → 9 |
| 24 | ReT | Total recyclables | 10 → 13 |
| 25 | LS1 | Waste to landfill stock | 9 → 14 |
| 26 | LS2 | Waste to dump stock | 8 → 14 |
| 27 | WI | Waste to incineration | 2 → 11 |
| 28 | WG | Waste generated (= `waste_in`) | 0 → 1 |
| 29 | input | "Plant input" (pseudo-flow, value stays NA) | 0 → 0 |
| 30 | WB1 | Waste burned at formal landfills | 9 → 15 |
| 31 | WB2 | Waste burned at dumpsites | 8 → 15 |
| 32 | EFLD | Emissions from fires at landfills / dumpsites | 15 → 12 |
| 33 | BR1 | Burning residuals (from LF fires) | 15 → 9 |
| 34 | BR2 | Burning residuals (from dump fires) | 15 → 8 |
| 35 | Re4 | Recyclables from dumpsites | 8 → 10 |
| 36 | CU | Clean up of dumpsites | 8 → 9 |
| 37 | LW | Leakage to waters (**target is process 13 "Products"**) | 3 → 13 |

**Active flows** (`fl_used`, server.r:1680-1696):
- A flow is active if its source and its target are both in `p_used ∪ {0}`.
- The function then re-adds flow 28 with `value_fl = input$waste_in`.
- Flow 21 starts at 0 (server.r:288). Every other flow starts as NA.

### 1.3 Transfer-coefficient table `p_tc_orig` (server.r:290-308) and the inputs that feed it (server.r:1699-1741)

TC labels are built at server.r:300-308 as `"<source flow label> -> <target flow label>"`.
- When the source is pseudo-flow 29, the source label is "Plant input".
- For id_p 8 the source label is replaced by "Input".

Slider min/max/step come from ui.r.

| id_tc | proc | source flow → target flow | label (text) | value used in engine (server.r:1703-1737) | default | slider min–max (step) |
|---|---|---|---|---|---|---|
| 1 | 1 | 28 → 5 | Waste generated -> Waste collected | `tc_1` | 0.46 | 0–1 (0.001) ui.r:643 |
| 2 | 1 | 28 → 20 | Waste generated -> Recyclables from households | `tc_2` | 0.14 | 0–1 ui.r:646 |
| 21 | 1 | 28 → 6 | Waste generated -> Waste not collected | **derived** = 1 − tc_1 − tc_2 | (0.40) | – |
| 4 | 2 | 5 → 17 | Waste collected -> Waste to composting | `tc_4` | 0 | 0–1 ui.r:683 |
| 5 | 2 | 5 → 7 | Waste collected -> Waste to materials recovery facility | `tc_5` | 0 | 0–1 ui.r:679 |
| 22 | 2 | 5 → 27 | Waste collected -> Waste to incineration | `tc_22` | 0 | 0–1 ui.r:687 |
| 3 | 2 | 5 → 19 | Waste collected -> Direct waste disposal | **derived** = 1 − Σ(active tc_4, tc_5, tc_22) | (1.0) | – |
| 6 | 3 | 6 → 3 | Waste not collected -> Waste to dumping | `tc_6` | 0.5 | 0–1 ui.r:661 |
| 35 | 3 | 6 → 37 | Waste not collected -> Leakage to waters | `tc_35` | 0 | 0–0.4 ui.r:664 |
| 7 | 3 | 6 → 1 | Waste not collected -> Waste to open burning | **derived** = 1 − tc_6 − tc_35 | (0.5) | – |
| 8 | 4 | 20 → 21 | Recyclables from households -> Recyclables from households | NA → derived 1 (process 4 has no input, so the flow is 0) | 1 | – |
| 9 | 5 | 29 → 8 | Plant input -> Refuse derived fuel | `tc_9` | 0.2 | 0–1 ui.r:722 |
| 10 | 5 | 29 → 9 | Plant input -> Recyclable materials | `tc_10` | 0.05 | 0–1 ui.r:725 |
| 25 | 5 | 29 → 12 | Plant input -> Organic material for composting | `tc_25` | 0.35 | 0–1 ui.r:718 |
| 11 | 5 | 29 → 18 | Plant input -> Residuals of materials recovery facility | **derived** = 1 − Σ(active tc_9, tc_10, tc_25) | (0.40) | – |
| 12 | 6 | 29 → 11 | Plant input -> Compost | `tc_12` | 0.15 | 0–1 ui.r:739 |
| 24 | 6 | 29 → 4 | Plant input -> Composting residuals | `tc_24` | 0.14 | 0–1 ui.r:742 |
| 13 | 6 | 29 → 16 | Plant input -> Gaseous and liquid composting losses | **derived** = 1 − tc_12 − tc_24 | (0.71) | – |
| 14 | 7 | 1 → 2 | Waste to open burning -> Burning residuals | `tc_14` | 0.2 | **0.1–0.3** ui.r:703 |
| 23 | 7 | 1 → 15 | Waste to open burning -> Open burning emissions | **derived** = 1 − tc_14 | (0.8) | – |
| 15 | 8 | 29 → 31 | Input -> Waste burned at dumpsites | `tc_15` | 0.4 | 0–1 ui.r:771 |
| 33 | 8 | 29 → 35 | Input -> Recyclables from dumpsites | `tc_33` | 0.01 | 0–0.5 ui.r:774 |
| 34 | 8 | 29 → 36 | Input -> Clean up of dumpsites | `tc_34` | 0 | 0–1 ui.r:777 |
| 16 | 8 | 29 → 14 | Input -> Dumpsite emissions | **computed** = (1 − tc_15 − tc_33 − tc_34) × `tc_16` (server.r:1718) | tc_16 = 0.35 | tc_16: **0.2–0.5 (0.01)** ui.r:782 |
| 27 | 8 | 29 → 26 | Input -> Waste to dump stock | **derived** = 1 − (tc_15 + tc_33 + tc_34 + tc16eff) = (1 − tc_15 − tc_33 − tc_34)(1 − tc_16) | – | – |
| 17 | 9 | 29 → 30 | Plant input -> Waste burned at formal landfills | `tc_17` | 0.25 | 0–1 ui.r:796 |
| 18 | 9 | 29 → 10 | Plant input -> Recyclables from landfills | `tc_18` | 0.01 | 0–1 ui.r:799 |
| 19 | 9 | 29 → 13 | Plant input -> Landfill emissions | **computed** = (1 − tc_17 − tc_18) × `tc_19` (server.r:1721) | tc_19 = 0.3 | tc_19: **0.2–0.5 (0.01)** ui.r:804 |
| 28 | 9 | 29 → 25 | Plant input -> Waste to landfill stock | **derived** = (1 − tc_17 − tc_18)(1 − tc_19) | – | – |
| 29 | 10 | 29 → 24 | Plant input -> Total recyclables | **derived** = 1 | 1 | – |
| 26 | 11 | 29 → 23 | Plant input -> Incineration residuals | `tc_26` | 0.2 | **0–0.3** ui.r:756 |
| 20 | 11 | 29 → 22 | Plant input -> Off-gas | **derived** = 1 − tc_26 | (0.8) | – |
| 30 | 15 | 30 → 33 | Waste burned at formal landfills -> Burning residuals | **hard-coded** `tc_30 = p_tc$value_tc[30] = 0.3` (server.r:1700, 1732). There is no UI input. | 0.3 | – |
| 31 | 15 | 31 → 34 | Waste burned at dumpsites -> Burning residuals | **hard-coded**: reuses `tc_30` = 0.3 (server.r:1733). The stored default 0.3 is ignored. | 0.3 | – |
| 32 | 15 | 29 → 32 | Plant input -> Emissions from fires at landfills / dumpsites | 1 − tc_30 = 0.7 (server.r:1734) | 0.7 | – |

**How derived TCs are computed** (`tc_res`, server.r:1745-1762):
1. `tc_inputs` keeps only TC rows whose source and target flow are both in `fl_used` (server.r:1738-1739).
2. For each process i = 1..14 (server.r:1748), the engine sums the non-NA TCs. Every NA TC in that process gets `1 − Σ(non-NA TCs of the process)`. Each process has exactly one NA TC, except process 4.
3. TCs of process 15 are appended unchanged (server.r:1759).

**Validation** (server.r:1659-1676):
- If any resulting TC is < 0, the "Calculate" button is replaced by an error listing the offending processes.
- Nothing checks that TCs are > 1, or that the uPOP and GHG composition shares (pop_4/5/15, ghg_13) are ≥ 0. Those shares only show a red warning text (server.r:1442-1473).

### 1.4 Rerouting when optional processes are deselected

The rerouting works through the `fl_used` and `tc_inputs` filters. Removed TCs disappear, so the derived TC of the same process absorbs their share.

| Deselected | Flows removed | TCs removed | Effect |
|---|---|---|---|
| MRF (5) | 7, 8, 9, 12, 18 | 5, 9, 10, 11, 25 | tc_3 (D1) = 1 − tc_4 − tc_22. The MRF share goes to direct landfill. |
| Composting (6) | 4, 11, 12, 16, 17 | 4, 12, 13, 24, 25 | tc_3 absorbs tc_4. Inside the MRF, tc_11 (MR) absorbs tc_25 (Org). |
| Incineration (11) | 8, 22, 23, 27 | 9, 20, 22, 26 | tc_3 absorbs tc_22. Inside the MRF, MR absorbs tc_9 (RDF). |

The UI also prints "input will be ignored" notes at server.r:1615-1657.

---

## 2. Mass-flow algorithm (`fl_res`, server.r:1766-1809)

The calculation is triggered by `input$go`. Inputs: `fl_used`, `tc_res`, and `waste_in` (default 1000 t/yr, ui.r:604).

```
flows := fl_used (WG = waste_in, Re3 = 0, all other values NA)
repeat 5 times:                                   # server.r:1771
  for i in 1..16:                                 # server.r:1772 (p_ has 16 rows; 12,13,14,16 have no TCs)
     y := Σ value of flows with target == i AND source != 15     # server.r:1773-1774
          (NA if any of those input flows is still NA)
     for each TC t of process i:  flow[t.target] := t.value × y  # server.r:1775-1784
post-processing (fires, process 15):              # server.r:1787-1806
  BR1 (33) := WB1(30) × TC(target 33) = 0.3 × WB1
  BR2 (34) := WB2(31) × TC(target 34) = 0.3 × WB2
  EFLD(32) := (WB1 + WB2) × 0.7
```

Notes for a re-implementation:
- **Order and iterations.** Five passes over processes 1..16 are enough because the only "backward" dependency is IRes (11 → 9). On pass 1, LF (9) is NA because IRes is not yet computed. Pass 2 fixes it.
- A topological order gives the same result in one pass: 1, 2, 3, 7, 5, 6, 11, 8, 9, 10, 15, then the fires post-processing.
- **Excluded inputs.** Flows from process 15 (BR1 → LF, BR2 → IFD) are excluded from the inputs of LF and IFD to avoid feedback. Fire residues are reported as flows but **do not re-enter the mass balance** of LF or IFD, so 30 % of burned mass never reaches a stock.
- **Process inputs:**
  - LF (9) = CR + MR + D1 + IRes + CU
  - IFD (8) = BR3 + D2
  - Recycling (10) = Re1 + Re2 + W2 + Re3 + Re4
  - Composting (6) = WC + Org
  - Incineration (11) = RDF + WI
  - Open burning (7) = WoB
- **Stocks.**
  - Landfill stock increase LS1 = LF_in × (1 − tc_17 − tc_18)(1 − tc_19).
  - Dump stock increase LS2 = IFD_in × (1 − tc_15 − tc_33 − tc_34)(1 − tc_16).
  - These values appear as "stock increase" labels in the diagram (server.r:3642-3643).
- **Biodegradation and leachate.** LGE1 and LGE2 (flows to Environment) are the share of the *unburned, unrecovered, uncleaned* waste lost through degradation over more than 50 years. They are mass flows only. The GHG methane formulas (§4) do **not** use them.
- **Emission flows** go to process 12 (Environment): OBE (15), LGE1 (13), LGE2 (14), CE (16), OFG (22), EFLD (32).
- **Products** (process 13) receive ReT (24), CMP (11) and LW (37).
- The pseudo-flow 29 remains NA. Displays filter out flow 29, and the system table also filters out flow 21 (server.r:3701-3702, 4060).

---

## 3. uPOP (PCDD/F) emissions (server.r:1813-1989)

**Units:**
- Emission factors are in µg TEQ per tonne.
- The result is `EF × t / 1000`, in **mg TEQ/yr**. The y-axis label is "uPOP emissions [mg TEQ/year]" (server.r:3141).

### 3.1 Inputs

| input | meaning | default | range | ref |
|---|---|---|---|---|
| pop_1 (SCC) | share of clean compost | 0.5 | 0–1 (0.01) | ui.r:833 |
| pop_4 | grey compost = 1 − pop_1 (display only) | – | – | server.r:1442 |
| pop_2 (SMWLF) | share of mixed waste landfilled | 0 | 0–1 | ui.r:877 |
| pop_3 (SDWLF) | share of domestic waste landfilled | 1 | 0–1 | ui.r:874 |
| SHWLF | hazardous share landfilled = 1 − pop_2 − pop_3 | 0 | – | server.r:1869-1872 |
| pop_7 (SMWID) | share of mixed waste dumped | 0 | 0–1 | ui.r:861 |
| pop_8 (SDWID) | share of domestic waste dumped | 1 | 0–1 | ui.r:858 |
| SHWID | hazardous share dumped = 1 − pop_7 − pop_8 | 0 | – | server.r:1884-1887 |
| pop_9 | incinerator APC level (radio): 1 = none, 2 = minimal, 3 = good, 4 = sophisticated | 1 (first choice) | – | server.r:500-503, ui.r:846 |
| pop_10 (APCCK) | "Combustion of refuse derived fuels in cement kiln" (checkbox) | FALSE | – | server.r:1942-1949 |
| pop_11 | open burning EF, air | 40 µg TEQ/t | numeric | ui.r:822 |
| pop_12 | open burning EF, land | 1 µg TEQ/t | numeric | ui.r:825 |
| pop_13 | LF/dump fires EF, air | 300 µg TEQ/t | numeric | ui.r:890 |
| pop_14 | LF/dump fires EF, land | 10 µg TEQ/t | numeric | ui.r:893 |

**Incinerator factors by APC level** (server.r:507-508):
- `EFIAIR_def = c(3500, 350, 30, 0.5)` µg TEQ/t for air.
- `EFIR_def = c(75, 75, 30, 3)` µg TEQ/t for residue.
- Both are indexed by `pop_9`.

### 3.2 Formulas

| Output | Formula | Ref |
|---|---|---|
| POPOB_Air1 (Open burning → Air) | WoB × pop_11 / 1000 | server.r:1815-1821 |
| POPOB_Land1 (Open burning → Land) | WoB × pop_12 / 1000 | server.r:1823-1829 |
| POPOB_Air2 (Fires → Air) | (WB1 + WB2) × pop_13 / 1000 | server.r:1837-1843 |
| POPOB_Land2 (Fires → Land) | (WB1 + WB2) × pop_14 / 1000 | server.r:1845-1851 |
| POPLFD_water (Landfill → Water) | (5·SHWLF + 0.5·SMWLF + 0.05·SDWLF)/1000 × LF_in | server.r:1889-1895 |
| POPLFD_residue (Landfill → Residue) | (500·SHWLF + 50·SMWLF + 5·SDWLF)/1000 × LF_in | server.r:1906-1912 |
| POPIFD_water (Informal dumping → Water) | (5·SHWID + 0.5·SMWID + 0.05·SDWID)/1000 × (IFD_in − CU)* | server.r:1897-1904 |
| POPIFD_residue (Informal dumping → Residue) | (500·SHWID + 50·SMWID + 5·SDWID)/1000 × (IFD_in − CU)* | server.r:1914-1920 |
| POPI_air (Incineration → Air), only if process 11 is active, else 0 | (EFIAIR/1000)·(RDF·(1 − APCCK) + WI) + (3/1000)·RDF·APCCK | server.r:1951-1958 |
| POPI_residue (Incineration → Residue), only if process 11 is active, else 0 | (EFIR/1000)·(RDF·(1 − APCCK) + WI) | server.r:1961-1969 |
| POPC_product (Composting → Product), only if process 6 is active, else 0 | CMP × (5·SCC + 50·(1 − SCC))/1000 × **0.65** | server.r:1979-1989 |

Definitions used in the formulas:
- LF_in = Σ flows to process 9 excluding source 15 = CR + MR + D1 + IRes + CU.
- IFD_in = BR3 + D2.
- RDF = flow 8 if MRF is active, else 0 (server.r:2004-2013).
- WI = flow 27 (server.r:2033-2036).

Factor and coding notes:
- **Water and residue factors** (hard-coded, µg TEQ/t): hazardous 5 / 0.5; mixed 0.5 / 50; domestic 0.05 / 5.
- **Compost factors**: clean compost 5 µg TEQ/t and grey compost 50 µg TEQ/t, × 0.65 (hard-coded; probably dry-matter content).
- **Cement-kiln RDF**: air EF hard-coded at 3 µg TEQ/t and no residue. The mass flow still routes RDF through process 11, where it produces IRes.
- **\* Bug in the informal-dumping formulas.** Both use `filter(fl_res(), id_fl == 36)[[1]]`. The first column of `fl_res` is `id_fl`, so the code subtracts the constant **36**, not the clean-up mass CU. The intent was IFD_in − CU (probably also minus WB2 and Re4). A faithful port uses `IFD_in − 36`. A corrected port uses `IFD_in − CU`.

### 3.3 Result matrix (`pop_`, server.r:2941-3103)

Sources: Composting (6), Open Burning (7), Informal Dumping (8), Landfill (9), Incineration (11), Fires (15).
Environment compartments: Air, Water, Land, Product, Residue.

Non-zero cells:
- Air: OB = POPOB_Air1, Inc = POPI_air, Fires = POPOB_Air2.
- Water: IFD = POPIFD_water, LF = POPLFD_water.
- Land: OB = POPOB_Land1, Fires = POPOB_Land2.
- Product: CP = POPC_product.
- Residue: IFD = POPIFD_residue, LF = POPLFD_residue, Inc = POPI_residue.

How the table is built:
- Each value is rounded with `signif(.,2)`.
- A "Total" row per source is the sum of the rounded values, rounded again with `signif(.,2)`.
- Sources are grouped as follows (`master`): Composting; Fires/Incineration (OB, Inc, Fires); Disposal (IFD, LF).
- The exported table (server.r:3693-3697) has columns `from process | to environment | mg TEQ/year` and keeps only values ≠ 0.
- The plot subtitle says "in accordance with the Toolkit" only if pop_11..14 equal 40/1/300/10 (server.r:3125-3129).
- The UI notes that residue emissions matter only if the site is mined later (server.r:584).

---

## 4. GHG emissions (server.r:1992-2361)

Units are t CO2-eq per year. Methane uses **GWP = 28** (IPCC AR5, 100-yr). Methane is computed as the **total long-term generation potential** of the waste deposited in one year (committed emissions, no first-order decay or time series). The plot subtitle says "emission factors from the IPCC" (server.r:3225).

### 4.1 Inputs

| input | meaning | default | range / choices | ref |
|---|---|---|---|---|
| ghg_1 (FDC) | diesel used for collection [L/yr] | 1000 | numeric | ui.r:905 |
| ghg_2 (CEFC) | composting quality → EF [t CO2e/t input] | very well managed 0.056 (first, default); managed 0.245; very poorly managed 0.648 | radio | server.r:496-498 |
| ghg_3 (PCWB1) | plastics content of openly burned waste | 0.1 | 0–1 | ui.r:914 |
| ghg_4 (MCF_L) | landfill management / MCF | Landfill well managed 1 (default); Dumpsite > 5 m 0.8; Dumpsite < 5 m 0.4 | radio | server.r:492-494 |
| ghg_5 (PCCoL) | paper and cardboard content landfilled | 0.1 | 0–1 | ui.r:977 |
| ghg_6 (BWCoL) | biowaste content landfilled | 0.6 | 0–1 | ui.r:980 |
| ghg_19 (LFGshare) | landfill gas collected [%] | 0 | 0–50 (step 1) | ui.r:983 |
| ghg_14 (PCCoD) | paper and cardboard content dumped | 0.1 | 0–1 | ui.r:963 |
| ghg_15 (BWCoD) | biowaste content dumped | 0.6 | 0–1 | ui.r:966 |
| ghg_16 (MCF_D) | dumpsite depth | > 5 m: 0.8 (default); < 5 m: 0.4 | radio | ui.r:960 |
| ghg_7 / ghg_8 / ghg_9 | shares of recyclables: paper & cardboard / glass / plastics | 0.35 / 0.20 / 0.25 | 0–1 | ui.r:930-936 |
| SCM (scrap metal share) | 1 − ghg_7 − ghg_8 − ghg_9 | 0.20 | – | server.r:2340-2343 |
| ghg_10 (IWER_F) | incineration with energy recovery | FALSE | checkbox | server.r:2015-2022 |
| ghg_17 (RDF_I) | RDF used in (cement) industry | FALSE | checkbox | server.r:2024-2031 |
| ghg_11 (PCWI) | plastics content incinerated | 0.1 | 0–1 | ui.r:952 |
| ghg_18 (PCWB2) | plastics content burned at LF/dumpsites | 0.1 | 0–1 | ui.r:992 |
| APY | annual precipitation [mm/yr] | NA | numeric | ui.r:599 |
| ATY | annual mean temperature [°C] | NA | numeric | ui.r:600 |

### 4.2 Climate class (server.r:2116-2136)

| class | condition |
|---|---|
| no_cl | APY or ATY is NA |
| cl_1 | ATY ≤ 10 and APY ≤ 400 |
| cl_2 | ATY ≤ 10 and APY > 400 |
| cl_3 | 10 < ATY ≤ 20 and APY ≤ 400 |
| cl_4 | ATY > 20 and APY **< 400** |
| cl_5 | 10 < ATY ≤ 20 and 400 < APY ≤ 1000 |
| cl_6 | 10 < ATY ≤ 20 and APY > 1000 |
| cl_7 | ATY > 20 and 400 < APY ≤ 1000 |
| cl_8 | ATY > 20 and APY > 1000 |

**Gap:** ATY > 20 with APY = 400 exactly matches no branch. The function returns NULL and every downstream `if` errors, so the app crashes.

Climate-dependent values:

| class | Recommended biodegradation LF (BD_LF, server.r:2143-2163) | Recommended biodegradation IFD (BD_IFD, server.r:2166-2186) | DOCf base (server.r:2216-2234, 2301-2319) |
|---|---|---|---|
| cl_1 | 0.26 | 0.29 | 0.40 |
| cl_2 | 0.29 | 0.32 | 0.45 |
| cl_3 | 0.33 | 0.36 | 0.50 |
| cl_4 | 0.33 | 0.36 | 0.50 |
| cl_5 | 0.36 | 0.39 | 0.55 |
| cl_6 | 0.39 | 0.43 | 0.60 |
| cl_7 | 0.39 | 0.43 | 0.60 |
| cl_8 | 0.46 | 0.50 | 0.70 |
| none | 0 ("no recommendation") | 0 | 0.70 |

The BD values are **only displayed** as suggestions for sliders tc_19 and tc_16 (server.r:2190-2204). They are not used in any formula.

DOF multiplier x by MCF: 1 → 1.0, 0.8 → 1.05, 0.4 → 1.1.
- `DOF_LF = base × x`. When there is no climate data it is `0.7 × x` (server.r:2206-2236).
- `DOF_ID = base × x`. When there is no climate data it is **0.7 without x** (server.r:2294-2321). This is inconsistent with DOF_LF.

### 4.3 Formulas

| Output (table row) | Formula | Ref |
|---|---|---|
| GHGCT (Waste Collection) | ghg_1 × **0.0026** (t CO2e per L diesel) | server.r:1994-1997 |
| GHGOB (Open Burning) | WoB × ghg_3 × **2.5** × **0.7** | server.r:2055-2061 |
| GHGLFF (Fires at LF/Dumpsites) | (WB1 + WB2) × ghg_18 × 2.5 × 0.7 | server.r:2069-2075 |
| GHGC (Composting), only if process 6 is active | (WC + Org) × CEFC | server.r:2083-2093 |
| GHGI (Incineration), only if process 11 is active | see below | server.r:2038-2048 |
| GHGR (Recycling) | (Re1 + Re2 + W2 + Re3 + Re4) × (SPB·(−0.15) + SG·(−0.30) + SP·(−1.50) + SCM·(−1.80)) | server.r:2348-2354 |
| GHGLFD (Landfill) | see below | server.r:2239-2260 |
| GHGIFD (Informal Dumping) | see below | server.r:2283-2290 |

Factor meanings:
- 2.5 is t CO2 per t plastic and 0.7 is presumably the oxidised or fossil fraction. Both are hard-coded.
- The recycling credits are t CO2e/t of each material: paper −0.15, glass −0.30, plastics −1.50, metal −1.80. With the defaults the combined factor is −0.8475 t CO2e/t.

**Incineration**

```
A    = RDF·(1 − RDF_I) + WI
GHGI = PCWI·2.5·(A·(1 − IWER_F)) + (A·IWER_F)·(−0.35) + (RDF·RDF_I)·(−0.55)
```

- −0.35 is the energy-recovery credit (t CO2e/t).
- −0.55 is the cement-kiln RDF credit (t CO2e/t).
- Precedence quirk: with energy recovery on, the fossil CO2 term disappears completely (see §7).

**Landfill**

```
GHGLFD = MCF_L·(BWCoL·0.16 + PCCoL·0.40)·0.5·(16/12)·28·DOF_LF
         ·(D1 + MR + CR + CU − Re2 − WB1)·(1 − LFGshare/100)
```

Constants: DOC biowaste 0.16, DOC paper 0.40, F (CH4 share of landfill gas) 0.5, CH4/C ratio 16/12, GWP 28.
- MR and CR count as 0 when absent.
- **IRes is not included**, although it is a landfill input.
- No oxidation factor is applied.

**Informal dumping**

```
GHGIFD = MCF_D·(BWCoD·0.16 + PCCoD·0.40)·0.5·(16/12)·28·DOF_ID·(D2 − Re4 − WB2 − CU)
```

- Uses D2 only. BR3 (open-burning ash) is not included.
- No gas collection.

**Total**
- `TAGHG = GHGCT + GHGI + GHGOB + GHGC + GHGLFD + GHGIFD + GHGR` (server.r:2358-2361). It **omits GHGLFF** and is not used anywhere.
- The displayed total (server.r:2900-2939) is the sum of the per-process values *after* `signif(.,2)`, which **includes GHGLFF**, rounded again with `signif(.,2)`.

---

## 5. Costs (server.r:2363-2746)

All cost inputs default to **NA**, except:
- depreciation years = 1 (cost_13, 16, 19, 22, 26);
- interest rate = 0 % (cost_14, 17, 20, 23, 27; slider 0–50, step 0.1).

Values come from `p_cost` (server.r:310-440) and ui.r:1003-1120. CUR is the free-text currency (`input$cur`).

### 5.1 Inputs

| process | annual operating cost [CUR/yr] | investment [CUR] | years | interest % | revenues |
|---|---|---|---|---|---|
| Collection (2) | cost_1 | cost_12 | cost_13 (min = 1) | cost_14 | – |
| MRF (5) | cost_2 | cost_18 | cost_19 | cost_20 | – |
| Composting (6) | cost_3 | cost_15 | cost_16 | cost_17 | cost_4: CUR per t compost |
| Landfill (9) | cost_5 | cost_25 | cost_26 | cost_27 | – |
| Incineration (11) | cost_10 | cost_21 | cost_22 | cost_23 | cost_24: energy sales, CUR/yr |
| Informal dumping (8) | cost_11 (annual costs, including clean-up) | – | – | – | – |
| Recycling (10) | – | – | – | – | cost_6 paper, cost_7 glass, cost_8 plastics, cost_9 metals, all in CUR/t |

Recycling revenue inputs (ui.r:1062-1071) are `numericInput(value NA, min 0, max 1, step 0.05)`. A **max of 1 CUR/t** contradicts the help text, which quotes 80/50/300/250 USD/t.

### 5.2 Annualised investment (annuity, the same code in 5 places)

The code is at server.r:2368-2381 (Collection), 2410-2427 (Incineration), 2475-2492 (Composting), 2539-2552 (Landfill) and 2709-2722 (MRF).

```
i = rate/100 ; n = years ; P = investment
AIC = (i == 0) ? P / n : P·(1+i)^n·i / ((1+i)^n − 1)        # capital recovery factor
```

- If Incineration or Composting is inactive, AIC = 0.
- If the MRF is inactive, P = n = i = 0, so AIC = 0/0 = NaN. It is dropped later by `na.rm` / `is.finite`.
- If n = 0, the result is Inf. The UI shows a warning only (server.r:1531-1584).

### 5.3 Specific costs and totals

| process | specific investment [CUR/t] | specific operating [CUR/t] | denominator | annual total | refs |
|---|---|---|---|---|---|
| Collection | cost_12 / W1 | cost_1 / W1 | W1 (flow 5) | TCWCT = sum(AICTC, cost_1, na.rm) | 2384-2405 |
| Incineration | cost_21 / (RDF + WI) | cost_10 / (RDF + WI) | flows 8 + 27 | TCWI = sum(AICWI, cost_10, −cost_24, na.rm) | 2430-2463 |
| Composting | cost_15 / (Org + WC) | cost_3 / (Org + WC) | flows 12 + 17 | TCC = sum(AICPC, cost_3, −CMP·cost_4, na.rm) | 2496-2532 |
| Landfill | cost_25 / (CR + MR + D1 + IRes) | cost_5 / same | flows 4, 18, 19, 23 (**excludes CU**) | TCLFD = sum(AICL **+** cost_5, na.rm) | 2555-2577 |
| MRF | cost_18 / WR | cost_2 / WR | flow 7 | TCMRF = sum(cost_2, AICMRF, na.rm) | 2699-2740 |
| Informal dumping | – | SOCD = cost_11 / D2 | flow 3 (D2 only) | TCIFD = cost_11 | 2589-2607 |
| Open burning | – | – | – | TCOB = 0 (constant) | 2467 |
| Recycling | – | – | – | TCR = ReT·(SPB·(−cost_6) + SG·(−cost_7) + SP·(−cost_8) + SCM·(−cost_9)); not NA-safe | 2654-2657 |

- The specific "investment" cost is total investment divided by annual tonnage. It is **not** the annualised cost divided by tonnes (see the help text at server.r:186-187).
- No "full cost per tonne" indicator is produced.
- Total `TAC = TCWCT + TCWI + TCC + TCLFD + TCIFD + TCR + TCMRF` (server.r:2743-2746) is **not used**.
- The displayed total (server.r:2778-2781) is `sum(per-process totals, na.rm = TRUE)`. Costs are positive and revenues negative.

---

## 6. Result tables

1. **Mass flows** (`fl_sum`, server.r:4059-4064, 4089-4092; export at 4101-4106). Columns: `Code | Mass Flow | [t/yr]` (signif 3). Flow 29 is excluded. Per-process output tables come from source_fl (server.r:4075-4086).
2. **TC summary** (`tc_sum`, server.r:4066-4073). Columns: `Process | Mass Flow (TC text) | TC` (round 3).
3. **uPOP** (`pop_tab`, server.r:3693-3697). Columns: `from process | to environment | mg TEQ/year`.
4. **GHG** (`ghg_tab`, server.r:3666-3670). Columns: `Process | ton CO2eq/year`.
   - Rows: Waste Collection, Landfill, Informal Dumping, Open Burning, Fires at LF/Dumpsites, Recycling, Composting, Incineration, and "Total annual GHG emissions".
   - Each value is rounded with `signif(.,2)`. Zero rows are dropped.
5. **Costs** (`cost_tab`, server.r:3672-3677). Columns: `Process | <CUR> per year`. One row per process total (signif 2) plus "Total annual costs". Rows that are zero or NA are dropped.
6. **Cost detail** (`cost_all` → `cost_detail` / `cost_specific`, server.r:2795-2898, 3173-3197). Columns: `Process | Type of Costs | value`.
   - Types: Annual Operation Costs, Annual Investment Costs, Specific Investment Costs, Specific Operation Costs.
   - Only finite values > 0 are kept, and only for active processes. Revenues are not shown here.
7. **System table** (`sys_tab`, server.r:3699-3706). Columns: Code and label of the active flows, excluding flows 29 and 21.

---

## 7. Bugs, inconsistencies, hard-coded constants and quirks

1. **IFD uPOP subtracts the constant 36 instead of CU** (`[[1]]` returns `id_fl`), at server.r:1901 and 1917.
2. **Incineration GHG precedence.** With energy recovery, the fossil CO2 from plastics is dropped entirely, leaving only the −0.35 credit (server.r:2040-2043). The likely intent is `PCWI·2.5·A + A·IWER·(−0.35)`.
3. **The GHG total excludes landfill/dumpsite fires.** `TAGHG` omits GHGLFF (server.r:2359). The displayed table total does include it.
4. **TCLFD loses data.** `sum(AICL() + cost_5, na.rm=TRUE)` uses `+`, so the landfill total becomes 0 if either term is NA (server.r:2575). Every other process total uses a comma-separated `sum()`.
5. **TCR is not NA-safe.** If any recycling price is NA, the recycling total is NA and is silently dropped from the table (server.r:2655).
6. **Climate gap** at ATY > 20 with APY = 400 makes the app crash (server.r:2125, 2131).
7. **DOF_ID with no climate data** is 0.7 without the MCF multiplier, while DOF_LF uses 0.7 × x (server.r:2318 vs 2233).
8. **Landfill methane ignores IRes.** The landfill methane basis (server.r:2252-2257) also ignores the biodegradation slider tc_19, and the dumpsite basis ignores BR3.
9. **Methane is not linked to the mass-balance degradation.** The LGE1/LGE2 mass flows (tc_16/tc_19) and the methane formula are independent.
10. **Fire residues** BR1 and BR2 are shown but excluded from the LF/IFD inputs and stocks, so mass is not conserved (server.r:1773, 1788).
11. **BR2 reuses the LF value.** TC for BR2 = `tc_30` (0.3) instead of its own default (server.r:1733). tc_30 itself is hard-coded with no UI.
12. **Leakage to waters** (LW) is routed to process 13 "Products" (server.r:286). It has no uPOP or GHG impact.
13. **Swapped downloads.** The download handlers for specific and detail cost tables write each other's data (server.r:3760-3772).
14. **Reload bug.** The reload code reads `reloaded_data$op_11..op_14` instead of `pop_11..pop_14`, so the POP emission factors are not restored (server.r:4321-4324).
15. **Unused totals.** `TAC` and `TAGHG` are computed but never displayed. The displayed totals are sums of `signif(.,2)`-rounded values.
16. **Missing sum checks.** Sums > 1 of the composition shares (pop_2 + pop_3, pop_7 + pop_8, ghg_7..9) produce negative hazardous or metal shares. These only show a warning and are not blocked.
17. **Specific cost denominators differ:**
    - landfill excludes CU;
    - dumping uses D2 only;
    - incineration includes RDF.
    The specific investment cost is not annualised.
18. **Revenue inputs** have `max = 1` CUR/t (ui.r:1062-1071).
19. **MRF inactive** gives an AIC of 0/0 = NaN, which is silently dropped.
20. **Hard-coded constants:**
    - diesel 0.0026 t CO2e/L;
    - plastics 2.5 t CO2/t and 0.7 factor;
    - DOC 0.16 / 0.40;
    - F = 0.5;
    - GWP 28;
    - recycling credits −0.15 / −0.30 / −1.50 / −1.80;
    - energy recovery −0.35 and RDF in industry −0.55;
    - composting 0.056 / 0.245 / 0.648;
    - compost uPOP 5 / 50 × 0.65;
    - kiln uPOP 3;
    - LF/IFD uPOP 5 / 0.5 / 0.05 (water) and 500 / 50 / 5 (residue);
    - fire residue TC 0.3.
21. **Commented UI range.** The commented-out UI in server.r actually spans lines 587-1203, not 587-1660.

---

## 8. Reference values (defaults, all optional processes selected, no climate data)

These values come from the Python port, not from an R run. The inputs are:
- waste_in = 1000 t/yr;
- tc_4 = tc_5 = tc_22 = 0, so the MRF, composting and incineration plants receive 0 t.

**Flows [t/yr]**

| flow | value | flow | value | flow | value |
|---|---|---|---|---|---|
| W1 | 460 | W2 | 140 | W3 | 400 |
| D1 | 460 | D2 | 200 | WoB | 200 |
| BR3 | 40 | OBE | 160 | LW | 0 |
| WB2 | 96 | Re4 | 2.4 | CU | 0 |
| LGE2 | 49.56 | LS2 | 92.04 | WB1 | 115 |
| Re2 | 4.6 | LGE1 | 102.12 | LS1 | 238.28 |
| BR1 | 34.5 | BR2 | 28.8 | EFLD | 147.7 |
| ReT | 147 | | | | |

**uPOP [mg TEQ/yr]**

| item | value |
|---|---|
| Open burning, air | 8.0 |
| Open burning, land | 0.2 |
| Fires, air | 63.3 |
| Fires, land | 2.11 |
| Landfill, water | 0.023 |
| Landfill, residue | 2.3 |
| Informal dumping, water (as coded, with the −36 bug) | 0.0102 |
| Informal dumping, residue (as coded, with the −36 bug) | 1.02 |

**GHG [t CO2e/yr]**

| item | value |
|---|---|
| Collection | 2.6 |
| Open burning | 35.0 |
| Fires | 36.925 |
| Landfill (DOF 0.7) | 604.91 |
| Informal dumping (DOF 0.7) | 144.44 |
| Recycling | −124.58 |
| Sum including fires | 699.3 |

**Scenario B**

Inputs: tc_4 = tc_5 = tc_22 = 0.1, ATY = 19, APY = 350 (cl_3), LFG collected = 30 %.

| item | value |
|---|---|
| WR | 46 |
| RDF | 9.2 |
| Org | 16.1 |
| IRes | 11.04 |
| D1 | 322 |
| Incineration GHG | 13.8 t |
| Composting GHG | 3.478 t |
| Landfill GHG (DOF 0.5) | 226.98 t |
| Dumping GHG (DOF 0.525) | 108.33 t |
| Incineration uPOP, air | 193.2 mg |
| Incineration uPOP, residue | 4.14 mg |
| Compost uPOP, product | 0.1665 mg |
