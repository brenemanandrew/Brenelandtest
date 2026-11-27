# Image to 3D - a Blender add-on.
# Pick a picture, press the button, and a 3D model made from it is brought into the scene.
# Two ways to make the model, chosen in the add-on's preferences:
#   1. Hunyuan3D running on this computer (free, needs a strong graphics card). Tencent's open source Hunyuan3D-2 or 2.1 comes with a
#      small server, api_server.py. Start it first, for example:   python api_server.py --host 127.0.0.1 --port 8081
#      (Hunyuan3D-2: add --enable_tex for colours.) This add-on sends the picture to it and waits for the model.
#      On Andrew's PC: F:\Projects\Hunyuan3D\start_hunyuan3d.bat. It needs the whole graphics card, so close Wizra's model first.
#      Hunyuan3D's licence is non-commercial.
#   2. Meshy's online service (meshy.ai). Needs a Meshy API key and uses Meshy credits for each model.
#
# Install: Blender > Edit > Preferences > Add-ons > Install from Disk (the arrow at the top right in Blender 4.2+, or the
# "Install..." button in older ones) > pick this file > tick it on. Open its entry there to choose the service. Then in the 3D
# view press N and open the "Image to 3D" tab.
#
# Made for Blender 3.6 and newer. Written without a copy of Blender to try it in: the parts that talk to Hunyuan3D and Meshy were
# checked on their own (Hunyuan3D against a stand-in server that follows api_server.py), the Blender panel was not.

bl_info = {
    "name": "Image to 3D",
    "author": "Breneland tools",
    "version": (1, 2, 0),
    "blender": (3, 6, 0),
    "location": "3D View > Sidebar (N) > Image to 3D",
    "description": "Make a 3D model from a picture (Hunyuan3D on this computer, or Meshy) and bring it into the scene",
    "category": "Import-Export",
}

import base64
import json
import mimetypes
import os
import tempfile
import threading
import time
import urllib.error
import urllib.request

API = "https://api.meshy.ai/openapi/v1/image-to-3d"


# ---------------------------------------------------------------- talking to Meshy (no Blender needed for this part)

def _call(method, url, key, body=None, timeout=120):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("User-Agent", "blender-image-to-3d/1.0")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")[:400]
        try:
            text = json.loads(text).get("message") or text
        except Exception:
            pass
        if e.code == 401:
            text = "Meshy did not accept the API key."
        elif e.code == 402:
            text = "Not enough Meshy credits."
        raise RuntimeError("Meshy said no (%d): %s" % (e.code, text))
    except urllib.error.URLError as e:
        raise RuntimeError("Could not reach Meshy: %s" % e.reason)


def image_as_data_uri(path):
    kind = mimetypes.guess_type(path)[0] or "image/png"
    if kind not in ("image/png", "image/jpeg"):
        raise RuntimeError("Use a .png or .jpg picture.")
    size = os.path.getsize(path)
    if size > 15 * 1024 * 1024:
        raise RuntimeError("That picture is over 15 MB. Use a smaller one.")
    with open(path, "rb") as f:
        return "data:%s;base64,%s" % (kind, base64.b64encode(f.read()).decode("ascii"))


def start_task(key, image_path, pose="", texture=True, polycount=0):
    body = {"image_url": image_as_data_uri(image_path), "should_texture": bool(texture)}
    if pose:
        body["pose_mode"] = pose          # "a-pose" or "t-pose": for characters that will be rigged
    if polycount:
        body["should_remesh"] = True
        body["target_polycount"] = int(polycount)
    out = _call("POST", API, key, body)
    task = out.get("result") or out.get("id")
    if not task:
        raise RuntimeError("Meshy gave no task number back.")
    return task


def task_state(key, task):
    return _call("GET", API + "/" + task, key, timeout=60)


def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "blender-image-to-3d/1.0"})
    with urllib.request.urlopen(req, timeout=600) as r, open(path, "wb") as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)
    return path


