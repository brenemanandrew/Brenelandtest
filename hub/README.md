# Brenebase (brenebase.fly.dev): where a thought goes

One app you dump thoughts into. It works out which tool should handle each one, sends it there, gets the result back and files it in a job list.

**Status: built and tested locally. Not deployed.** The address will be https://brenebase.fly.dev (`fly.toml` app `brenebase`). Nothing here touches Brenai, the kiosk or Breneland-Next.

Tabs: **Send** (route or split a request), **Jobs**, **Projects**, **PC** (start the models from anywhere), **Tools**. The header lights show the PC agent, the model and the worker at a glance.

## The idea in one screen
1. **Type a thought.** Wrap anything private in `[[local]] ... [[/local]]`.
2. **The router picks a tool, a mode and an area** (Work, Hobbies, Personal) and tells you why. You can change any of them before sending.
3. **Autonomy decides what happens next:**
   - `ask`: shows the plan and waits for your OK
   - `draft`: runs the safe parts (writing, planning, links, chat with the PC model) and waits for your OK on anything that changes files or spends money. This is the default.
   - `auto`: just runs it
4. **Some things always wait for your OK, whatever the setting:** deploys and anything that spends Meshy credits. Breneland-Next stays locked.
5. **Results come back to the Jobs tab:** text, links, Meshy thumbnails, or a branch name from Claude Code.

## The tools: one generic type each, with modes
The mode is what changes how the work is handled. Same tool, different job.

| Tool | Type | Runs on | Modes |
|---|---|---|---|
| Coder | think | PC (Claude Code) | Brief only, Build, Fix, Review, Script |
| Planner | think | Claude API | Project plan, Break down, My week, Look back |
| Professional expert | think | Claude API (or PC, see below) | Kaizen / lean, Project management, Operations (Hubbell), Game design, Art and animation |
| Companion | think | PC model only | Just talk, Vent, Roleplay, Coach |
| 3D | make3d | Meshy, Blender on PC, code | Generate, Retexture, Rig, Process (Blender), Breneland fit, Build in code, Check |
| Motion | motion | Browser, PC | Capture (mocap), Library, Retarget, Hand-made in code |
| Overtime kiosk | workapp | Browser | Open, Roster, Change kiosk |
| Ship | ship | PC | Test copy, Deploy (always waits for OK) |

All of this lives in `tools.mjs`. To add a tool or a mode, add an entry there. The router, the page and the job list pick it up automatically.

## 3D: Meshy, Blender, code, or mocap?
This is the rule the router follows (`pick3d` and `pickMotion` in `route.mjs`):

| You want | Goes to | Why |
|---|---|---|
| Something new, from words | Meshy text to 3D, preview first | Cheapest way to get a new shape |
| Something new, from a picture | Meshy image to 3D | Same, from a photo or sketch |
| New paint or a cel-shaded look on an existing model | Meshy retexture | Keeps the shape |
| A humanoid with bones | Meshy auto-rig (Blender if it needs hand fixes) | Gets it ready for Mixamo-style clips |
| Change a model you already have (decimate, convert, bake, clean) | Blender on your PC, headless | Exact, repeatable, free |
| A garment or hairstyle for the character builder | Breneland fit pipeline (Blender) | Your fit_wear / shell / snug_hair scripts |
| Simple shapes (furniture, crates, lamps) | Built in Three.js code, by the Coder | Cleaner and lighter than a scan, like the 38 props |
| Look for holes, clipping or bad fits | The render checker | Six close views and a percent score |
| A move only you can show | Mocap page (camera, video, photos) | You act it out |
| A common move (walk, run, sit, dance) | Mixamo or Meshy library, converted to the rig | Already exists, no need to capture |
| Small gestures, fidgets, idles | Hand-made in code | Like Wizra's 25 gestures |
| A clip on the wrong skeleton | Retarget in Blender | VRM and the 66-bone Mixamo rig |

