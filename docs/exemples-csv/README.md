# Relevés CSV fictifs

Fichiers **entièrement inventés** (montants, libellés, contreparties, numéros de compte `BE00 0000…`).
Ils servent aux tests automatiques et aux démonstrations de l'import. Aucune donnée réelle.

| Fichier | Profil | Contenu |
| --- | --- | --- |
| `releve-fictif-generique-be.csv` | `generic_be` (date, montant signé, libellé) | salaire, loyer, dépenses, deux cafés identiques le même jour, intérêts créditeurs, prime de fidélité, une ligne à date illisible |
| `releve-fictif-debit-credit-be.csv` | `split_debit_credit_be` (colonnes Débit / Crédit) | salaire, dépense, intérêts |

Les profils propres à BNP Paribas Fortis, KBC, Belfius et ING seront établis à partir d'exports
fictifs à structure réelle (décision D4 du cahier des charges).