def make_model(key, image_path, pose, texture, polycount, say, stop):
    """Runs start to finish. say(text, percent) reports progress; stop() returning True gives up. Returns the .glb path."""
    say("Sending the picture...", 0)
    task = start_task(key, image_path, pose, texture, polycount)
    began = time.time()
    while True:
        if stop():
            raise RuntimeError("Stopped. (The model may still finish on Meshy's side.)")
        if time.time() - began > 45 * 60:
            raise RuntimeError("Gave up after 45 minutes. Look for the model on meshy.ai.")
        st = task_state(key, task)
        status = st.get("status", "")
        if status == "SUCCEEDED":
            url = (st.get("model_urls") or {}).get("glb") or st.get("model_url")
            if not url:
                raise RuntimeError("Meshy finished but gave no model file.")
            say("Downloading the model...", 100)
            name = os.path.splitext(os.path.basename(image_path))[0] or "model"
            return download(url, os.path.join(tempfile.gettempdir(), "meshy_%s_%s.glb" % (name, task[:8])))
        if status in ("FAILED", "CANCELED", "EXPIRED"):
            err = st.get("task_error") or {}
            raise RuntimeError("Meshy could not make the model: %s" % (err.get("message") or status))
        say("Meshy is making the model...", int(st.get("progress") or 0))
        time.sleep(5)


# ---------------------------------------------------------------- talking to Hunyuan3D on this computer (api_server.py)

# (octree_resolution, num_inference_steps). Set for the "turbo" shape model api_server.py loads by default, which wants about 5 steps.
# Measured on Andrew's PC (RTX 5060 Ti 16 GB, Hunyuan3D-2mini turbo, 256 and 5 steps): 36 s for shape, 65 s with colours, and the
# card was full with colours on, so "fine" is only a small step up.
DETAIL = {"draft": (196, 5), "normal": (256, 5), "fine": (320, 8)}