## How each tool you already built fits in
| Your tool | How the hub uses it now | What making it fully generic still needs |
|---|---|---|
| Wizra bridge (PC model through Bionic) | The worker talks to the same Bionic server for the Companion, and for Work if you want it local | Nothing. The bridge keeps running for Wizra, and the worker runs alongside it |
| Mocap page (`brenai/public/mocap.html`) | Motion Capture opens it | It only saves clips for VRM models. Add a target picker (VRM or the 66-bone Mixamo rig) and a GLB export. The hub already passes `?rig=`, but the page **does not read it yet** |
| Clip converter (`brenai/tools/clipconv.mjs`) | Motion Library runs it on the PC | It only outputs VRM clips. Add a Mixamo 66 output |
| Breneland pipeline scripts (29 Blender scripts) | 3D Breneland fit and Motion Retarget run allowed scripts through `worker/blender_ops.py` | They use fixed `/home/claude/...` paths. Make the paths a setting so they run on your PC |
| Render checker (`pipeline/jstest/piece.mjs`) | 3D Check runs it | Takes a piece name. Make it accept any GLB |
| Overtime kiosk (ardenot) | Opened as a link. Code changes go to the Coder | Nothing. The hub never sends kiosk data to an outside model |
| Meshy | Called directly: generate, retexture, rig. Previews only until you OK a refine | Refine step and auto-download into your asset folder |

## Split jobs: art and story one way, code the other
Press **Split it** instead of Route it. Example: "Make me a game where you run a tavern, guests come in and order drinks, you serve them and get paid, and use cel shaded visuals like my Breneland trees. The barkeep is named Grum and he is grumpy but kind."

1. **The split happens here, by rules**, so your full request never goes to an outside model to be split.
   - **Code part** (Claude Code) gets the game rules: "you run a tavern", "guests come in and order drinks", "you serve them and get paid".
   - **Art part** (Meshy, Blender or you) gets the look: "cel shaded visuals like my Breneland trees".
   - **Story part** (your PC model) gets the rest: "The barkeep is named Grum...".
   - To force a line to one side, start it with `code:`, `art:` or `story:`.
2. **Only as much as needed goes to Claude:**
   - Style words are stripped from the rules ("a cute toon frog" becomes "a frog").
   - Proper names become ids ("chase Vexa" becomes "chase entity_1").
   - Assets are **slots** with neutral ids, paths and formats only: `character_1: assets/hub/models/character_1.glb (GLB), humanoid, 66-bone Mixamo skeleton, under 15000 triangles`.
   - The page shows **exactly what Claude Code gets** before you send. It warns you if a word from your art or story still appears in the code part. You can edit all three parts and add or remove slots.
3. **Claude Code is told to send back merge info.** It must load every slot from a file, make grey stand-ins, and write `hub-merge.json`: where each slot is loaded, the stand-in it made, units, pivot, facing, the animation clip names it plays, the event names the data can use, a test command, a start command, and what to check by eye. It also puts the same JSON at the end of its reply in case the file is missing.
4. **Parts run in order:**
   - Code first, on the PC, on branch `hub/<job id>`.
   - The story part waits for the code, then writes dialogue and names as JSON using the real event names.
   - Each single model slot gets a Meshy part. These wait for your OK because they spend credits, and they cancel themselves if you fill that slot by hand.
   - Folders of items (props, icons) you fill by hand: a link, a file path on the PC, or pasted JSON.
5. **Merge.** When every slot is filled, the split shows **OK, merge it**. The PC worker:
   - switches to the branch
   - puts each file where the manifest says
   - checks it: a GLB must be a GLB, a PNG a PNG, and JSON must have the right top-level keys (anything else is rejected and named)
   - runs the test command, commits, and reports what to look at and how to run it

## Projects: what already exists, what is broken, what the rules are
Cards live in `projects/` (one JSON file each): Breneland (Breneland-Next plus the character builder test), Brenai, Arden work tools (Arden Hub, the overtime kiosk, Staging Lane Health, Arden Pack), Brenerig, and Valinfor (empty: it is not in any repo or on Drive yet).

Each card has: what it is, where it lives, its repo, tools and when to use them, settings as they are now (secret names only, never values), what works, known problems, open work, rules for agents, and things not to redo.

