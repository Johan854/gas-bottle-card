# Gas Bottle Card (FR)

Carte Home Assistant pour une bouteille de gaz pesée (balance ESP32 + HX711, ESPHome…) : bouteille illustrée qui se vide, pourcentage, kilos restants, couleur selon le niveau (vert / bleu / rouge), **estimation du temps restant** d'après l'historique et **alerte de mesure incohérente** (valeur hors 0–100 %, capteur hors ligne). Style verre, thème clair/sombre automatique, éditeur visuel, textes en français.

## Installation (HACS)
1. HACS → ⋮ → *Dépôts personnalisés* → `https://github.com/Johan854/gas-bottle-card`, catégorie **Tableau de bord**.
2. Installer, puis recharger le navigateur.

## Exemple
```yaml
type: custom:gas-bottle-card
title: Bouteille de gaz
entity: sensor.espgaz_gaz        # pourcentage restant
kg_entity: sensor.espgaz_gaz_restant   # facultatif : kilos restants
capacity_kg: 6                   # contenance de gaz (hors bouteille vide)
good_kg: 4                       # vert au-dessus
low_kg: 2                        # rouge en dessous (bleu entre les deux)
show_estimate: true
history_days: 14
image: /local/gaz/bouteille.jpg  # facultatif, image de fond
image_opacity: 0.18
```
L'estimation ne compte que les baisses du niveau (les hausses sont ignorées : dérive ou changement de bouteille) et demande au moins 24 h d'historique fiable. Un clic sur la carte ouvre la fiche du capteur.