def _local(method, url, body=None, timeout=120):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))      # this computer: never through a proxy
    try:
        with opener.open(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError("Hunyuan3D said no (%d): %s" % (e.code, e.read().decode("utf-8", "replace")[:300]))
    except (urllib.error.URLError, OSError) as e:
        raise RuntimeError("Could not reach Hunyuan3D at %s. Is api_server.py running? (%s)" % (url.split("/send")[0].split("/status")[0], getattr(e, "reason", e)))


def make_model_local(server, image_path, texture, polycount, detail, seed, say, stop):
    """Hunyuan3D's own server: POST /send starts the work and gives a uid, GET /status/<uid> says processing, texturing, completed
    (with the .glb as base64) or error. Returns the .glb path."""
    server = (server or "http://127.0.0.1:8081").rstrip("/")
    size = os.path.getsize(image_path)
    if size > 30 * 1024 * 1024:
        raise RuntimeError("That picture is over 30 MB. Use a smaller one.")
    with open(image_path, "rb") as f:
        picture = base64.b64encode(f.read()).decode("ascii")
    octree, steps = DETAIL.get(detail, DETAIL["normal"])
    body = {"image": picture, "texture": bool(texture), "seed": int(seed), "octree_resolution": octree, "num_inference_steps": steps, "guidance_scale": 5.0, "type": "glb"}
    if polycount:
        body["face_count"] = int(polycount)
    say("Sending the picture to Hunyuan3D...", 0)
    uid = _local("POST", server + "/send", body).get("uid")
    if not uid:
        raise RuntimeError("Hunyuan3D gave no job number back.")
    began = time.time()
    while True:
        if stop():
            raise RuntimeError("Stopped waiting. (Hunyuan3D may still be working.)")
        waited = int(time.time() - began)
        if waited > 15 * 60:        # this server never reports a failure: a job that broke just stays "processing"
            raise RuntimeError("No model after 15 minutes, so it most likely failed. Look at the Hunyuan3D window for the reason (often: out of graphics memory).")
        st = _local("GET", server + "/status/" + uid, timeout=300)
        status = st.get("status", "")
        if status == "completed" and st.get("model_base64"):
            name = os.path.splitext(os.path.basename(image_path))[0] or "model"
            path = os.path.join(tempfile.gettempdir(), "hunyuan_%s_%s.glb" % (name, uid[:8]))
            with open(path, "wb") as f:
                f.write(base64.b64decode(st["model_base64"]))
            return path
        if status == "error":
            raise RuntimeError("Hunyuan3D could not make the model: %s" % (st.get("message") or "no reason given"))
        say("Hunyuan3D is %s... %d:%02d" % ("adding colours" if status == "texturing" else "making the shape", waited // 60, waited % 60), -1)
        time.sleep(4)


# ---------------------------------------------------------------- the Blender side

try:
    import bpy
except ImportError:            # lets the part above be used and tested outside Blender
    bpy = None

if bpy:
    JOB = {"thread": None, "text": "", "pct": 0, "glb": "", "error": "", "stop": False, "name": ""}

    class I3D_Prefs(bpy.types.AddonPreferences):
        bl_idname = __name__
        service: bpy.props.EnumProperty(name="Made by", default="local",
                                        items=[("local", "Hunyuan3D on this computer", "Free. Needs Hunyuan3D's api_server.py running"),
                                               ("meshy", "Meshy (online)", "Needs a Meshy API key and uses credits")])
        server: bpy.props.StringProperty(name="Hunyuan3D address", default="http://127.0.0.1:8081",
                                         description="Where Hunyuan3D's api_server.py is listening")
        listen: bpy.props.BoolProperty(name="Take jobs from other tools (Brenebase)", default=False, update=lambda self, context: _listen_changed(self, context),
                                       description="Let tools on this computer send pictures to be made into models while Blender is open")
        listen_port: bpy.props.IntProperty(name="Port", default=8082, min=1024, max=65535)
        api_key: bpy.props.StringProperty(name="Meshy API key", subtype="PASSWORD",
                                          description="From meshy.ai > API. Kept in Blender's preferences on this computer")

        def draw(self, context):
            self.layout.prop(self, "service")
            if self.service == "local":
                self.layout.prop(self, "server")
                self.layout.label(text="Start Hunyuan3D first: python api_server.py --host 127.0.0.1 --port 8081")
            else:
                self.layout.prop(self, "api_key")
                self.layout.label(text="Each model uses Meshy credits from this key's account.")
            row = self.layout.row()
            row.prop(self, "listen")
            row.prop(self, "listen_port")

    class I3D_Settings(bpy.types.PropertyGroup):
        image: bpy.props.StringProperty(name="Picture", subtype="FILE_PATH", description="A .png or .jpg of the thing to make")
        pose: bpy.props.EnumProperty(name="Pose", description="For characters you will rig, ask for a standard pose",
                                     items=[("", "As drawn", "Keep the pose in the picture"),
                                            ("a-pose", "A-pose", "Arms down at an angle"),
                                            ("t-pose", "T-pose", "Arms straight out")])
        texture: bpy.props.BoolProperty(name="With colours", default=True, description="Make the textures too (slower; on Meshy it costs more credits)")
        detail: bpy.props.EnumProperty(name="Detail", default="normal", description="Hunyuan3D only: finer takes longer and more graphics memory",
                                       items=[("draft", "Draft", "Quick look"), ("normal", "Normal", ""), ("fine", "Fine", "Slowest, most detail")])
        seed: bpy.props.IntProperty(name="Seed", default=1234, min=0, description="Hunyuan3D only: change it to get a different attempt from the same picture")
        polycount: bpy.props.IntProperty(name="Triangles", default=0, min=0, max=300000,
                                         description="Ask for about this many triangles. 0 leaves it to Meshy")

    class I3D_OT_make(bpy.types.Operator):
        bl_idname = "i3d.make"
        bl_label = "Make 3D model"
        bl_description = "Send the picture to Meshy and bring the finished model into the scene"
        _timer = None

        def execute(self, context):
            if JOB["thread"] and JOB["thread"].is_alive():
                self.report({"WARNING"}, "One is already being made.")
                return {"CANCELLED"}
            s = context.scene.i3d
            prefs = context.preferences.addons[__name__].preferences
            key, local, server = prefs.api_key.strip(), prefs.service == "local", prefs.server.strip()
            path = bpy.path.abspath(s.image)
            if not local and not key:
                self.report({"ERROR"}, "Put your Meshy API key in this add-on's preferences first.")
                return {"CANCELLED"}
            if not path or not os.path.isfile(path):
                self.report({"ERROR"}, "Pick a picture first.")
                return {"CANCELLED"}
            JOB.update(text="Starting...", pct=0, glb="", error="", stop=False, name=os.path.splitext(os.path.basename(path))[0])
            pose, texture, polycount, detail, seed = s.pose, s.texture, s.polycount, s.detail, s.seed

            def work():
                try:
                    def say(text, pct):
                        JOB["text"], JOB["pct"] = text, pct
                    if local:
                        JOB["glb"] = make_model_local(server, path, texture, polycount, detail, seed, say, lambda: JOB["stop"])
                    else:
                        JOB["glb"] = make_model(key, path, pose, texture, polycount, say, lambda: JOB["stop"])
                except Exception as e:      # shown in the panel
                    JOB["error"] = str(e)

            JOB["thread"] = threading.Thread(target=work, daemon=True)
            JOB["thread"].start()
            self._timer = context.window_manager.event_timer_add(1.0, window=context.window)
            context.window_manager.modal_handler_add(self)
            return {"RUNNING_MODAL"}

        def modal(self, context, event):
            if event.type != "TIMER":
                return {"PASS_THROUGH"}
            for area in context.screen.areas:
                if area.type == "VIEW_3D":
                    area.tag_redraw()
            if JOB["thread"].is_alive():
                return {"PASS_THROUGH"}
            context.window_manager.event_timer_remove(self._timer)
            if JOB["error"]:
                JOB["text"] = JOB["error"]
                self.report({"ERROR"}, JOB["error"])
                return {"CANCELLED"}
            before = set(bpy.data.objects)
            try:
                bpy.ops.import_scene.gltf(filepath=JOB["glb"])
            except Exception as e:
                JOB["text"] = "The model was made but could not be brought in: %s. It is saved at %s" % (e, JOB["glb"])
                self.report({"ERROR"}, JOB["text"])
                return {"CANCELLED"}
            new = [o for o in bpy.data.objects if o not in before]
            for o in new:
                if o.parent is None:
                    o.name = JOB["name"] or o.name
            JOB["text"] = "Done: %d object(s) added." % len(new)
            self.report({"INFO"}, JOB["text"])
            return {"FINISHED"}

    class I3D_OT_stop(bpy.types.Operator):
        bl_idname = "i3d.stop"
        bl_label = "Stop waiting"
        bl_description = "Stop waiting for the model (credits already spent are not returned)"

        def execute(self, context):
            JOB["stop"] = True
            return {"FINISHED"}

    class I3D_PT_panel(bpy.types.Panel):
        bl_label = "Image to 3D"
        bl_idname = "I3D_PT_panel"
        bl_space_type = "VIEW_3D"
        bl_region_type = "UI"
        bl_category = "Image to 3D"

        def draw(self, context):
            s, col = context.scene.i3d, self.layout.column()
            prefs = context.preferences.addons[__name__].preferences
            local = prefs.service == "local"
            col.label(text="Made by: " + ("Hunyuan3D on this computer" if local else "Meshy (online)"))
            col.label(text="(change in Preferences > Add-ons)   v%d.%d" % bl_info["version"][:2])
            col.prop(s, "image")
            if local:
                col.prop(s, "detail")
                col.prop(s, "seed")
            else:
                col.prop(s, "pose")
            col.prop(s, "texture")
            col.prop(s, "polycount")
            busy = bool(JOB["thread"] and JOB["thread"].is_alive())
            row = col.row()
            row.enabled = not busy
            row.operator("i3d.make", icon="MESH_MONKEY")
            if busy:
                col.label(text=JOB["text"] + (" %d%%" % JOB["pct"] if JOB["pct"] >= 0 else ""))
                col.operator("i3d.stop", icon="CANCEL")
            elif JOB["text"]:
                for i in range(0, len(JOB["text"]), 46):
                    col.label(text=JOB["text"][i:i + 46])
            if prefs.listen:
                col.label(text="Taking jobs on port %d%s" % (prefs.listen_port, ": %d waiting" % len(LISTEN["queue"]) if LISTEN["queue"] else ""), icon="LINKED")
                cur = LISTEN["jobs"].get(LISTEN["current"] or "")
                if cur:
                    col.label(text=("%s: %s" % (cur["name"], cur["text"]))[:60])
            if not local and not prefs.api_key.strip():
                col.label(text="Add your Meshy API key in", icon="ERROR")
                col.label(text="Preferences > Add-ons > this add-on.")

    # ------------------------------------------------------------ jobs from outside (Brenebase or any tool on this computer)
    # With "Take jobs from other tools" ticked, Blender listens on this computer only (127.0.0.1, port 8082 unless changed):
    #   GET  /            -> {"ok": true, "busy": bool, "service": "local" | "meshy"}
    #   POST /job  JSON   -> {"id": "..."}   body: {"image_base64": "..."} or {"image_path": "C:\\..."}, plus optional
    #                        "name", "texture" (bool), "detail" ("draft" | "normal" | "fine"), "seed", "polycount", "pose" (Meshy only)
    #   GET  /job/<id>    -> {"status": "queued" | "working" | "importing" | "done" | "error", "text": "...", "objects": [...]}
    # One job runs at a time; the rest wait in line. The finished model is brought into the open scene.
    import http.server
    import uuid

    LISTEN = {"server": None, "jobs": {}, "queue": [], "current": None}

    def _json(handler, code, obj):
        body = json.dumps(obj).encode("utf-8")
        handler.send_response(code)
        handler.send_header("Content-Type", "application/json")
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)

    class _JobHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            if self.path.startswith("/job/"):
                j = LISTEN["jobs"].get(self.path[5:])
                return _json(self, 200 if j else 404, {k: j[k] for k in ("status", "text", "objects")} if j else {"error": "no such job"})
            _json(self, 200, {"ok": True, "busy": bool(LISTEN["current"] or LISTEN["queue"]), "service": LISTEN.get("service", "local")})

        def do_POST(self):
            if self.path != "/job":
                return _json(self, 404, {"error": "POST /job"})
            try:
                n = int(self.headers.get("Content-Length") or 0)
                if n > 60 * 1024 * 1024:
                    return _json(self, 413, {"error": "too large"})
                d = json.loads(self.rfile.read(n).decode("utf-8"))
                jid = uuid.uuid4().hex[:12]
                if d.get("image_base64"):
                    raw = base64.b64decode(d["image_base64"].split(",")[-1])
                    ext = ".jpg" if raw[:2] == b"\xff\xd8" else ".png"
                    path = os.path.join(tempfile.gettempdir(), "i3d_job_%s%s" % (jid, ext))
                    with open(path, "wb") as f:
                        f.write(raw)
                else:
                    path = str(d.get("image_path") or "")
                    if not os.path.isfile(path):
                        return _json(self, 400, {"error": "give image_base64, or image_path to a picture on this computer"})
                name = "".join(c for c in str(d.get("name") or "") if c.isalnum() or c in " _-")[:40] or os.path.splitext(os.path.basename(path))[0]
                LISTEN["jobs"][jid] = {"status": "queued", "text": "Waiting in line", "objects": [], "path": path, "name": name, "glb": "",
                                       "texture": bool(d.get("texture", True)), "detail": str(d.get("detail") or "normal"), "seed": int(d.get("seed") or 1234),
                                       "polycount": int(d.get("polycount") or 0), "pose": str(d.get("pose") or "")}
                LISTEN["queue"].append(jid)
                _json(self, 200, {"id": jid})
            except Exception as e:
                _json(self, 400, {"error": str(e)})

    def _job_tick():
        """Runs on Blender's own thread about once a second: starts the next job and brings finished models in."""
        if not LISTEN["server"]:
            return None
        try:
            prefs = bpy.context.preferences.addons[__name__].preferences
            LISTEN["service"] = prefs.service
            cur = LISTEN["current"]
            if cur:
                j = LISTEN["jobs"][cur]
                if j["status"] == "importing":
                    before = set(bpy.data.objects)
                    try:
                        bpy.ops.import_scene.gltf(filepath=j["glb"])
                        new = [o for o in bpy.data.objects if o not in before]
                        for o in new:
                            if o.parent is None:
                                o.name = j["name"] or o.name
                        j["objects"] = [o.name for o in new]
                        j["status"], j["text"] = "done", "Done: %d object(s) added." % len(new)
                    except Exception as e:
                        j["status"], j["text"] = "error", "Made but could not be brought in: %s. Saved at %s" % (e, j["glb"])
                if j["status"] in ("done", "error"):
                    LISTEN["current"] = None
            if not LISTEN["current"] and LISTEN["queue"] and not (JOB["thread"] and JOB["thread"].is_alive()):
                jid = LISTEN["queue"].pop(0)
                j = LISTEN["jobs"][jid]
                LISTEN["current"] = jid
                j["status"], j["text"] = "working", "Starting..."
                key, local, server = prefs.api_key.strip(), prefs.service == "local", prefs.server.strip()

                def work(j=j):
                    try:
                        def say(text, pct):
                            j["text"] = text
                        if local:
                            j["glb"] = make_model_local(server, j["path"], j["texture"], j["polycount"], j["detail"], j["seed"], say, lambda: not LISTEN["server"])
                        elif key:
                            j["glb"] = make_model(key, j["path"], j["pose"], j["texture"], j["polycount"], say, lambda: not LISTEN["server"])
                        else:
                            raise RuntimeError("No Meshy API key is set in the add-on's preferences.")
                        j["status"] = "importing"
                    except Exception as e:
                        j["status"], j["text"] = "error", str(e)

                threading.Thread(target=work, daemon=True).start()
        except Exception as e:
            print("Image to 3D: job tick failed:", e)
        return 1.0

    def listen_start(port):
        if LISTEN["server"]:
            return
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", int(port)), _JobHandler)
        LISTEN["server"] = srv
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        bpy.app.timers.register(_job_tick, first_interval=1.0, persistent=True)

    def listen_stop():
        srv, LISTEN["server"] = LISTEN["server"], None
        if srv:
            srv.shutdown()
            srv.server_close()

    def _listen_changed(self, context):
        try:
            if self.listen:
                listen_start(self.listen_port)
            else:
                listen_stop()
        except OSError as e:
            print("Image to 3D: could not listen on port %s: %s" % (self.listen_port, e))

    def _listen_at_startup():
        try:
            prefs = bpy.context.preferences.addons[__name__].preferences
            if prefs.listen:
                listen_start(prefs.listen_port)
        except Exception as e:
            print("Image to 3D: could not start listening:", e)
        return None

    CLASSES = (I3D_Prefs, I3D_Settings, I3D_OT_make, I3D_OT_stop, I3D_PT_panel)

    def register():
        for c in CLASSES:
            bpy.utils.register_class(c)
        bpy.types.Scene.i3d = bpy.props.PointerProperty(type=I3D_Settings)
        bpy.app.timers.register(_listen_at_startup, first_interval=2.0)

    def unregister():
        listen_stop()
        del bpy.types.Scene.i3d
        for c in reversed(CLASSES):
            bpy.utils.unregister_class(c)
