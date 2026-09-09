# Accession List

[English](README.md) | [Česky](README.cs.md)

Accession List is an Ex Libris Alma Cloud App for generating printable accession lists from a range of inventory numbers.

The application is currently restricted to the Czech Technical University in Prague.

## Features

- selectable landscape or portrait A4 PDF
- journal and serial descriptions include the ISSN from MARC 022 when available

- Search by inventory number range (`FROM` / `TO`)
- Use an institution-configured Alma Analytics report to locate matching records
- Retrieve additional bibliographic, item and acquisition data through Alma REST APIs
- Generate a printable and downloadable PDF
- Configure the Analytics report path at institution level
- No institution-specific inventory-number prefix is hard-coded

## Requirements

- Ex Libris Alma with Cloud Apps support
- Alma Analytics
- A shared Analytics report in the institution's Shared folder
- Analytics Administrator role

## Analytics report

Create an analysis in the **Physical Items** subject area containing:

- `Bibliographic Details > MMS Id`
- `Physical Item Details > Inventory Number`

Set the `Inventory Number` filter to:

`Is Prompted`

Save the report in the institution's Shared folder, for example:

`/shared/Your Institution/CloudApp/prirustkovy-seznam`

Then enter the full report path in the Cloud App configuration.

## Security and data handling

The application reads data from Alma Analytics and Alma APIs in order to generate the accession list.

It does not contain its own Alma API key. Access to Alma data is performed through the authenticated Cloud App environment and the permissions of the logged-in Alma user.

The generated PDF is created for the user in the browser.

## Institution restriction

The manifest contains:

```json
"relevantForInst": [
  "420CARDS_CVUT"
]
```

The Cloud App is therefore available in Alma only to the Czech Technical University in Prague, while the source repository remains public for the Ex Libris publishing process.

## Documentation

English:
https://skopec.vosis.cz/alma/cloudapp/prirustkovy-seznam/en/

Česky:
https://skopec.vosis.cz/alma/cloudapp/prirustkovy-seznam/

## Local development

After cloning the repository:

```text
eca init
eca start
```

During `eca init`, a local `config.json` containing the Alma environment URL is created. It must not be committed.

## Build

Before creating a release:

```text
eca build
```

The production build must complete successfully before a GitHub Release is created.

## Author

Antonín Skopec

## License

MIT License. See [LICENSE](LICENSE).

## Version

2.4.0
