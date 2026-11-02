# app-parity Specification

## Purpose
Ports the RU-Keynote-proven runtime contract from the Aeroflot keynote-ops stack into iwork-mcp: tolerant name normalization, RU↔EN theme/layout aliases, per-operation timeouts, and 1920×1080 decks — so RU-localized iWork behaves the same as EN.

## Requirements

### Requirement: Name normalization for lookups
Name lookups (themes, master slides/layouts, document names) SHALL normalize both sides before comparing: Unicode NFC, NBSP (`\xa0`) to regular space, em dash (`—`) to hyphen (`-`).

#### Scenario: NBSP in a document name
- **WHEN** `keynote_save_presentation` is called with a `documentName` where spaces are NBSP characters, matching an open presentation whose name uses NBSP
- **THEN** the tool resolves the document and returns a successful JSON result instead of an `isError` not-found result

#### Scenario: NFC vs decomposed theme name
- **WHEN** a theme is requested with a decomposed Unicode form of a name that the app reports in NFC
- **THEN** the lookup succeeds and returns the same theme as the NFC-spelled request

### Requirement: RU↔EN theme and layout aliases
Keynote theme and master-slide (layout) lookups SHALL accept Russian names as aliases for English ones, at minimum: `Простая белая`→`White`, `Пустой`→`Blank`, `Заголовок и пункты`→`Bullets`, `Только заголовок`→`Title`. An unknown name SHALL still produce the friendly not-found error mapped from AppleScript error -1728.

#### Scenario: Russian theme name on EN Keynote
- **WHEN** `keynote_create_presentation` is called with `themeName` = `Простая белая` on an English-localized Keynote
- **THEN** the presentation is created with the White theme and the result reports the created deck

#### Scenario: Russian layout alias on set-layout
- **WHEN** `keynote_set_slide_layout` is called with `masterSlideName` = `Только заголовок`
- **THEN** the slide is assigned the Title layout and the tool returns success

#### Scenario: Unknown theme name
- **WHEN** `keynote_create_presentation` is called with `themeName` = `Несуществующая тема`
- **THEN** the result is `isError` and the text contains the friendly not-found message for AppleScript error -1728

### Requirement: Per-operation timeouts
Timeouts SHALL be set per operation class instead of one blanket value: document/slide creation and image operations run with a 90-second timeout; export operations with a 180-second timeout. Other operations keep a finite default timeout.

#### Scenario: Long export is not killed at 30 seconds
- **WHEN** `keynote_export_presentation` takes 60 seconds to produce a PDF
- **THEN** the tool returns a successful export result (an operation under 180 seconds must not time out)

#### Scenario: Slow image operation completes
- **WHEN** `keynote_super_resolution` takes 45 seconds
- **THEN** the tool returns its normal success result (an operation under 90 seconds must not time out)

### Requirement: Created presentations default to 1920×1080
`keynote_create_presentation` and `keynote_create_presentation_with_slides` SHALL create decks whose slides are 1920×1080 when no explicit size is requested.

#### Scenario: New deck slide size
- **WHEN** `keynote_create_presentation` is called with a theme name and no size arguments
- **THEN** the created presentation's slide size is 1920×1080 and the result reflects the created deck
