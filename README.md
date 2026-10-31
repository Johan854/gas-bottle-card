# Gas Bottle Card (FR)

Carte Home Assistant pour une bouteille de gaz pesée (balance ESP32 + HX711, ESPHome…) : bouteille illustrée qui se vide, pourcentage, kilos restants, couleur selon le niveau en % (vert / bleu / rouge), **estimation du temps restant** d'après l'historique et **alerte de mesure incohérente** (valeur hors 0–100 %, capteur hors ligne) et **onglet Réglages** pour tarer et calibrer la balance depuis la carte. Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.

## Installation (HACS)
1. HACS → ⋮ → *Dépôts personnalisés* → `https://github.com/Johan854/gas-bottle-card`, catégorie **Tableau de bord**.
2. Installer, puis recharger le navigateur.

## Exemple
```yaml
type: custom:gas-bottle-card
title: Bouteille de gaz
entity: sensor.espgaz_gaz        # pourcentage restant
kg_entity: sensor.espgaz_gaz_restant   # facultatif : kilos restants
capacity_kg: 5.5                 # contenance de gaz (ignorée si le réglage « Contenance gaz » de l'ESP existe)
low_pct: 30                      # « niveau bas » (bleu) à partir de 30 %
crit_pct: 10                     # « presque vide » (rouge) à partir de 10 %
show_estimate: true
history_days: 14
image: /local/gaz/bouteille.jpg  # facultatif, image de fond
image_opacity: 0.18
```
L'estimation ne compte que les baisses du niveau (les hausses sont ignorées : dérive ou changement de bouteille) et demande au moins 24 h d'historique fiable. Un clic sur la carte ouvre la fiche du capteur.

## Onglet Réglages (calibration de la balance)

En haut à droite, deux onglets : **Niveau** (la bouteille) et **Réglages** :

- poids actuellement lu par la balance ;
- **tare** de la bouteille vide et **contenance** de gaz, réglables avec − / + ;
- calibration en deux étapes, chaque bouton demandant une confirmation (deuxième appui) :
  1. plateau vide → **Tarer** ;
  2. bouteille vide posée → **Calibrer**.

Les entités sont détectées automatiquement (en priorité celles du même appareil que `entity`) d'après les noms de la config ESPHome : `button.*tarer*`, `button.*calibr*`, `number.*tare_bouteille*`, `number.*contenance*`, `sensor.*poids_total*`. On peut aussi les donner à la main :

```yaml
show_settings: true
weight_entity: sensor.espgaz_poids_total_bouteille
tare_button: button.espgaz_tarer_plateau_vide
calib_button: button.espgaz_calibrer_avec_bouteille_vide
tare_number: number.espgaz_tare_bouteille
capacity_number: number.espgaz_contenance_gaz
```

Sans aucune de ces entités, l'onglet n'apparaît pas.

## Apparence : nuance de couleur

Dans l'éditeur visuel, à côté du thème :

| Option | Valeurs |
|---|---|
| `nuance` | `theme` (par défaut), `braise`, `ocean`, `lagon`, `foret`, `lavande`, `framboise`, `ambre`, `ardoise`, `perso` |
| `nuance_perso` | Couleur au choix (sélecteur de couleur), utilisée avec `nuance: perso` |
| `intensite` | De `0` (neutre) à `2` (très coloré), `1` par défaut |

La nuance teinte le dégradé de fond (et la couleur d'accent quand la carte en a une). Les couleurs d'état (vert, orange, rouge…) ne changent pas.

**Une seule nuance pour toutes les cartes Johan854** : laisse `nuance: theme` et ajoute à ton thème Home Assistant :

```yaml
carte-nuance: "#2f8fd8"
```

Sans cette ligne, `nuance: theme` garde les couleurs d'origine de la carte.

## Historique des versions

- **1.3.0** : seuils d'alerte en pourcentage (`low_pct` 30 %, `crit_pct` 10 %) à la place des seuils en kg.
- **1.2.0** : onglet Réglages (tare, calibration avec confirmation, tare et contenance réglables) ; la contenance suit le réglage de l'ESP s'il existe.
- **1.1.0** : nuance de couleur au choix (8 nuances, couleur personnalisée, intensité, ou nuance commune via `carte-nuance` dans le thème).
