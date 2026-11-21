# Hub: where a thought goes

One page you dump thoughts into. It works out which tool should handle each one, sends it there, gets the result back and files it in a job list.

**Status: built and tested locally. Not deployed.** Nothing here touches Brenai, the kiosk or Breneland-Next.

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
| `ledger.mjs` | The job list (one JSON file) |
| `server.mjs` | The page, the API and the PC queue |
| `public/index.html` | The phone page: Send, Jobs, Tools |
| `worker/hub-worker.mjs` | Runs on your PC. Connects out to the hub and does PC jobs: PC model, Claude Code, Blender, named scripts |
| `worker/blender_ops.py` | Headless Blender jobs: info, decimate, convert, and the allowed pipeline scripts |
| `test.mjs` | 20 sample thoughts and where they should go |

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

Deploying to Fly (not done yet; `fly.toml` uses a placeholder app name):
```
fly apps create <name>; fly volumes create hub_data -s 1 -r iad
fly secrets set HUB_PASSWORD=... HUB_WORKER_TOKEN=... ANTHROPIC_API_KEY=... MESHY_API_KEY=...
fly deploy --ha=false
```

## What was tested (2026-11-21, in the cloud container)
- Routing: 20 of 20 sample thoughts went where expected (`node test.mjs`). The rules were tuned against these same samples, so real use will miss some. You can override any pick on the page.
- End to end with a stand-in for Bionic: a Vent job was queued, picked up by the worker, answered and shown in Jobs.
- The Coder brief held back the `[[local]]` part and removed a password.
- Meshy and Deploy jobs both waited for an OK even on `auto`.
- A wrong worker token was refused.
- The phone layout was checked in an iPhone-size screenshot.

## Not tested
- Real Claude API calls: there is no API key in this container. The Planner and Expert fail cleanly without one.
- A real Meshy job: I did not want to spend your credits. The list endpoints answer. The field names for image, retexture and rig requests need checking on the first real run.
- Claude Code, Blender and the pipeline scripts on your actual PC.
