# Changelog

## 2.6.0

* Replaced the one-phenotype/one-local-inflection model with a chromatic morphology field and identity-resolved realization.
* Preserved semantic continuity while allowing identical Color Bands to produce diverse, field-compatible glyphs.
* Added a broad 2–12 cell density envelope, making minimal 2–4 cell signs first-class outcomes.
* Added a compact epigraphic archetype grammar with bars, stems, gates, forks, chambers, broken modules, and satellites.
* Allowed controlled accented and split topologies with strict component and isolated-cell ceilings.
* Reworked collision retries so they explore the admissible field instead of changing only one cell or leaving the field.
* Added uniform-band diversity invariants, reproducible field metrics, and separate varied-track and uniform-band galleries.
* Advanced Glyph Engine and DNA Schema to 2.3.

## 2.5.0

* Replaced exact-signature morphology selection with a 25-sample CIELAB behavior descriptor.
* Made family, symmetry, density, interior, orientation, and target cell count consequences of measured chromatic behavior.
* Confined token identity and collision retries to an optional one-cell local inflection around a shared phenotype.
* Replaced the legacy family label with the behaviorally defined composite family.
* Added structural repair for isolated cells and improved continuity-first traversal with Hamiltonian-path search.
* Added morphology invariants covering perturbation continuity, identity bounds, differentiation, and isolated-cell suppression.
* Advanced Glyph Engine and DNA Schema to 2.2.

## 2.4.2

* Fine-tuned the empty Source placeholder alignment to visually match the Output placeholder more precisely.



All notable public-repository changes are documented here. The deterministic visual engine remains versioned separately from the repository interface and documentation.

## 2.4.1

* Updated the engine SPDX identifier, package metadata, README, interface footer, and repository checks.
* Preserved every technical, scientific, visual, and documentation improvement introduced in 2.4.0.

## 2.4.0

* Rewrote the engine header as a compact scientific specification of the transduction pipeline, invariants, morphology, and determinism scope.
* Added a four-cell 5×5 schematic Check glyph to the source documentation.
* Expanded the README into a technical meta-manifesto covering signal reconstruction, CIELAB metrics, deterministic hashing, morphology, traversal, rendering, and historical Originals.
* Completed the archived public history with the 2.1.0 and 2.1.1 entries.
* Preserved Glyph Engine 2.1 and DNA Schema 2.1 output.

## 2.3.4

* Restored a visible empty-state image in the Source viewport.
* Matched the Source empty-state graphic directly to the Output empty-state appearance.

## 2.3.3

* Removed placeholder text from the empty Source and Output viewports.
* Matched the empty Source viewport scale to the Output viewport for a more symmetrical resting state.
* Updated the hero headline so both lines render in white.

## 2.3.2

* Removed the remaining arrow between Source and Output.
* Prevented the Token ID focus treatment from overlapping the Transduce button.
* Added a direct on-chain SVG fallback for previously minted Originals later burned through compositing or sacrifice.
* Kept never-migrated Edition IDs from being interpreted as historical Originals.
* Replaced browser-incompatible RPC fallbacks with additional public endpoints suitable for read-only browser calls.
* Added clearer status messages for active, historical, missing, and local-file loading states.

## 2.3.1

* Doubled the default opened size of exported SVG files while preserving their internal geometry and viewBox.
* Removed the `PATH` label between Source and Output, leaving the directional arrow alone.
* Replaced the dash after `hidden alphabets` with a colon in the About copy.
* Added a quiet footer acknowledgment: `With gratitude to Visualize Value`.
* Kept `FORM GLYPHS` to describe deterministic formation rather than free generation.

## 2.3.0

* Enabled interactive source SVG embedding so click-driven source animations can play directly in the Source panel when supported by the original SVG.
* Switched the main Output preview to SVG rendering while preserving PNG and SVG export buttons.
* Reduced the initial opened size of exported SVG files while preserving internal geometry and viewBox.
* Added discrete `STEPS` and continuous `BAND` chromatic-path views.
* Refined PNG raster drawing to reduce visible hairline seams between adjacent glyph cells.

## 2.2.3

* Restored the exact SVG-layout validation helper accidentally omitted in 2.2.2.
* Fixed token transduction failing before rendering with a misleading retrieval error.
* Added a renderer smoke test to protect the shared Canvas/SVG geometry path.

## 2.2.2

* Added static SVG export alongside PNG export.
* Generated SVG output directly from deterministic glyph geometry rather than converting the canvas.
* Preserved the same panel, grid, colors, and placements used by the PNG renderer.
* Kept glyph cells free of per-cell perimeter strokes in exported SVGs.

## 2.2.1

* Enlarged Source and Glyph previews without changing exported output.
* Strengthened the visual Source → Path → Glyph relationship.
* Improved microcopy readability, including the CheckGlyphs wordmark.
* Hid unavailable metadata instead of displaying `UNKNOWN`.
* Clarified the output title as `Glyph for Checks #…`.
* Promoted the chromatic path as the primary interpretive action.
* Tightened vertical rhythm while preserving the interface’s quiet scale.
* Preserved Glyph Engine 2.1 output.

## 2.2.0

* Reframed the interface around **Source → Path → Glyph**.
* Added a live side-by-side comparison between the original on-chain SVG and its glyph system.
* Added an optional view of the temporal chromatic samples for every Check.
* Added staged feedback for reading, extracting, and forming glyphs.
* Moved metadata and export controls into a quiet result layer.
* Added a concise transduction statement and responsive presentation.
* Preserved Glyph Engine 2.1 output.

## 2.1.2

* Reduced the public interface to Token ID input and PNG export.
* Kept public Ethereum RPC endpoints internal and automatic.
* Removed manual SVG upload and custom RPC input.
* Standardized all public text in English.
* Added deterministic regression tests, including a `Color Band 1` stress case.
* Added the first public license and concise README.
* Preserved Glyph Engine 2.1 output.

## 2.1.1

* Replaced the p5.js watchdog-sensitive bounded collision loop with an equivalent capped recursive retry path.
* Preserved the same 18 collision attempts, candidate order, fallback behavior, seeds, morphology, traversal, colors, and layout.
* Verified equivalence across synthetic one-, two-, and five-color tracks and an 80-Check monochromatic stress fixture.
* Avoided a missing `canvas-holder` warning when running inside the p5.js Web Editor.
* Added SHA-256 source-integrity verification and archived compatibility notes.

## 2.1.0

* Produced the conservative `safe-clean` engine from the earlier working source.
* Removed 16 unreachable legacy functions and one unused constant through deletion-only cleanup.
* Reduced the engine by approximately 635 lines, or 16%, without changing the active deterministic path.
* Preserved seed formats, FNV-1a hashing, weighted family pools, rune-bank order, morphology order, temporal sampling, collision semantics, exact layout handling, and rendering constants.
* Documented remaining architectural risks and a fixture-first refactoring strategy.


Earlier development history



Version 2.1.0 represents the earliest preserved and verifiable baseline of CheckGlyphs.



Versions 1.0 through 1.9 were internal experimental iterations devoted to the development of the engine itself. During this period, the core behavior of the software, the glyph-generation logic, the morphological system, chromatic mapping, traversal rules, and deterministic identity model were repeatedly revised.
Those early builds and their detailed change records are no longer available. For this reason, their individual modifications cannot be reconstructed reliably, and the documented public history of the project begins with version 2.1.0.

