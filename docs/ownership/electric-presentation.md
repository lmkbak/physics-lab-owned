# Owned electric presentation: contract and independent design

Status: draft for independent review. No implementation has started.

## Scope and factual sources

Write scope: `src/lab/owned/electric/schematic.js`, `standard.js`, `presets.js`; `tools/owned-electric/presentation.test.mjs`, `tools/owned-electric/presentation-preview.html` (lead-authorized test preview); this document. The worker does not change the kernel, production imports, shared logs, build output, services or git history.

Allowed requirements read: lead instructions; `docs/ownership/baseline.json` electric type/preset metadata and teaching requirements; public call sites in `src/lab/clbench/bench.js` (imports, task loading, updateSchematic and format rules). The earlier kernel task read public parts/preset data, but this task will not read old schematic or standard implementations or reference code. Original symbol paths, layout algorithm and explanatory wording will be written here; required electrical connectivity, IDs, ranges, controls and scientific conclusions are compatibility facts. No legal originality guarantee is asserted.

## Public interfaces

`renderSchematic(model, terminalPosition, partPosition)` returns `{svg,viewBox}`. `model.parts` has `{id,type,label,x,y,rot,params,state,live}`; `model.wires` has `{id,a:{p,t},b:{p,t},color,I}`. The callbacks receive `(pid,terminal)` and `(pid)` and return finite `[x,y]`. Missing callbacks/positions fall back to owned deterministic positions. Input models/callback results are never mutated. `svg` is an SVG fragment, not an outer SVG element; `viewBox` is a finite `x y width height` string. Empty input returns a visible instructional empty state with positive viewBox size.

`renderStandard(model,{termIn,live}={})` returns `{svg,viewBox,flows}` for a validated standard topology, or `null` to request bench's already supported physical-layout fallback. `termIn(pid,t)` returns current entering that terminal (bench sums wire currents with orientation); `live(pid)` returns current shared-solve report. Every `flows[k]` is a late-evaluated finite-current callback, not a captured stale reading. Missing data returns zero/visible dash without changing the model. A non-series-parallel bridge topology uses a general terminal-net graph layout with every edge retained; null remains available only for malformed/unsupported input so bench's existing fallback can operate.

Compatibility hooks:

- Each physical device appears exactly once as `<g class="part" data-part="escaped-id">`; multiple terminal symbols remain grouped under that identity. IDs and user labels are XML escaped. Groups include accessible names and >=44 SVG-unit selection hot areas.
- Each original physical wire has an overlay carrying `data-wire="id"`; standard routed flow overlays carry `data-flow="index"` and match an entry in flows. Physical wire flow orientation follows wire.a to wire.b. Standard flow orientation follows its first terminal to second and reads the matching `termIn` sign.
- All ammeter, voltmeter and galvanometer groups include a text element `data-read="part-id"`. Initial reading uses the live report with bench-compatible units/digits: microampere 0 decimals, range>=15 one decimal, otherwise two. Tiny negative values display positive zero. Bench remains able to replace textContent every frame.
- Inline scoped SVG styles provide .part focus/hover visibility and .wire/.flow presentation without production CSS changes. Symbols use vector-effect non-scaling-stroke. No new animation loop, global listener or network request is created.
- Keyboard selection must dispatch the group's click on Enter/Space in isolated validation; bench currently binds only mouse events. If delegated HTML event attributes are rejected as policy, provide an explicit optional binder export without altering the render signatures and identify the necessary lead integration point. No claim of keyboard integration is made before it is tested.

`PRESETS` exports exactly these IDs: blank, ohm, lamp-iu, emf, parallel, led, motor, rc, sensor, fuse, solenoid, plate. Each object has `{id,title,tag,desc,parts,wires,tips}`; parts have preserved id/type/parameter overrides and newly chosen x/y positions, wires preserve required endpoint/color connectivity. Text is independently written, including titles/tags/descriptions/tips. Parts/wires are explicitly authored from baseline facts; production runtime does not load the baseline JSON. No instructional detail is silently omitted.

## Independent symbol and layout design

All 22 type IDs receive explicit symbols: two sources, SPST, DPDT with both independent poles and off/A/B positions, lamp, LED, silicon diode, three fixed resistors, rheostat (A/B resistor and electrically shared C/D wiper), decimal resistance box, NTC, LDR, three meters with every range terminal, fuse, plate capacitor, polarized electrolytic, motor and solenoid. Switch/protection states are drawn visibly; burned/open elements retain their device selection identity and terminal pins. Symbols derive from common circuit conventions using independently chosen paths and dimensions, not copied SVG assets.

