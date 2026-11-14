# Part 1 in one prompt (for an automation agent)

Copy everything in the box below into a browser agent (for example Claude in Chrome) while you are logged in to Meshy. It makes all 12 models one after another.

````
You are working in my Meshy account (meshy.ai) in this browser. Make 12 separate 3D models, one at a time, using Text to 3D. Do not combine them into one model.

For EVERY model use these settings:
- Text to 3D, low poly, topology: triangle, target polycount as listed, symmetry auto.
- Texture: base colour only (no PBR, no metallic/roughness), texture prompt: same as the model prompt.
- When Meshy shows preview options, pick the one with the clearest, simplest silhouette, standing upright on the ground and facing front. Then refine/texture it.
- Download as GLB and rename the file exactly as listed.
- If a generation fails or looks broken (holes, extra objects, ground plane, text), retry once with the same prompt. If it fails again, skip it and note it.

Every prompt starts with this style text (already included in each prompt below):
Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting.

The 12 models:

1. T1 Oak - polycount 1500, texture 1024 px, save as oak.glb
   Prompt: Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting. A sturdy cartoon oak tree. Thick short brown trunk that flares at the roots, two or three chunky branches. Crown made of five big soft rounded leaf clumps, one large in the middle and smaller ones around it, like scoops of ice cream. Leaves in pale light grey-green with lighter tops and darker undersides in a soft watercolour wash. A few simple dark painted bark lines. About 6 metres tall, crown wider than it is tall.

2. T2 Maple - polycount 1500, texture 1024 px, save as maple.glb
   Prompt: Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting. A round friendly cartoon maple tree. Medium brown trunk, slightly slimmer than an oak. Crown of four or five soft rounded leaf clumps forming a near ball. Pale light grey-green leaves with lighter tops and darker undersides, soft watercolour wash. About 5.5 metres tall.

3. T3 Birch - polycount 1200, texture 1024 px, save as birch.glb
   Prompt: Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting. A tall slim cartoon birch tree. Off-white trunk with a few short dark horizontal painted marks, gently curved. Narrow crown of three soft pale grey-green leaf clumps stacked upward. Airy and delicate but still chunky shapes. About 6.5 metres tall.

4. T4 Pine - polycount 1000, texture 1024 px, save as pine.glb
   Prompt: Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting. A cartoon pine tree made of four stacked rounded cone tiers, each tier with a soft scalloped lower edge, getting smaller toward a rounded tip. Short brown trunk visible at the bottom. Deep green with a lighter green rim on each tier, watercolour wash. About 7 metres tall.

5. P1 Hedge section - polycount 400, texture 512 px, save as hedge_section.glb
   Prompt: Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting. A neatly trimmed cartoon garden hedge, a rounded box shape with soft bumpy top and sides made of leaf clumps. Deep green with lighter green highlights on top, a few small painted leaf shapes. 2 metres long, 1 metre tall. Ends flat so sections can sit side by side.

6. P3 Flower patch - polycount 250 per patch, texture 512 px, save as flower_patch.glb
   Prompt: Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting. A small cluster of nine simple cartoon flowers on short green stems with a few rounded leaves at the base. Round five-petal flower heads in white, yellow and pink with darker centres. Low and wide.

7. P6 Mossy rock (small, large) - polycount 150 / 300, texture 512 px, save as mossy_rock_small_large.glb
   Prompt: Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting. A rounded lumpy cartoon boulder, warm grey with a few flat facets, a soft green moss patch draped over the top. Painted with a watercolour wash, darker at the base.

8. G1 Raised garden bed (empty, soil) - polycount 300, texture 512 px, save as raised_garden_bed_empty_soil.glb
   Prompt: Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting. A rectangular raised garden bed made of thick warm brown wooden planks with chunky corner posts and painted plank lines, filled level with dark brown soil. Empty, no plants.

9. G2 Lettuce row - polycount 400, texture 512 px, save as lettuce_row.glb
   Prompt: Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting. Six round cartoon lettuce heads in two rows, ruffled light green leaves with darker outer leaves, sitting on a patch of soil.

10. G5 Tomato plants on stakes - polycount 500, texture 512 px, save as tomato_plants_on_stakes.glb
   Prompt: Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting. Two leafy tomato plants tied to wooden stakes, big round red tomatoes and a couple of green ones, chunky leaves.

11. G6 Pumpkin vines with pumpkins - polycount 500, texture 512 px, save as pumpkin_vines_with_pumpkins.glb
   Prompt: Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting. Three round orange pumpkins of different sizes with ribbed sides and curly green stems, on a sprawl of large flat green leaves.

12. G7 Sunflowers - polycount 300 each, texture 512 px, save as sunflowers.glb
   Prompt: Stylized low poly game asset, cel shaded look, cozy storybook small town style like a hand painted illustration, chunky slightly rounded shapes, rich warm flat colours with a soft hand painted watercolour wash, simple painted details, matte, no gloss, no realistic texture, no outline, no ground, no base, single object centred, neutral flat lighting. A tall cartoon sunflower, thick green stalk, two large heart-shaped leaves, a big flower head with a brown centre and a ring of chunky yellow petals.

When all 12 are done, give me a list: each file name, done or skipped, and anything that looked off.
````

Afterwards: upload the 12 GLB files in the chat with Claude so they can be converted and compared with the current game assets.