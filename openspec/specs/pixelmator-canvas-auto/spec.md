# pixelmator-canvas-auto Specification

## Purpose
Geometry and one-click ML operations over Pixelmator Pro: crop, resize, rotate, flip, and the auto enhance / denoise / white balance / remove background commands.

## Requirements

### Requirement: Canvas geometry
`pixelmator_crop_canvas` SHALL crop the document to absolute bounds {x,y,width,height}. `pixelmator_resize_image` SHALL resize to explicit width/height with a named resampling algorithm. `pixelmator_rotate_canvas` SHALL rotate left/right/180. `pixelmator_flip_canvas` SHALL flip horizontally/vertically. Each result SHALL echo the applied operation and parameters.

#### Scenario: Crop then verify dimensions
- **WHEN** `pixelmator_crop_canvas` is called with bounds {x:0,y:0,width:800,height:600} on an 1920×1080 document, then `pixelmator_get_document_info`
- **THEN** the reported document size is 800×600

#### Scenario: Resize validation
- **WHEN** `pixelmator_resize_image` is called without width or height
- **THEN** the call fails schema validation at the tool boundary

#### Scenario: Rotate echoes the operation
- **WHEN** `pixelmator_rotate_canvas` is called with direction `right`
- **THEN** the result echoes `rotate right` and is not `isError`

#### Scenario: Flip echoes the operation
- **WHEN** `pixelmator_flip_canvas` is called with direction `horizontally`
- **THEN** the result echoes `flip horizontally` and is not `isError`

### Requirement: ML auto operations
`pixelmator_enhance`, `pixelmator_denoise` (with intensity), `pixelmator_auto_white_balance` and `pixelmator_remove_background` SHALL run the corresponding Pixelmator command on the targeted document and report success. These are long-running operations and use the extended timeout class (180 s).

#### Scenario: Remove background on an image with a subject
- **WHEN** `pixelmator_remove_background` is called on an open photo document
- **THEN** the result is not `isError` and reports the operation

#### Scenario: Denoise with intensity
- **WHEN** `pixelmator_denoise` is called with intensity 0.5
- **THEN** the result echoes the applied intensity

#### Scenario: Enhance reports success
- **WHEN** `pixelmator_enhance` is called on an open document
- **THEN** the result is not `isError` and reports the enhance operation

#### Scenario: Auto white balance reports success
- **WHEN** `pixelmator_auto_white_balance` is called on an open document
- **THEN** the result is not `isError` and reports the white-balance operation

### Requirement: Missing-app behaviour applies to every operation
Every operation in this capability SHALL honour the missing-app rule of `pixelmator-documents`: honest `isError` naming Pixelmator Pro when the app is not installed.

#### Scenario: Missing app
- **WHEN** `pixelmator_remove_background` is called on a machine without Pixelmator Pro
- **THEN** the result is `isError` naming the missing app
