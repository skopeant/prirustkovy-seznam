# Alma Accession List

Cloud App for Ex Libris Alma that generates printable accession lists from a range of inventory numbers.

## Features

- Search by inventory number range (`FROM` / `TO`)
- Uses an institution-configured Alma Analytics report to locate matching records
- Retrieves additional bibliographic, item and acquisition data through Alma REST APIs
- Generates a downloadable PDF
- Institution-wide configuration for the Analytics report path
- No institution-specific inventory prefix is hard-coded

## Requirements

- Ex Libris Alma with Cloud Apps support
- Alma Analytics
- A shared Analytics report in the institution's Shared folder
- Appropriate Alma permissions for the data used by the app

## Analytics report

Create an analysis in the **Physical Items** subject area with these two fields:

- `Bibliographic Details > MMS Id`
- `Physical Item Details > Inventory Number`

Set the `Inventory Number` filter to:

`Is Prompted`

Save the report in the institution's Shared folder, for example:

`/shared/Your Institution/CloudApp/prirustkovy-seznam`

Then enter the full report path in the Cloud App configuration.

## Documentation

English:
https://skopec.vosis.cz/alma/cloudapp/prirustkovy-seznam/en/

Česky:
https://skopec.vosis.cz/alma/cloudapp/prirustkovy-seznam/

## Author

Antonín Skopec

## License

MIT License. See [LICENSE](LICENSE).

## Version

0.1.0
