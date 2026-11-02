# pixelmator-selection-color Specification

## Purpose
Deterministic pixel-accurate colour work: selection modes, colour picking at a coordinate, HEX-targeted recoloring of the selection or layer with a measured verification metric, and colour adjustments — the zero-guesswork core of the port.

## Requirements

### Requirement: Selection modes
`pixelmator_select` SHALL support modes `all`, `none`, `invert`, `subject`, `rect` (requires bounds {x,y,width,height}) and `color-range` (requires a reference colour and a tolerance range), returning the applied mode. Missing required parameters for `rect`/`color-range` SHALL produce a validation error at the tool boundary (zod), not an AppleScript error.

#### Scenario: Rect selection
- **WHEN** `pixelmator_select` is called with mode `rect` and bounds {x:10,y:10,width:100,height:100}
- **THEN** the result reports the applied selection and is not `isError`

#### Scenario: Color-range without colour is rejected at the boundary
- **WHEN** `pixelmator_select` is called with mode `color-range` and no colour argument
- **THEN** the call fails schema validation (the tool rejects the arguments before touching the app)

### Requirement: Colour picking
`pixelmator_pick_color` SHALL sample the pixel at {x,y} of the targeted document and return 16-bit RGBA, 8-bit RGB and the HEX string.

#### Scenario: Pick returns HEX
- **WHEN** `pixelmator_pick_color` is called with {x,y} inside the canvas
- **THEN** the result contains a HEX string matching its own 8-bit RGB values

### Requirement: Deterministic HEX recolor with verification
`pixelmator_recolor` SHALL accept a HEX target colour, a mode (`style` or `fill`), and optional opacity / preserve-transparency / whole-layer flags. When no selection is active, `fill` mode SHALL return an `isError` explaining that the whole layer would be painted, unless `wholeLayer: true` is set; when a selection is active, `fill` paints the selection. The result SHALL include the applied 8/16-bit colour and a measured verification sample (coordinate, measured HEX, and distance to the target in ΔE-2000 or RGB-Euclid) so the caller can confirm colour accuracy. When no verification coordinate is provided, the sample SHALL be taken at the centre of the active selection (or of the canvas for whole-layer fills).

#### Scenario: Fill a selection with an exact HEX
- **WHEN** a rectangular selection is active and `pixelmator_recolor` is called with color `#FF0000`, mode `fill`
- **THEN** the result is not `isError`, reports the applied colour as `#FF0000` (8-bit) and includes a measured sample whose distance to target is reported

#### Scenario: Whole-canvas fill without selection is guarded
- **WHEN** no selection is active and `pixelmator_recolor` is called with mode `fill` without `wholeLayer`
- **THEN** the result is `isError` explaining that the whole layer would be filled and suggesting `wholeLayer: true`

### Requirement: Colour-range tolerance
`pixelmator_select` with mode `color-range` SHALL accept an optional tolerance `range` (default 30) and apply it on 16-bit channel values, mirroring the proven source semantics.

#### Scenario: Default tolerance
- **WHEN** `pixelmator_select` is called with mode `color-range`, a colour, and no range
- **THEN** the applied tolerance is 30 and the result reports it

### Requirement: Missing-app and bridge failures apply to every colour operation
`pixelmator_select`, `pixelmator_pick_color`, `pixelmator_recolor` and `pixelmator_adjust` SHALL honour the package-wide missing-app rule (honest `isError` naming Pixelmator Pro) and surface bridge failures as `isError` with the underlying error description.

#### Scenario: Recolor without the app
- **WHEN** `pixelmator_recolor` is called on a machine without Pixelmator Pro
- **THEN** the result is `isError` naming the missing app

### Requirement: Colour adjustments
`pixelmator_adjust` SHALL accept an object of optional numeric adjustments (saturation, contrast, hue, exposure, temperature, tint, brightness, vibrance, highlights, shadows, sharpen) and apply exactly the provided ones to the current layer, returning the applied values.

#### Scenario: Apply two adjustments
- **WHEN** `pixelmator_adjust` is called with {saturation: 1.2, contrast: 1.1}
- **THEN** the result reports applied {saturation: 1.2, contrast: 1.1} and is not `isError`