**It keeps itself up to date.**
- Every hour (`HUB_SYNC_MINUTES`) and on **Update notes now**, Brenebase rereads each project's own files: repo READMEs, HANDOFF and WISHLIST files, recent commit messages, and files on your PC such as the Breneland progress log on Google Drive.
- It pulls out sections headed like known issues, not done, open, wishlist, next steps, gaps and recent changes, and logs anything new with the date. So when a repo gets a new known issue, Brenebase knows.
- PC files are read by the worker, and only inside `READ_ROOTS` (default `G:\My Drive;F:\Projects`). The two Drive paths in the Breneland card are guesses: fix them if the files live in a subfolder.
- Private repos (ardenot) need `GITHUB_TOKEN` on Brenebase. Public ones work without it.

**How it is used.**
- Every request is matched to a project. The Send screen shows what is already known: known problems, already planned, already works, an existing tool, do not redo. That way you see it before something gets built twice.
- Each agent gets project context sized to what it needs:
  - Claude Code: only the rules, the do-not-redo list and the hints for that request
  - Claude API: the card without setting values
  - Your PC model: everything
- The Work card is private. Its context never goes to Claude, and Planner or Expert jobs for it run on your PC model instead.
- **Get help** next to any known problem or open item starts a job for it with the project context attached.

## PC: start the models from anywhere (Tailscale)
- **The agent** (`pc/brenebase-agent.mjs`) runs on your PC, starts at login and stays hidden. It can only:
  - load or unload the model (the same `lms` steps as start-wizra.ps1)
  - start or stop the Wizra bridge, the town bridge and the Brenebase worker
  - report status and show their logs
- **Two ways in, both need the PC key** (`HUB_WORKER_TOKEN`):
  1. **Tailscale, direct.** Brenebase joins your tailnet in userspace mode (`start.sh`, `TS_AUTHKEY` secret) and calls `http://<PC_TAILNET_HOST>:8765`. The agent only answers tailnet addresses and the PC itself.
  2. **Polling.** The agent also checks in with Brenebase every 5 seconds, so the buttons work even when Tailscale is down.
- **As needed:** when a job needs the PC and the worker is not running, Brenebase asks the agent to start the worker, and the model if the job needs it. It asks at most once every 3 minutes.
- **One-time setup on the PC** (PowerShell): `irm https://brenebase.fly.dev/pc/install-agent.ps1 | iex`. It asks for the PC key and prints the PC's tailnet name.
- **The PC must be awake.** Nothing can start a sleeping PC over Tailscale. The installer shows the `powercfg` line that stops it sleeping on mains power.
- The machine stays on (`min_machines_running = 1`) so Brenebase stays on the tailnet and answers the agent.
- The town bridge needs `TOWN_BRIDGE` set to Breneland-Next's `tools\npc-brain-bridge.mjs` on the PC.

## Keeping things private
- `[[local]] ... [[/local]]` text is swapped for a placeholder before anything goes to Claude, and put back when the result comes home.
- Files on the keep-local list (her persona, saves, `/data`, the roster, `.vrm` models, motion clips) are never sent.
- Passwords, tokens and keys are removed and never put back.
- The Companion only ever runs on your PC.
- `HUB_WORK_LOCAL=1` sends all Work-area Planner and Expert jobs to your PC model instead of Claude, in case Hubbell has rules about outside AI.
- What this is not: a way to get Claude to build pieces of something it declined. The placeholder carries no content, and Claude can see that a part was held back.

## Parts
| File | What it does |
|---|---|
| `tools.mjs` | The catalogue: tools, modes, autonomy levels, areas |
| `route.mjs` | The router: rules first, then Claude or the PC model if unsure, then asks you |
| `adapters.mjs` | How each backend runs, and the instructions behind each mode |
| `split.mjs` | Keep-local split and rejoin |
| `parts.mjs` | Split jobs: rules, art and story apart, slots, the brief for Claude, merge checks |
| `ledger.mjs` | The job list (one JSON file) |
| `server.mjs` | The page, the API and the PC queue |
| `public/index.html` | The phone page: Send, Jobs, Tools |
| `worker/hub-worker.mjs` | Runs on your PC. Connects out to the hub and does PC jobs: PC model, Claude Code, Blender, named scripts |
| `worker/blender_ops.py` | Headless Blender jobs: info, decimate, convert, and the allowed pipeline scripts |
| `projects.mjs`, `projects/` | Project cards and their self-updating notes |
| `pcagent.mjs` | Brenebase's side of the PC agent: Tailscale direct, polling fallback, jumpstart |
| `pc/brenebase-agent.mjs`, `pc/install-agent.ps1` | The PC agent and its one-time installer |
| `start.sh` | Joins the tailnet (if `TS_AUTHKEY` is set), then starts the app |
| `test.mjs` | 20 sample thoughts and where they should go, plus 10 split checks |

