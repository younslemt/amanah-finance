# ADR 0002 — Montants en centimes entiers, arrondi bancaire

**Statut** : accepté

**Décision** : `bigint` en base, entier `number` en TypeScript (plafond 30 milliards d'euros).
Les taux sont exprimés en parts pour 100 000 (2,5 % = 2 500). Arrondi au pair le plus proche.
Les métaux précieux sont en milligrammes et pureté en millièmes.

**Conséquences** : aucun écart d'arrondi entre écrans, exports et calculs enregistrés.
