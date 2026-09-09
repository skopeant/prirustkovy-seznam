# Přírůstkový seznam

[English](README.md) | [Česky](README.cs.md)

Přírůstkový seznam je Cloud App pro Ex Libris Alma, která vytváří tisknutelné přírůstkové seznamy podle rozsahu přírůstkových čísel.

Aplikace je v současnosti omezena na České vysoké učení technické v Praze.

## Funkce

- vyhledání podle rozsahu přírůstkových čísel (`OD` / `DO`)
- použití institucí nastaveného reportu Alma Analytics pro nalezení odpovídajících záznamů
- načtení dalších bibliografických údajů, údajů o jednotkách a akvizici prostřednictvím Alma REST API
- vytvoření tisknutelného a stažitelného PDF
- konfigurace cesty k Analytics reportu na úrovni instituce
- žádný prefix přírůstkových čísel není v aplikaci napevno

## Požadavky

- Ex Libris Alma s podporou Cloud Apps
- Alma Analytics
- sdílený Analytics report ve složce instituce
- role Analytics Administrator

## Analytics report

V subject area **Physical Items** vytvořte analýzu obsahující:

- `Bibliographic Details > MMS Id`
- `Physical Item Details > Inventory Number`

Filtr pro `Inventory Number` nastavte na:

`Is Prompted`

Report uložte do sdílené složky instituce, například:

`/shared/Your Institution/CloudApp/prirustkovy-seznam`

Úplnou cestu k reportu potom zadejte v konfiguraci Cloud App.

## Bezpečnost a práce s daty

Aplikace čte data z Alma Analytics a Alma API za účelem vytvoření přírůstkového seznamu.

Neobsahuje vlastní Alma API klíč. Přístup k datům Almy probíhá prostřednictvím přihlášeného prostředí Cloud App a oprávnění aktuálního uživatele Almy.

Vygenerované PDF se vytváří pro uživatele v prohlížeči.

## Omezení na instituci

Manifest obsahuje:

```json
"relevantForInst": [
  "420CARDS_CVUT"
]
```

Cloud App je proto v Almě dostupná pouze Českému vysokému učení technickému v Praze, zatímco zdrojový repozitář zůstává veřejný kvůli publikačnímu procesu Ex Libris.

## Dokumentace

Česky:
https://skopec.vosis.cz/alma/cloudapp/prirustkovy-seznam/

English:
https://skopec.vosis.cz/alma/cloudapp/prirustkovy-seznam/en/

## Lokální vývoj

Po naklonování repozitáře:

```text
eca init
eca start
```

Při `eca init` se vytvoří lokální `config.json` s URL Alma prostředí. Tento soubor nesmí být commitován.

## Build

Před vytvořením nové verze:

```text
eca build
```

Produkční build musí proběhnout bez chyb před vytvořením GitHub Release.

## Autor

Antonín Skopec

## Licence

MIT License. Viz [LICENSE](LICENSE).

## Verze

2.3.0
