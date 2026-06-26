# CheckGlyphs

**CheckGlyphs reads the chromatic behavior of a Check and transduces it into a deterministic 5×5 glyph system.**

## A transduction study

My practice is naturally drawn to transduction: the passage of information from one form into another.

A translation usually replaces one sign with another. A transduction changes the medium while attempting to preserve the relations that made the source what it was. CheckGlyphs does not redraw Checks, imitate their surface, or attach an unrelated decorative symbol. It reads the ordered colors, temporal intervals, perceptual changes, closures, rhythms, and on-chain position already present in the source.

Glyph Engine 2.3 treats chromatic behavior as a **morphological field**, not as one compulsory silhouette. The field defines which kinds of signs, densities, balances, and topologies are admissible. Stable on-chain identity then resolves one deterministic glyph inside that field. This preserves semantic kinship without forcing every Check with the same Color Band to become the same symbol.

The resulting glyph is not a miniature copy of a Check. It is another legible state of the same information.

## How it works

### 1. Source retrieval

The user enters a Checks token ID. CheckGlyphs first requests the official `tokenURI(uint256)` from the Checks contract through a rotating set of internal public Ethereum RPC endpoints.

For an active Original, the metadata resolves to its official on-chain SVG. If the token was once minted but later burned through compositing or sacrifice, `tokenURI()` can revert even though the historical visual data remains reconstructible. In that case, CheckGlyphs attempts a direct contract-level SVG read and accepts the result only when it contains the structural markers of a revealed Original. IDs that never migrated from Editions are not treated as historical Originals.

The RPC endpoint is only a transport layer. It does not participate in the glyph seed and cannot alter the output.

### 2. The Check as a chromatic signal

Each Check inside the SVG contains an ordered color sequence and, when available, SVG `keyTimes`. For Check `j`, the engine models this as a piecewise chromatic signal:

```text
Cⱼ(t),  t ∈ [0, 1]
```

`Cⱼ(0)` is the first visible source color. Intermediate values are reconstructed from the SVG timing data by piecewise RGB interpolation. If valid `keyTimes` are absent, the source colors are placed at equal temporal intervals.

Glyph Engine 2.3 samples `Cⱼ(t)` at 25 normalized times and converts those samples to CIELAB. The behavior descriptor includes:

- total perceptual activity and mean step size;
- rhythmic roughness of the ΔE sequence;
- endpoint closure and net directionality;
- turning between consecutive Lab displacement vectors;
- number and temporal position of change peaks;
- center of chromatic change over time;
- irregularity of the SVG timing intervals;
- luminance drift and luminance motion;
- source-color complexity.

The exact source signature remains in the DNA record, and the original signal still determines every rendered color. It is not used as an avalanche hash for high-level morphology. A one-unit RGB edit or a sub-frame timing edit therefore normally remains inside the same chromatic field.

### 3. Morphological field and individual realization

CheckGlyphs separates two deterministic layers:

- **chromatic field** — the 25-sample behavior descriptor, ordered timing, and global traits such as Speed, Shift, and Gradient;
- **individual realization** — contract address, token ID, local Check index, and bounded collision retry.

The chromatic field determines an admissible neighborhood:

- a primary family and nearby compatible families;
- a density envelope;
- symmetry tendencies;
- continuous, accented, or split topology;
- directional and interior tendencies.

Individual identity selects an archetype, transform, density realization, symmetry realization, topology realization, and controlled accent **inside that neighborhood**. It cannot jump to an unrelated chromatic field, but it is intentionally strong enough to prevent a uniform Color Band from collapsing into one repeated silhouette.

This gives the engine its central relation:

```text
same behavior  → same morphological field, multiple compatible glyphs
similar behavior → neighboring fields and usually similar constraints
different behavior → structurally different admissible regions
```

No `Math.random()` or runtime entropy is used. All choices are reproducible.

### 4. Morphology on a 5×5 lattice

Every glyph lives on the finite lattice:

```text
G = {0, 1, 2, 3, 4} × {0, 1, 2, 3, 4}
```

This gives exactly **25 possible cell positions**. A glyph is a subset of `G`; positions outside that subset remain transparent.

A four-cell schematic glyph can be written as:

```text
· · · · ■
· · · ■ ·
■ · ■ · ·
· · · · ·
· · · · ·
```

The vocabulary is organized as **13 overlapping morphological fields**:

```text
monolith · gate · mask · fork · altar · bar · knot
stair · chamber · scatter · emblem · rune · composite
```

They are fields rather than sealed template folders. Each contains a weighted set of compact epigraphic archetypes and overlaps with semantically adjacent families. Stillness anchors the `bar` field; closure favors `gate`, `chamber`, `mask`, or `knot`; directional tracks favor `stair`, `monolith`, or `rune`; multiple peaks favor `fork` or `altar`; irregular high-activity tracks favor `scatter` or `composite`.

The construction sequence is:

```text
behavior descriptor
→ chromatic field
→ compatible realized family
→ epigraphic archetype
→ orientation and symmetry
→ density realization
→ interior and controlled accents
→ topology and balance validation
```

The active density range is deliberately broad. Valid glyphs can contain **2 to 12 visible cells**, with minimal and sparse signs treated as first-class outcomes rather than failures to be filled. The engine also permits controlled detached accents or paired components when the field allows them. It limits a glyph to three components and two isolated accents, avoiding random debris while preserving the punctuation, interruption, and empty space characteristic of a real glyph vocabulary.

The archetype bank encodes principles—bars, stems, forks, gates, chambers, crowns, corners, broken modules, satellites—not a fixed catalogue of finished symbols. Rotation, reflection, density fitting, topology, and identity resolution generate a much larger deterministic vocabulary.

### 5. Deterministic collision control

Within one token, the engine records each completed silhouette signature. If a new Check produces an already-used silhouette, the retry salt selects another admissible realization inside the same field.

The process is capped at **18 attempts**. A retry may change the local archetype, compatible family, density realization, orientation, or accent, but it cannot leave the field encoded by chromatic behavior. If the admissible neighborhood is exhausted, semantic coherence remains more important than arbitrary uniqueness.

This policy allows an 80-Check uniform band to produce a diverse alphabet while keeping all 80 glyphs recognizably related.

### 6. Chromatic origin and traversal

Once the morphology is fixed, the first visible cell in normal row-major order becomes the recognition anchor. It always receives the exact initial source color `Cⱼ(0)`.

The traversal visits every visible cell exactly once. It prefers orthogonal continuity and searches for a Hamiltonian path when the topology permits one. Accented or split glyphs may require intentional jumps between components; those jumps are part of the morphology rather than rendering errors.

If the glyph contains `n > 1` visible cells, their normalized sample times are:

```text
tₖ = k / (n − 1),  k = 0 … n − 1
```

For a one-cell mathematical case the only sample would be `t₀ = 0`, although Engine 2.3 currently enforces a minimum of two rendered cells. The cell reached at step `k` receives `Cⱼ(tₖ)`. The morphology determines the spatial sentence; the source animation determines its chromatic reading.

### 7. Layout and rendering

When the official SVG exposes exact Check transforms, CheckGlyphs preserves their source positions and scales. The transduced glyphs remain embedded in the fixed **8×10 Checks field**, allowing the original count structures—80, 40, 20, 10, 5, 4, and 1—to remain spatially recognizable.

The same deterministic geometry feeds two renderers:

```text
glyph data ─┬─→ Canvas renderer → PNG
            └─→ SVG renderer    → static SVG
```

The SVG is generated directly from rectangles and lines; it is not a traced bitmap. Glyph cells have no perimeter stroke. The interface also exposes the chromatic path in two forms:

- **Steps** — discrete temporal samples mapped to visible cells;
- **Band** — the continuous source track reconstructed as a blended strip.

### 8. Determinism and semantic continuity

