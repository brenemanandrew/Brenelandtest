# Converted sheet 01 picks

Made by `scripts/convert.py`. Sizes are metres (x length, y height, z depth) at game scale 1, origin at the centre of the base on the ground.
Tree heights match the game's own trees, measured by building them with the live `world-trees.js` (`tools/current_trees.html`): oak 5.9, maple 5.37, birch 6.71, pine 6.62, palm 5.89. Hedge blocks match layout.js HEDGE (1.5 high, 0.92 deep); raised bed matches garden-build.js BED; rose arch matches the 2.16 m gate posts.

Two versions per asset: `tex/` keeps the 2k texture, `vc/` has the texture baked into vertex colours (fits the game's current toon batch). Seasonal trees (oak, maple, birch) have pale neutral leaves; in `vc/` the leaf vertices carry alpha 128 so the game can tint just the leaves by season.

| Asset | Size (m) | Triangles | Source |
|---|---|---|---|
| oak | 7.49 x 5.9 x 4.56 | 6186 | models/01-plants-trees/v3/oak.glb |
| maple | 3.45 x 5.37 x 3.53 | 6197 | models/01-plants-trees/v2/maple.glb |
| birch | 1.54 x 6.71 x 1.08 | 1070 | models/trimmed/birch.glb |
| pine | 3.42 x 6.62 x 3.43 | 1031 | models/01-plants-trees/pine.glb |
| palm | 3.38 x 5.89 x 3.01 | 5198 | models/01-plants-trees/wave2/palm.glb |
| hedge_box | 3.3 x 1.5 x 0.92 | 2165 | models/01-plants-trees/v3/hedge_a.glb |
| hedge_end | 1.65 x 1.5 x 0.92 | 2955 | models/01-plants-trees/wave2_redo/hedge_end.glb |
| hedge_bush | 2.06 x 1.2 x 2.1 | 2220 | models/01-plants-trees/v3/hedge_b.glb |
| topiary_ball | 1.16 x 1.0 x 1.16 | 2068 | models/01-plants-trees/wave2/hedge_end.glb |
| flower_patch | 1.48 x 0.84 x 1.5 | 2953 | models/01-plants-trees/v2/flower_patch.glb |
| mossy_rock | 1.5 x 1.21 x 1.47 | 3080 | models/01-plants-trees/v2/mossy_rock.glb |
| fern | 0.7 x 0.69 x 0.22 | 1812 | models/trimmed/fern.glb |
| mushrooms | 0.4 x 0.3 x 0.37 | 1410 | models/01-plants-trees/wave2/mushrooms.glb |
| log | 2.5 x 0.5 x 0.6 | 3056 | models/01-plants-trees/wave2/log.glb |
| shore_rock | 1.0 x 0.74 x 0.81 | 2084 | models/01-plants-trees/wave2/shore_rock.glb |
| grass_tuft | 0.42 x 0.3 x 0.37 | 675 | models/01-plants-trees/wave2/grass_tuft.glb |
| raised_bed | 3.0 x 0.5 x 1.6 | 2945 | models/01-plants-trees/v3/raised_bed.glb |
| lettuce | 1.6 x 0.41 x 1.3 | 3064 | models/01-plants-trees/v2/lettuce_row.glb |
| carrots | 1.66 x 0.61 x 1.3 | 2319 | models/01-plants-trees/wave2/carrots.glb |
| strawberries | 2.37 x 0.52 x 1.3 | 3062 | models/01-plants-trees/wave2/strawberries.glb |
| pumpkins | 1.19 x 0.8 x 0.61 | 501 | models/01-plants-trees/pumpkin_vines_with_pumpkins.glb |
| tomatoes | 0.76 x 1.2 x 0.46 | 2690 | models/trimmed/tomato_plants.glb |
| sunflower | 0.79 x 2.0 x 0.49 | 290 | models/01-plants-trees/sunflowers.glb |
| herb_pot | 0.5 x 0.4 x 0.48 | 2255 | models/01-plants-trees/wave2_redo/herb_pot.glb |
| weed | 0.27 x 0.25 x 0.1 | 2092 | models/01-plants-trees/wave2_redo/weed.glb |
| rose_arch | 2.6 x 3.3 x 0.9 | 3705 | models/01-plants-trees/wave2/rose_arch.glb |
| trellis | 0.76 x 1.5 x 0.38 | 2579 | models/01-plants-trees/wave2/trellis.glb |

Not converted yet: the swing tree (its trunk and limb must match swing-tree.js; it keeps the code-made limb and swing), and sheets 02 to 04.

Known: the new oak is wider than the game's (7.5 vs 5.3 m) at the same height; the pine is lighter and bluer than the game's dark pine.