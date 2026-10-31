# Original electrical CAD generator

This directory is the isolated task-9 deliverable. It contains original mechanical design and original vector geometry. There are 22 runtime types, including the supplemental procedural `elcap`.

Allowed input extraction is limited to electrical requirements in `docs/ownership/cad-coverage.json` and electric type parameters/terminals/controls in `docs/ownership/baseline.json`. The derived `requirements.json` contains no historic vertices, images, GLB, gzip payload or original modeling implementation. Every manufacturing dimension is declared in `design-specs.json` or the original `build.py` source.

Run from the repository root:

```powershell
& 'C:/Users/Administrator/AppData/Local/Programs/Python/Python313/python.exe' -X utf8 -B tools/owned-cad-electric/build.py
& 'C:/Users/Administrator/AppData/Local/Programs/Python/Python313/python.exe' -X utf8 -B tools/owned-cad-electric/verify.py --write
```

`out/<type>/scene.json` follows `owned-cad-scene/1`, units millimetres, Z up. `encoding.version` is `typed-arrays/1`: `posB64` encodes packed little-endian Float32 xyz; `idxB64` encodes packed little-endian Uint32 triangle indices. Count, byte length and raw typed-array SHA256 fields accompany each mesh. Runtime scene transport totals 15,923,136 bytes for all 22 types; every type stays under 60,000 triangles. GLB is optional preview only. Material colors are sRGB 0..1, never texture references. Scene names are unique and functional group IDs stable. Every part is exported as a closed STEP solid or compound; topologically separate touching glyph strokes and winding turns retain separate closed shells.

The assembled `group.step` and GLB are presentation assemblies. `parts/*.step` and `groups/*.step` are in the same coordinates as their corresponding scene meshes. Static meshes use component construction coordinates. Dynamic mesh vertices are relative to `manifest.dynamicGroups[].pivot_mm`; the runtime must mount those meshes under their own pivot group. `assemblyOffset_mm` reconstructs the initial presentation but is not a substitute for the dynamic interface.

Terminal `p` and `d` are construction coordinates, with `p` the axial bore mouth center and `d` outward along the post axis. For a rotational dynamic group, the complete rule is `pivot + R * (p - pivot)`; for translation it is `p + currentTranslation`. Then apply the instance transform. For `capacitor` terminal B, evaluate `plateB`'s current translation every frame, including intermediate animation values. CAD-to-runtime conversion is `[x,y,z] mm -> [x,z,-y] * 0.001 m`.

New coordinates fill historical unknowns as explicit independently designed anchors. They do not assert compatibility with unknown historical geometry. Public terminal IDs, polarities, explicit meter y/z/d values, motion axes/pivots and functional ranges are retained. The runtime adapter must bind these new contracts.

Every terminal consists of a separately colored insulating collar, conductive through-bored shaft, intersecting cross bore, slotted pressure cap and lower conductive pin. The wire anchor is in the actual bore opening; adjacent annular contact is measured by solid and mesh point fixtures. Slotted screws, real winding turns, separate functional parts, thin shells and internal electrical manufacturing structure are modeled as BRep geometry rather than textures.

The verifier reimports actual STEP files, checks shell closure and positive volumes, reads exported GLB and scene triangles, checks mesh winding/watertightness, compares local dimensions and volumes, samples actual bores/slot walls and performs analytic primitive-oracle checks. It records terminal transforms for identity, translated, 37-degree and 90-degree fixtures plus motion extrema and midpoint. Passing this suite means local geometric validation only. Runtime integration, solver behavior, browser visual review and production performance remain explicit pending gates; `replacementReady` stays false.

No production, public assets, build output, services, git metadata or other workers' source is modified by this generator. It does not create or read external temporary geometry.