## Run it
Locally:
```
cd hub && npm install && HUB_WORKER_TOKEN=pick-one node server.mjs
```
Then open http://localhost:8080

On the PC (PowerShell), alongside the Wizra bridge:
```
setx HUB_URL "http://localhost:8080"; setx HUB_WORKER_TOKEN "<same secret>"; setx REPOS "C:\Users\<you>\repos"
node hub\worker\hub-worker.mjs
```

Deploying to Fly (not done yet):
```
fly apps create brenebase; fly volumes create brenebase_data -s 1 -r iad -a brenebase
fly secrets set -a brenebase HUB_PASSWORD=... HUB_WORKER_TOKEN=... TS_AUTHKEY=... PC_TAILNET_HOST=... ANTHROPIC_API_KEY=... MESHY_API_KEY=... GITHUB_TOKEN=...
fly deploy --ha=false
```
Only `HUB_PASSWORD` and `HUB_WORKER_TOKEN` are required. Everything else turns on one part. For `TS_AUTHKEY`, make a reusable auth key in the Tailscale admin console (Settings, Keys).

## What was tested (2026-11-21, in the cloud container)
- Routing: 20 of 20 sample thoughts went where expected (`node test.mjs`). The rules were tuned against these same samples, so real use will miss some. You can override any pick on the page.
- End to end with a stand-in for Bionic: a Vent job was queued, picked up by the worker, answered and shown in Jobs.
- The Coder brief held back the `[[local]]` part and removed a password.
- Meshy and Deploy jobs both waited for an OK even on `auto`.
- A wrong worker token was refused.
- The phone layout was checked in an iPhone-size screenshot.

- Split, end to end, with a stand-in `claude` command and a stand-in PC model:
  - Code part, then story part (with the code's event names), then hand-filled models, then the merge.
  - Files landed where the manifest said, the test passed, and both commits were made on the branch.
  - The brief Claude received had no art or story words. The only match was the repo name.
  - A wrong file type was rejected.

- Projects: the cards load; the GitHub sources synced (through this container's proxy); a new line in a source was caught and logged; requests matched their project and showed the right known issue; a work Expert job moved to the PC model; the Claude Code brief got rules only, no setting values.
- PC agent with a stand-in `lms`, model server, bridge and Tailscale proxy:
  - By polling: Start everything loaded the model and started the Wizra bridge, and starting the worker brought it online.
  - Through the stand-in Tailscale proxy: status, logs and Stop everything worked.
  - A wrong key was refused, and an action outside the list was refused.
  - A Companion job sent while the PC was idle started the worker and the model by itself.

## Not tested
- Real Claude API calls: there is no API key in this container. The Planner and Expert fail cleanly without one.
- A real Meshy job: I did not want to spend your credits. The list endpoints answer. The field names for image, retexture and rig requests need checking on the first real run.
- Claude Code, Blender and the pipeline scripts on your actual PC.
- A split with real Claude Code output. Whether it reliably writes `hub-merge.json` will show on the first run. The hub falls back to the planned paths if it does not.
- Triangle counts and rigs are not checked at merge yet, only file types.
- Real Tailscale: Brenebase joining a tailnet on Fly, and the real `lms` commands on your PC.
- Arden Hub sources: blocked in this container only (outside its GitHub access); they are public, so Fly should read them.
- The Breneland Drive progress files through the PC worker (paths unconfirmed).
- The PC installer script on Windows.
