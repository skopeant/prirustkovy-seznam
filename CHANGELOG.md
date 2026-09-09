# Changelog

All notable changes to this project are documented here.

## [2.4.0] - 2026-09-09

### Added
- Added a PDF format selector with A4 landscape and A4 portrait output.
- Added a compact portrait layout inspired by the previous accession-list print format.

### Changed
- In the landscape table, moved `Popisné údaje` directly after `Přír. číslo`.
- Portrait output keeps all acquisition fields while using a compact record-by-record layout.
- PDF filenames now indicate whether the output is `na-sirku` or `na-vysku`.

### Notes
- In portrait PDF layout, widened the `Signatura` area so longer call numbers fit more reliably within the printable page width.
- Both landscape and portrait PDF layouts use 10 records per A4 page.
- Journal/serial descriptions continue to include the item description and ISSN from MARC 022 when available.
- Data retrieval, Analytics configuration, institution restriction and application language were not changed.

## [2.3.0] - 2026-09-09

### Changed
- Added English and Czech localized metadata for the Cloud App title, subtitle, and description.
- Standardized package name and package description.
- Added full English and Czech README documentation.
- Updated the documented application version to 2.3.0.
- Kept the application license consistently under MIT.

### Notes
- No functional changes were made to accession-list generation or PDF output.

## [2.2.0] - 2026-09-08

### Changed
- Restricted the Cloud App to Czech Technical University in Prague.
- Changed the Cloud App ID to `skopeant/prirustkovy-seznam`.
- Updated repository and license references.
- Updated package metadata to version 2.2.0.
- Added a `tar` 7.5.22 override for dependency security.
- Documented the Analytics Administrator requirement.

### Verified
- Production build verified with ECA.

## [2.1.0] - 2026-09-08

### Added
- Inventory number range search.
- Institution-configured Alma Analytics report.
- Bibliographic, item and acquisition data retrieval.
- PDF generation.
- Institution-wide configuration.
