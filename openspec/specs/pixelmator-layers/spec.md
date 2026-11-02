# pixelmator-layers Specification

## Purpose
Deterministic layer operations over Pixelmator Pro: creating image layers from files, duplicating, merging visible layers, deleting and masking — addressed by document name and layer number.

## Requirements

### Requirement: Missing-app and bridge failures apply to every layer operation
Every layer tool SHALL honour the package-wide missing-app rule (honest `isError` naming Pixelmator Pro) and surface bridge failures as `isError` with the underlying error description.

#### Scenario: Duplicate without the app
- **WHEN** `pixelmator_duplicate_layer` is called on a machine without Pixelmator Pro
- **THEN** the result is `isError` naming the missing app

### Requirement: Image layer creation from a file
`pixelmator_add_image_layer` SHALL create a new layer in the targeted document from an absolute POSIX file path and return the new layer's name/number.

#### Scenario: Add a PNG as a layer
- **WHEN** `pixelmator_add_image_layer` is called with an existing PNG path on an open document
- **THEN** the result is not `isError` and reports the created layer

#### Scenario: Missing file
- **WHEN** `pixelmator_add_image_layer` is called with a non-existent path
- **THEN** the result is `isError` naming the missing file

### Requirement: Duplicate, merge-visible, delete
`pixelmator_duplicate_layer` SHALL duplicate the current or numbered layer (returning the new layer — the Aeroflot quirk that duplication resolves through `layer 1` is honoured internally). `pixelmator_merge_visible_layers` SHALL merge all visible layers. `pixelmator_delete_layer` SHALL delete the numbered/current layer.

#### Scenario: Duplicate then merge visible
- **WHEN** `pixelmator_duplicate_layer` is called on a document with one layer, then `pixelmator_merge_visible_layers`
- **THEN** both results are successful and the document still reports at least one layer

#### Scenario: Delete a nonexistent layer
- **WHEN** `pixelmator_delete_layer` is called with a layer number beyond the layer count
- **THEN** the result is `isError` with the underlying bridge error description

### Requirement: Layer masks
`pixelmator_add_layer_mask` SHALL add a mask to the targeted layer, optionally initialised from an absolute image file path, in `reveal` or `hide` mode.

#### Scenario: Mask from file
- **WHEN** `pixelmator_add_layer_mask` is called with an existing mask image path and mode `reveal`
- **THEN** the result is not `isError` and reports the masked layer