Physical mode uses callback centers and terminal coordinates, a uniform scale with minimum inter-symbol spacing, separate label lanes and exact terminal-to-wire anchoring. For each wire, compare orthogonal candidate routes with a deterministic route-cost function (length, body intersections, overlap) and choose a route with explicit bends. Connection dots are added only to actual shared endpoints; graphical crossings do not become electrical connections. All electrical terminals are labeled, particularly multi-range meters, DPDT and rheostat; no hidden terminal merger for easier drawing.

Standard mode first unions only actual wire-connected terminal endpoints. It builds a terminal-aware device graph; meter unused range ports remain visible, rheostat C/D are internally equivalent, DPDT preserves two poles and selected/off branches. Series reduction combines degree-two non-source nodes, parallel reduction combines edges sharing endpoints. The reduction tree drives independent horizontal series/vertical parallel placement with common buses and enough label space. Each visible original device is accounted for; no reduction may discard a visible meter, switch pole or branch. When reduction cannot form a two-terminal series/parallel tree, a general terminal-net graph ranking renders the complete multiport graph rather than dropping edges. A canonical connected loop, parallel branches, attached voltage meter and Wheatstone bridge must all render faithfully; null is reserved for malformed/unsupported graph input. Standard-mode technical annotations describe connectivity and parameter facts in original wording, not prescriptive claims of simulated outcomes.

## Teaching requirements retained

- blank: add/place devices, connect terminals by click or drag, rotate/delete/undo keyboard actions.
- ohm: maximum series resistance before closing; at least three U/I samples; external ammeter method voltage-meter shunting makes measured R lower, with larger relative influence for larger load resistance.
- lamp-iu: divider starts from zero; record about .2 V increments; use I-U data graph; resistance rises with voltage/filament temperature.
- emf: larger internal resistance makes voltage variation visible; at least five samples; U=E-Ir intercept/slope interpretation; avoid prolonged excessive discharge.
- parallel: S1 then S2; branch addition raises total current and lowers terminal voltage when source internal resistance exists; compare r=.1 ohm.
- led: A/B polarity reversal, reverse current is tiny rather than mathematically exactly zero; series 50 ohm limits current; removing it risks damage; compare color-dependent forward drops.
- motor: startup current falls as back EMF rises; locked rotor current U/R and heating; UI-I²R converts to mechanical power.
- rc: A charges through 500 ohm; nominal 4700 uF time constant about 2.35 s (approximately 2.4 s); B discharges through LED+50 ohm; .25 playback aids observation.
- sensor: NTC heating reduces R and brightens lamp; weaker illumination raises LDR resistance and dims LED; thermal/light control interpretation.
- fuse: S1 load current, S2 shunts lamp, overload heat/fuse opening, replacement and 2 A rating comparison.
- solenoid: A input defines B-end north pole by right-hand grip, B reverses poles, core/removal/current changes field strength.
- plate: charge/field, isolate then separate increases U at conserved Q, dielectric increases C; charge conservation applies only while isolated.

## Acceptance plan

Command: `node tools/owned-electric/presentation.test.mjs`.

1. Compare all preset IDs, per-device id/type/parameter override objects, and endpoint/color edge multisets against baseline data. Positions must be finite and newly arranged; authored title/description/tips must differ from baseline wording and cover the required numeric/scientific concepts above.
2. Instantiate every 22 type with default data and render both modes/fallback. Assert all .part/data-part identities, terminals, meter data-read, XML escaping, finite dimensions, no NaN/Infinity/undefined fragments and input immutability. SVG parse validation uses browser DOMParser in visual validation.
3. Known series/parallel/voltmeter topology and complete bridge graph layout; independent connectivity graph ensures no edge disappeared. Check late flow callback values/signs after changing termIn/live fixture values. Meter precision oracles cover -0.000001, +/-0.3 A, 15 V and 123 microampere.
4. Full 12 presets across default/A/B/off states preserve selectable identities/flow hooks. Run owned Simulation on newly authored presets for convergence/finite reports and selected teaching numeric oracles, without importing old implementation files.
5. Render an isolated preview for 390/1280/1920 CSS-pixel widths, inspect browser screenshots and accessibility tree, parse SVG and exercise selection/updated readings. No new server or production import change. If a preview artifact path is needed it requires lead's scope extension; otherwise a browser in-memory document is used.

Production integration and UI claims remain separate lead/reviewer gates. Contract approval precedes implementation.
