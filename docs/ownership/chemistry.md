# Independent chemistry kernel contract — task-5

Status: ownership-reviewer final candidate PASS received after independent stdout suite exit 0. Isolated chemistry kernel complete; production/browser integration is not claimed. No production import is authorized by this document.

## Provenance and boundary

Author: chemistry-worker. Requirement evidence read: tools/owned-content/baseline.mjs; docs/ownership/baseline.json chemistry inventory; src/lab/glowbench/bench.js and items.js solely for C.* consumer interface; subsequently Lead-authorized src/lab/glowbench/demo.js solely for black-box experiment doses/time/completion behavior (the test imports DEMOS without copying choreography). Do not read existing glowbench/chem.js, _ref, or original reaction prose/parameters. Implementation is newly authored from balanced chemical equations and documented teaching approximations. Scope: src/lab/owned/chemistry/**, tools/owned-chemistry/**, this document. No common log, full build, server, git, or production import edits.

## Public contract

Exports SPECIES metadata {label, solid, color, chunk} with all baseline species IDs; REAGENTS (43 exact inventory IDs, compatible id/name/formula/bottle/amber/conc/solid/portion/fun); REAGENT_BY_ID; FLAME_COLORS {color,name,ion}; REACTIONS {title,eq,obs,color}. Color components are normalized RGB arrays. appearance includes requested colorRGB/pptRGB and consumer aliases color/ppt.

createMixture(vol=0) creates finite nonnegative vol, s in mmol, T=25°C, gas={H2,O2,CO2,NO2,NO}, fx={H2,O2,CO2,NO2,NO,boil,sodium,potassium,heat,steam,lum,foam,bread,snake,thermite,volcano}, seen, age={FeOH2:0}, ind, crystals:null. Additional auditable accounting fields track solvent water, cumulative reaction heat, externally supplied energy and gases not represented in the legacy gas view. They are conserved on take/merge.

fromReagent(id,vol): solution mol/L × mL = mmol; solid portions do not require volume. water(vol), isSolid(k), equilibrate(m,events), step(m,dt,{heat,stir})=>events, pH(m), appearance(m), composition(m,n=5), take(a,mL) mutating source, merge(a,b,events=[])=>events, clear(m), flameIon(m) returning ion ID. Events contain key/title/eq/obs/color plus reaction extent and heat evidence. take distributes suspended precipitate and chunks proportionally; zero-volume dry portions require explicit solid handling and cannot invent fluid.

## Reaction model and scientific boundary

A single stoichiometric extent executor consumes reactants and produces products from signed coefficients. Atom/charge metadata and independent test oracle validate every equation. Water is explicitly accounted in mmol independently of carrier volume; gas is accounted in a closed computational ledger, while gas/fx expose UI observations. No product is emitted solely to trigger visuals. Kinetics integrate with bounded substeps and exponential extent; instantaneous equilibria are iterated separately. Heat release ΔH (kJ/mol numerically J/mmol) changes temperature through explicit heat capacity; external heat and evaporation latent heat enter separate accounting. Unspecified ΔH is documented as zero teaching approximation, not asserted measurement.

Required families: neutralization; Zn/Mg/Fe + acid H2; carbonate acid CO2; Zn/Fe/Mg displacing Cu and Cu displacing Ag; metal reduction Fe3+; AgCl/BaSO4/BaCO3/CaCO3 and metal hydroxide precipitation plus acid dissolution; Al hydroxide/aluminate amphoterism; FeSCN complexation; MnO2/I- catalyzed H2O2; acidic permanganate oxidation; iodine starch optical association; Na/K water; concentrated/dilute nitric acid Cu; CuOH2 thermal decomposition; FeOH2 air oxidation with explicit environmental O2 input; Mg burning with explicit environmental O2; evaporation/reversible salt crystallization; phenolphthalein/litmus; Na/K/Ca/Cu flame observations; luminol, toothpaste, iodate/bisulfite clock, sucrose dehydration, mercury-thiocyanate snake and thermite/ammonium-dichromate volcano. Fun chemistry uses balanced lumped products where molecular detail is outside a school simulator, explicitly annotated. Snake products retain Hg/S/C/N atoms rather than creating undefined ash mass. Thermite is represented by a weighed stoichiometric composite input, not hidden creation of metal.

Acid/base pH solves electroneutrality with Kw and carbonate/bisulfite/sulfate equilibria at 25°C; ideal dilute activities and operational concentrated-acid display are explicit approximations. Indicator optical changes do not consume bulk ions. Evaporation crystallizes known ion pairs into identified solids; legacy salt maps to NaCl only.

## Observable acceptance gates

1. Inventory equality: all 43 IDs and all baseline species IDs, complete metadata, finite fresh state; every reagent creates meaningful species without invented liquid for dry solids.
2. Every reaction table row passes an independent element and charge balance oracle, including solvent/environment and explicit composite formulae. No negative reactant inventory.
3. Neutralization limiting reactant, ΔH temperature rise, solvent water and charge; pH independent analytic strong acid/base, neutral water, carbonate and dilution cases.
4. Take/merge conserves volume, every species, gases, solvent, heat/thermal energy, indicator, precipitates, chunk inputs; clear resets every transient/ledger field. Tests include zero volume, dry solid, full transfer, washed precipitate and repeated reset.
5. Kinetic comparison dt=0.2/0.02 over identical duration with strict quantitative tolerance; dt=0 and zero volume are finite; no arbitrary one-second clamp discards elapsed time.
6. 22 explicit independent experiment scenarios keyed to exact baseline demo IDs: thermite, toothpaste, luminol, snake, bread, clock, volcano, k, na, feoh2, aloh3, flame, o2, h2, co2, fe3, cuhno3, agtree, mg, cuoh2, evap, starch. Each asserts named reaction extent/product/optical or fx evidence, not just an event string. Additional concentrated/dilute nitric branching, metal displacement, permanganate, all precipitate classes, acid dissolution, indicators and gas tests have quantitative assertions.
7. Local command only: node tools/owned-chemistry/test.mjs. It prints a machine-readable evidence report to stdout (optional --write-report writes under tools/owned-chemistry) and fails nonzero on any hard gate. Reviewer re-runs independently before replacement approval.

## Numeric hard gates and demo matrix

Atom and charge equation coefficients must balance exactly (integer arithmetic). Runtime ledger comparisons: mmol absolute 1e-9 + relative 1e-8; carrier volume mL absolute 1e-8 + relative 1e-9; no species below -1e-12 mmol (round-off cleanup only below 1e-12, never a substitute for limiting extent). Transfer tests repeat 100 take/merge cycles and compare all species, water, gases and energy under the same bounds. dt=0 returns [] and leaves the entire serialized state byte-identical, including seen/fx/age. Invalid/negative dt also does not advance state.

pH analytic oracle: absolute error <=1e-4 for ideal strong acid/base/water and carbonate equilibria at 25°C in the declared dilute model. Temperature oracle: <=1e-6°C for isolated neutralization using documented -57.3 kJ/mol and explicit heat capacity. Kinetic gate: dt=0.2 vs 0.02 for equal simulated durations; species/gas/reaction heat discrepancy <=1% of initial characteristic mmol/heat (plus 1e-9 absolute); same completion/positive product state in all 22 scenarios. FLAME metadata covers Na+, K+, Ca2+, Cu2+, Ba2+ and observable priority is explicit. Test defaults to stdout-only report; --write-report optionally writes scoped JSON.

| Demo ID | Input and vessel/tool dependency | Required evidence |
|---|---|---|
| thermite | thermite dry composite, heated crucible | Fe + Al2O3 stoichiometric products, positive thermite fx and reaction heat |
| toothpaste | H2O2c + KI + soap, cylinder | H2O2 decreases, O2 grows, I- unchanged, foam fx |
| luminol | luminol + H2O2 + K3FeCN6, beaker | balanced aminophthalate/N2 products and lum fx; no catalyst consumption |
| snake | HgSCN2, heated dish | HgS + carbon nitride + CS2 atom ledger, snake fx |
| bread | sucrose + H2SO4c, beaker | C and H2O stoichiometry, sucrose depletion, bread/steam fx |
| clock | KIO3 + HSO3 (baseline premix explicitly contains starch), beaker | induction without persistent I2 then HSO3 exhaustion, I2/starch optical blue |
| volcano | dichromate, heated dish | Cr2O3 + N2 + H2O stoichiometry, volcano fx |
| k | K + water, dish | K+, OH-, H2, potassium fx |
| na | Na + water, dish | Na+, OH-, H2, sodium fx |
| feoh2 | FeSO4 + NaOH, tube | FeOH2 then oxygen-supported FeOH3; explicit air input ledger |
| aloh3 | AlCl3 + controlled NaOH then excess NaOH, tube | AlOH3 precipitate then AlO2- with atom-balanced water |
| flame | NaCl/KCl/CaCl2/CuSO4/BaCl2, loop + flame | five ion IDs and finite RGB/name/ion metadata |
| o2 | H2O2 + MnO2, tube + glowing splint | H2O2 depletion, O2 and O2 fx; MnO2 unchanged; relight metadata |
| h2 | Zn + HCl, tube + igniter | Zn2+ and H2 stoichiometry; H2 fx and pop metadata |
| co2 | CaCO3 + HCl, tube + burning splint | Ca2+, CO2 and CO2 fx; douse metadata |
| fe3 | FeCl3 + KSCN then Fe, tube | red FeSCN association then reduction restores SCN and produces Fe2+ |
| cuhno3 | Cu + HNO3c, tube | Cu2+ + NO2, no H2; dilute control produces NO |
| agtree | Cu + AgNO3, tube | Cu2+ and twice molar Ag deposit |
| mg | Mg, heated spoon in air | MgO and heat, explicit O2 input ledger |
| cuoh2 | CuSO4 + NaOH then heat, tube | CuOH2 then CuO + H2O |
| evap | NaCl + controlled heat, evaporation dish | vol reduction, solvent vapor accounting, NaCl salt crystals and ion balance |
| starch | I2 + starch, tube | iodine/starch unchanged bulk amounts, blue optical association |

## Implemented artifacts and scientific references

- `src/lab/owned/chemistry/data.js`: 43 reagent definitions, 78 species including all baseline IDs and explicit HCO3-, physical/optical metadata and five flame ions. Baseline concentrations and solid mmol maps are interface/inventory requirements; optical/rate parameters and the new equations are independently authored teaching choices.
- `src/lab/owned/chemistry/reactions.js`: 60 newly authored signed stoichiometric rows, titles, equations and observations. Every row is checked against a separate formula/charge list in `tools/owned-chemistry/oracle.mjs`.
- `src/lab/owned/chemistry/chem.js`: conservation executor, equilibrium/kinetics, optical observations, transfer/reset and explicit water/gas/environment/energy bookkeeping.
- `tools/owned-chemistry/scenarios.mjs`: all 22 named baseline experiment recipes, independent product ratios/optics/fx assertions and closed atom/thermal ledger comparisons.
- `tools/owned-chemistry/test.mjs`: read-only stdout default; `--write-report` writes `tools/owned-chemistry/evidence.json`. No production or original module import is used.

Scientific checking references (facts and equations only, no code/parameter source): [OpenStax reaction classes](https://openstax.org/books/chemistry-2e/pages/4-2-classifying-chemical-reactions), [OpenStax calorimetry](https://openstax.org/books/chemistry-2e/pages/5-3-calorimetry), [OpenStax acid/base equilibria](https://openstax.org/books/chemistry-2e/pages/14-3-relative-strengths-of-acids-and-bases), [Purdue demonstration descriptions including sugar dehydration and dichromate volcano](https://chemed.chem.purdue.edu/demos/demosheets/5.21.html), [University of Illinois luminol demonstration](https://chemdemoroom.web.illinois.edu/demos/luminol.pdf), [RSC clock reaction context](https://edu.rsc.org/experiments/the-old-nassau-or-halloween-clock-reaction/1704.article). The RSC Old Nassau recipe is chemically different and is only clock-induction context; our iodate/bisulfite net equations are explicitly balanced and tested locally.

## Teaching approximations, explicit model limits

This is a deterministic classroom simulator, not a general thermodynamic or hazardous-process predictor. All rates, ignition cutoffs, display colors and effective thermal geometry are independently selected teaching parameters. Solubility is an idealized complete precipitation model with no Ksp depletion tails; salt crystallization uses constant 25°C equivalent saturation values. FeSCN uses only the single-ligand K=140 L/mol ideal equilibrium. AlO2- is the compatibility species for aqueous aluminate; hydrated coordination is represented by balanced solvent water. The sulfuric stock is stored as neutral H2SO4c until dilution below the documented 4 M threshold or neutralization; pH accounts its acid equivalents. Concentrated ionic activities, hydrolysis of metal aquo ions, sulfate's first proton, hydration enthalpies and temperature-dependent Kw are outside this model. pH oracle applies to ideal dilute strong acid/base, water and carbonate at 25°C; concentrated displays are operational model values.

Solvent accounting uses 55.508 mmol H2O/mL carrier liquid regardless of solute displacement, a teaching approximation preserved during transfer. Carrier vol is reduced only by explicit evaporation; reaction-generated water affects solvent/heat/atoms but not automatically geometric fill volume. Gas stays in a closed ledger for reaction and gas-test evidence; only O2 required for actual air-consuming extent enters the environment ledger, and it cannot falsely register as oxygen made by the reaction. Carbonate has explicit CO3²⁻/HCO3⁻ first protonation before HCO3⁻ + H⁺ produces CO2. The pH solver includes the total remaining dissolved inorganic carbon with its full charge equivalent; expelled CO2 is kept in the gas ledger and removed from dissolved buffering (open-headspace approximation, no Henry-law reabsorption). Independent titration tests cover 0/.5/1/1.5/2 acid equivalents including the amphiprotic bicarbonate point. Gas-escape diffusion and NO oxidation after leaving the vessel require a future external gas-flow model and are not fabricated.

Thermal model: solvent heat capacity 0.0753 J/(mmol K), lumped solute/solid heat capacity 0.06 J/(mmol K), latent water heat 2257 J/mL, external `heat` is supplied directly in W, matching bench heatPower (e.g. tripod 230 W). Convection uses 8 W/(m² K), emissivity .8 with Stefan–Boltzmann radiation; effective area is .005 m² for wet vessels and 1e-5·max(.02,total solute mmol)^(2/3) m² for a dry sample. Implicit radiative cooling enters `energy.loss` explicitly. This avoids unphysical unlimited dry temperatures without silently clipping energy. Neutralization uses -57.3 kJ/mol; H2O2 -196 kJ per 2 mol; Mg combustion -1203.2 kJ per 2 mol; thermite -851.5 kJ; dichromate -429 kJ; Na/K water and Zn/Mg/Fe acid use explicitly recorded approximate heats. Other rows set dH=0 as unknown teaching heat, including luminol and sugar dehydration; their glow/steam cues are extent-derived visual teaching effects and are not measured quantum yields or vapor mass. Expanded solvent stays liquid unless the explicit evaporation model moves it to vapor.

Mercury thiocyanate uses the balanced lump 2Hg(SCN)2 → 2HgS + C3N4 + CS2; actual thermal chemistry has multiple pathways, so this is explicitly an atom-preserving approximation. CS2 air oxidation retains CO2/SO2 and atmospheric oxygen. Thermite's input unit formula Al2Fe2O3 is a stoichiometric composite packet, not a molecular species. Starch uses one C6H10O5 repeat unit; litmus and soap are documented neutral equivalent units to conserve material during transfers, with no fictitious reaction products. Indicator/iodine-starch optical association leaves bulk amounts unchanged. Luminol uses a balanced net oxidation yielding dianionic aminophthalate plus nitrogen; catalyst is not consumed.

## Verification receipt

Worker command: `node tools/owned-chemistry/test.mjs --write-report` (local scope only), exit 0. Full gate passes 43 exact reagent IDs and solid maps, 60 integer-balanced reactions, 78 species, 22 independent product scenarios plus all 22 actual baseline DEMOS doses/time/fast/until recipes through `tools/owned-chemistry/bench-contract.mjs`. The real demo adapter operates only the public chemistry and minimal in-memory vessel/tool boundary; it does not claim GPU, gesture or visual acceptance. Quantitative evidence is in `tools/owned-chemistry/evidence.json`. Public dt=.2/.02 tests both use the same bounded .01 internal mesh and establish chunk invariance; separate independent first-order peroxide and constant solid-front analytic solutions establish kinetic integration correctness. `ignite=0` and `burning=false` are retained/reset compatibility state. Solid heat decomposition uses finite zero-order front extents bounded by reactants for exact completion, rather than indefinite exponential tails. Actual demo smoke gates pass every original until predicate, including dry thermite, snake, volcano, bread, clock, FeOH3, CuO and evaporation. Reviewer independently executed stdout-only `node tools/owned-chemistry/test.mjs`, exit 0, and verified the 1-equivalent carbonate point pH=8.3470756725, HCO3-=1 mmol, CO2=0. Final result: candidate PASS. Actual DEMOS tests use a stub public vessel/tool API and are not browser pouring/heating/gas-test interaction acceptance. No full build, service, git, original chemistry source read, or production module replacement was performed.
