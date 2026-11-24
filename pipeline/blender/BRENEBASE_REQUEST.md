# Request for Brenebase: make 3D models from pictures on Andrew's PC

Written 2026-11-24 by the Brenai session for whichever session works on Brenebase next. Andrew asked for this. It stands alone: you do not need the earlier conversations.

## What Andrew wants

1. On Brenebase's PC screen, a clear way to turn the 3D model maker (Hunyuan3D) on and off, next to Wizra.
2. From Brenebase, send a picture to Blender on his PC and get a 3D model made from it.
3. The PC screen cleaned up so it is easier to read. His words: "clean up that screen so it's a little easier to read and understand".

He reads mostly on his phone. Plain words, short labels, one clear state per thing (on, off, starting, failed), one obvious button each. Never use em dashes. Report what was done, what was tested and what was not.

## Where things stand

- The previous Brenebase session ("Multi-agent work distribution system") built item 1 as one graphics card switch, "Wizra" or "3D model maker", with on / starting / failed / off states. Its last status: built and tested, NOT deployed, waiting for Andrew to say "deploy" and then tap Update on the PC tab. Andrew could not find the switch because it is not live. First job: find that work (Brenebase repo `brenemanandrew/brenebase`, or branch `claude/multi-agent-work-router-w9jzlg`), check it, and get it deployed with his go-ahead.
- Item 2 is not started on the Brenebase side. The Blender side is done (below).
- Item 3: unknown how far the cleanup got. Check before redoing it.

## Facts about the PC

- Hunyuan3D-2 is installed at `F:\Projects\Hunyuan3D` in its own `.venv`. Start: `F:\Projects\Hunyuan3D\start_hunyuan3d.bat`, which runs `python api_server.py --host 127.0.0.1 --port 8081 --enable_tex`. Stop: end that process.
- It is a FastAPI server on `http://127.0.0.1:8081`. There is no health route: treat any HTTP answer from that port (even 404 or 405) as "up".
- First ever start downloads about 10 GB and loads in about 4.5 minutes. Later starts are faster. Show "starting" during that time, not "failed".
- Card: RTX 5060 Ti 16 GB. Hunyuan3D peaks at 16.0 GB with colours. Wizra's model in LM Studio (`mn-violet-lotus-12b`, about 12 GB) must be unloaded first. The two cannot run together. Never unload her model without Andrew pressing something.
- Not set to start with Windows, on purpose.
- Speed: about 36 s for shape only, 65 s with colours.
- A failed job never reports an error on Hunyuan3D's side; it just stays "processing".
- Licence: Tencent Hunyuan non-commercial.
- Wizra's live status: `GET https://brenai.fly.dev/api/online` returns `{online, model, voice}` (needs the site login cookie).

## The Blender side (done, in this repo)

`pipeline/blender/image_to_3d_addon.py` is a Blender add-on, "Image to 3D", version 1.2. When Andrew ticks "Take jobs from other tools (Brenebase)" in its preferences, Blender listens on the PC only, `127.0.0.1:8082` (the port can be changed there):

| Call | Answer |
|---|---|
| `GET /` | `{"ok": true, "busy": bool, "service": "local" or "meshy"}`. Use as "is Blender open and listening". |
| `POST /job` | `{"id": "..."}`. JSON body: `{"image_base64": "..."}` (png or jpg, a `data:` prefix is fine) or `{"image_path": "C:\\path\\on\\the\\pc.png"}`. Optional: `name`, `texture` (bool, default true), `detail` (`draft`, `normal`, `fine`), `seed` (int), `polycount` (int, 0 leaves it to the model), `pose` (Meshy only). Up to 60 MB. |
| `GET /job/<id>` | `{"status": "queued" / "working" / "importing" / "done" / "error", "text": "...", "objects": ["names added to the scene"]}` |

One job runs at a time and the rest wait in line. The finished model is imported into whatever scene is open in Blender. The add-on gives up on a job after 15 minutes.

Because it is local-only, the call must come from the part of Brenebase that runs on his PC, not from the cloud.

## What to build

- A "Make 3D model" job in Brenebase: pick or upload a picture, optional name and "with colours", send it to the PC helper, which POSTs `/job` and polls `/job/<id>`, then report done with the object name, or the error text.
- Before sending, check the three things a job needs and say in plain words which one is missing: Blender open and listening (port 8082), Hunyuan3D running (port 8081), PC online.
- Show the job in Brenebase's own job list with a visible finished or failed state. Andrew has asked before for a report when a job completes.

## Tested and not tested

- The add-on's listener was tested against a mock of Blender and a stand-in Hunyuan3D server: two jobs in a row, queueing, naming, error messages. It has NOT been run in real Blender.
- Hunyuan3D itself was tested for real on the PC by the "Brenai: PC tools" session through `/send` and `/status`.
- Nothing on the Brenebase side of item 2 exists yet.

## Limits

- Do not put tokens, PINs or passwords in the repo or in chat. Do not ask Andrew to paste secrets.
- Do not ship anything to the main Breneland game.
- The add-on file belongs to the Brenai session. If it needs a change, ask that session rather than editing it.
