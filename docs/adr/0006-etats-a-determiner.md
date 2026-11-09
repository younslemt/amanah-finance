# ADR 0006 — États « à déterminer » dans les moteurs de conformité

**Statut** : accepté (Sprint 0.1)

**Décision** : un moteur ne conclut que si les conditions de la conclusion sont établies.
- Zakat : `to_determine` si la base du nisab n'est pas choisie, si un prix utile manque ou est
  ancien, si le Hawl est inconnu ou invalide, ou si des éléments incertains peuvent changer la
  conclusion. `due` exige nisab atteint, Hawl achevé et aucune donnée manquante. `below_nisab`
  n'est retenu que si l'assiette reste sous le nisab même en comptant les éléments incertains.
- Purification : brut, précompte et net crédité sont distingués ; aucune base n'est imposée.
  Sans choix explicite (utilisateur ou référentiel validé), le montant à purifier est nul et
  l'élément ne peut pas passer à « purifié ».
- Objectifs : sans rythme d'épargne connu, le statut est `to_determine`, pas « en bonne voie ».

**Conséquences** : les contraintes SQL imposent la même règle (montant dû seulement si `due`,
raisons obligatoires si `to_determine`, base et montant de purification indissociables).