Within a fixed engine and schema, the following inputs define the result:

```text
contract + token ID + source SVG + local Check index
+ reconstructed C(t) + global traits + collision attempt
```

The same complete inputs produce the same glyph data, traversal, colors, DNA, PNG, and SVG.

Engine 2.3 does not equate semantic continuity with exact silhouette identity. Small signal changes normally retain the same field, while stable identity can resolve visibly different—but field-compatible—forms. Behaviorally unrelated tracks move into different fields and show substantially greater morphological distance. Frozen regression fixtures, field invariants, uniform-band tests, and the reproducible audit protect this balance.

## Numerical anatomy

| Property | Value |
|---|---:|
| Glyph lattice | 5×5 |
| Maximum cell positions | 25 |
| Active visible-cell range | 2–12 |
| Maximum components | 3 |
| Maximum isolated accents | 2 |
| Background field | 8×10 |
| Canonical Checks counts | 80 / 40 / 20 / 10 / 5 / 4 / 1 |
| Overlapping morphological fields | 13 |
| Stable tie-break hash | 32-bit FNV-1a |
| Collision retry cap | 18 |
| Temporal domain | `[0, 1]` |
| Raster export scale | 4× source root |
| SVG display size | 2× source root |
| Glyph Engine | 2.3 |
| DNA Schema | 2.3 |

## Run locally

Requires Node.js 18 or newer.

```bash
npm start
```

Then open:

```text
http://127.0.0.1:4173
```

There are no npm dependencies and no build step. The page loads pinned p5.js `1.11.3` from jsDelivr and retrieves token data from Ethereum, so an internet connection is required. Do not open `index.html` directly as a `file://` page: browsers restrict RPC requests and embedded SVG documents from local-file origins.

## Test

```bash
npm test
```

The suite verifies:

- JavaScript syntax and repository structure;
- source integrity through SHA-256;
- loader and ABI utility behavior;
- active and historical Original retrieval paths;
- deterministic fixture output;
- Canvas/SVG renderer agreement;
- small RGB and timing perturbation stability;
- the 2–12 cell density envelope;
- component and isolated-accent ceilings;
- differentiation of unrelated chromatic fields;
- diversity inside an 80-Check uniform Color Band;
- presence of both minimal and developed glyphs in that band.

Generate the reproducible audit data and gallery SVGs with:

```bash
node scripts/morphology-audit.mjs
node scripts/morphology-gallery.mjs
```

Snapshot updates are explicit:

```bash
npm run test:update
```

Use that command only when an intentional engine change should redefine the deterministic fixtures.

## Repository structure

```text
.
├── index.html                    Public interface
├── styles.css                   Interface presentation
├── src/checkglyphs.js           Deterministic engine, loader, UI, and renderers
├── assets/empty-placeholder.svg Shared empty-state visual
├── tests/                       Input fixtures and frozen expected glyph data
├── scripts/                     Regression, morphology, loader, renderer, and integrity tests
├── audit/                       Engine 2.3 report, metrics, and morphology galleries
├── server.mjs                   Dependency-free local server
├── THIRD_PARTY_NOTICES.md       Dependency and source acknowledgements
├── CHANGELOG.md                 Version history
└── LICENSE                      MIT License
```

## Status

Release **2.6.0** · Glyph Engine **2.3** · DNA Schema **2.3**

CheckGlyphs is an independent artistic research project. It is not affiliated with Checks, Visualize Value, Jack Butcher, or Jalil Wahdatehagh. With gratitude to Visualize Value for the body of work that helped shape the context around this study.

## License

CheckGlyphs is open source under the [MIT License](LICENSE).

You may use, study, modify, distribute, sublicense, and commercially reuse the software, provided that the original copyright notice and license are preserved in copies or substantial portions of the Software.

Copyright (c) 2026 Marc0s.

The license applies to the CheckGlyphs software and does not claim ownership of the underlying Checks project. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for acknowledgements and source context.
