// Brene for Virt-a-Mate: the link to the Brene relay on this PC (vam/relay/brene-relay.mjs, http://127.0.0.1:8767).
// The relay gathers the glasses' head pose (from viture-bridge.py), hand tracking (from its hands page) and Wizra's replies
// (from brenai.fly.dev or LM Studio), so this side only makes small local HTTP requests and never holds a password.
//   GET  /state  -> {"pose":{"yaw","pitch","roll","pos":[x,y,z],"age"},"hands":[{"id","x","y","size","pinch","closed"}],"glasses":bool,"handsOn":bool}
//   POST /chat   {"text"} -> {"text"} or {"error"}
//   POST /story/say {who, text, place, present, voice, mode} -> {text, voice, events?, calling?}; POST /story/call {who, action}
//   /state may carry "cmd" {"id","kind":"scene|look|pose|rescan","path","person"} from the library page; the plugin runs it and
//   POST /vam    {"people":[uids],"selected","done":id,"error"} reports back (also once a second, so the page lists the people)
using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Networking;
using SimpleJSON;

namespace Brene
{
    // VaM fields whose exact type differs between versions (or from what we expected): each is read as a plain Unity object, so any
    // of Camera, Transform, a MonoBehaviour or a GameObject works. (VaM 1.22's centerCameraTarget turned out to be a CameraTarget.)
    public static class Vam
    {
        public static Transform T(UnityEngine.Object o)
        {
            var c = o as Component; if (c != null) return c.transform;
            var g = o as GameObject; return g != null ? g.transform : null;
        }
        public static Camera MonitorCam()
        {
            var sc = SuperController.singleton; if (sc == null) return null;
            var t = T(sc.MonitorCenterCamera as UnityEngine.Object); if (t == null) return null;
            var cam = t.GetComponent<Camera>(); if (cam == null) cam = t.GetComponentInChildren<Camera>(); return cam;
        }
        public static Transform CenterTarget() { var sc = SuperController.singleton; return sc == null ? null : T(sc.centerCameraTarget as UnityEngine.Object); }
        public static Transform Ctrl(FreeControllerV3 fc) { if (fc == null) return null; var t = T(fc.control as UnityEngine.Object); return t != null ? t : fc.transform; }
    }

    public class HandState { public int id; public float x, y, size; public bool pinch, closed; }

    public class Link
    {
        public string Url = "http://127.0.0.1:8767";
        public bool Connected;          // the relay answered lately
        public bool Glasses;            // the relay has head pose from the glasses
        public float Yaw, Pitch, Roll;  // degrees: yaw + = head turned left, pitch + = up, roll + = tilted to the right
        public Vector3 Pos;             // metres: x right, y up, z back (toward the wearer)
        public bool HasPos;
        public readonly List<HandState> Hands = new List<HandState>();
        public string Error = "";
        float lastOk = -10f, nextReport;
        int lastCmd;
        public Func<JSONNode, string> OnCmd;   // runs a library command; returns an error or null
        public Func<JSONClass> Report;          // what the scene looks like now (people, selected)
        int doneId; string doneErr;

        public const string NOT_RUNNING = "The Brene relay is not running. Double-click start-brene.bat.";

        // keeps asking the relay for its state, one request at a time: as fast as it answers while the glasses or hands are
        // sending (about 60 a second on this PC), ten times a second otherwise (enough for the library page's commands).
        // Waits are counted in real time, so VaM's time scale or a frozen scene cannot slow or stop the link.
        public IEnumerator Poll(Func<bool> wanted)
        {
            float until;
            while (true)
            {
                if (!wanted()) { Connected = false; until = Time.realtimeSinceStartup + 0.5f; while (Time.realtimeSinceStartup < until) yield return null; continue; }
                if (Report != null && (doneId != 0 || Time.realtimeSinceStartup > nextReport))
                {
                    nextReport = Time.realtimeSinceStartup + 1f;
                    var rep = Report(); if (doneId != 0) { rep["done"].AsInt = doneId; if (doneErr != null) rep["error"] = doneErr; doneId = 0; doneErr = null; }
                    var pr = new UnityWebRequest(Url + "/vam", "POST");
                    pr.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(rep.ToString())); pr.downloadHandler = new DownloadHandlerBuffer();
                    pr.SetRequestHeader("Content-Type", "application/json"); pr.timeout = 2;
                    yield return pr.SendWebRequest(); pr.Dispose();
                }
                var req = UnityWebRequest.Get(Url + "/state"); req.timeout = 2;
                yield return req.SendWebRequest();
                if (req.isNetworkError || req.isHttpError)
                {
                    Error = "The Brene relay is not answering on " + Url + " (" + req.error + ")";
                    if (Time.realtimeSinceStartup - lastOk > 2f) { Connected = false; Glasses = false; Hands.Clear(); }
                    req.Dispose(); until = Time.realtimeSinceStartup + 1f; while (Time.realtimeSinceStartup < until) yield return null; continue;
                }
                try
                {
                    var j = JSON.Parse(req.downloadHandler.text);
                    if (j == null) Error = "The relay sent an answer Brene could not read";
                    else { Read(j); lastOk = Time.realtimeSinceStartup; Connected = true; Error = ""; }
                }
                catch (Exception ex) { Error = "The relay sent an answer Brene could not read: " + ex.Message; }
                req.Dispose();
                if (Glasses || Hands.Count > 0) yield return null;
                else { until = Time.realtimeSinceStartup + 0.1f; while (Time.realtimeSinceStartup < until) yield return null; }
            }
        }

        void Read(JSONNode j)
        {
            var cmd = j["cmd"];
            if (cmd != null && cmd["id"] != null && cmd["id"].AsInt != lastCmd && OnCmd != null)
            {
                lastCmd = cmd["id"].AsInt; string err;
                try { err = OnCmd(cmd); } catch (Exception ex) { err = ex.Message; }
                doneId = lastCmd; doneErr = err;
            }
            var p = j["pose"];
            Glasses = j["glasses"].AsBool && p != null && p["yaw"] != null;
            if (Glasses)
            {
                Yaw = p["yaw"].AsFloat; Pitch = p["pitch"].AsFloat; Roll = p["roll"].AsFloat;
                var pos = p["pos"].AsArray;
                HasPos = pos != null && pos.Count == 3;
                if (HasPos) Pos = new Vector3(pos[0].AsFloat, pos[1].AsFloat, pos[2].AsFloat);
            }
            Hands.Clear();
            var hs = j["hands"].AsArray;
            if (hs != null) for (int i = 0; i < hs.Count; i++)
            {
                var h = hs[i];
                Hands.Add(new HandState { id = h["id"].AsInt, x = h["x"].AsFloat, y = h["y"].AsFloat, size = h["size"].AsFloat, pinch = h["pinch"].AsBool, closed = h["closed"].AsBool });
            }
        }

        // ---- one JSON request to the relay: every panel's questions and answers go through here ----
        // done(answer, error): error is null when all is well; the answer is still given when the relay sent one with its error
        public IEnumerator Json(string method, string path, JSONNode body, int timeout, Action<JSONNode, string> done)
        {
            var req = new UnityWebRequest(Url + path, method); req.downloadHandler = new DownloadHandlerBuffer(); req.timeout = timeout;
            if (body != null) { req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString())); req.SetRequestHeader("Content-Type", "application/json"); }
            yield return req.SendWebRequest();
            if (req.isNetworkError)
            {
                bool late = req.error != null && req.error.ToLowerInvariant().Contains("timeout");
                req.Dispose(); done(null, late ? "No answer in time. Try again." : NOT_RUNNING); yield break;
            }
            JSONNode j = null; try { j = JSON.Parse(req.downloadHandler.text); } catch (Exception) { }
            req.Dispose();
            if (j == null) done(null, "The relay sent an answer Brene could not read");
            else if (j["error"] != null && j["error"].Value != "") done(j, j["error"].Value);
            else done(j, null);
        }

        // one line to a member of the cast (Little Shepersville): /story/say with where you are and who is there
        // done(reply, error, voiceId): voiceId is set when the relay is making her voice for this reply (GET /voice?id=)
        // mode: "call" while on a call with her on the Phone, else "text"
        public IEnumerator Say(string who, string text, string place, List<string> present, bool voice, string mode, Action<string, string, string> done)
        {
            var body = new JSONClass(); body["who"] = who; body["text"] = text; body["place"] = place ?? ""; body["voice"].AsBool = voice; body["mode"] = mode == "call" ? "call" : "text";
            var arr = new JSONArray(); foreach (var p in present) arr.Add(p); body["present"] = arr;
            return Json("POST", "/story/say", body, 180, (JSONNode j, string e) => { if (j != null && OnPhone != null) { try { OnPhone(j); } catch (Exception) { } } Reply(j, e, done); });
        }
        public Action<JSONNode> OnPhone;   // a say answer can carry phone events (a call coming in); the plugin looks at them
        // one message to Wizra through her plain chat (the same answer shape as Say)
        public IEnumerator Chat(string text, bool voice, Action<string, string, string> done)
        {
            var body = new JSONClass(); body["text"] = text; body["voice"].AsBool = voice;
            return Json("POST", "/chat", body, 180, (JSONNode j, string e) => Reply(j, e, done));
        }
        static void Reply(JSONNode j, string e, Action<string, string, string> done)
        {
            if (e != null) { done(null, e, null); return; }
            var v = j["voice"];
            done(j["text"].Value, null, v != null && v.Value != "" && v.Value != "null" ? v.Value : null);
        }

        // ---- pictures from the relay ----
        // one picture; done(texture, or null when it could not be had). The caller owns the texture.
        public IEnumerator Picture(string pathAndQuery, Action<Texture2D> done)
        {
            var req = UnityWebRequest.Get(Url + pathAndQuery); req.timeout = 10;
            yield return req.SendWebRequest();
            Texture2D tex = null; if (!req.isNetworkError && !req.isHttpError && req.downloadHandler != null) tex = Pics.Decode(req.downloadHandler.data);
            req.Dispose();
            done(tex);
        }
        // the library thumbnails for a set of tiles, one at a time; stops as soon as the tiles are gone (the list was redrawn)
        public IEnumerator Thumbs(List<RawImage> tiles, List<string> thumbs)
        {
            for (int i = 0; i < tiles.Count && i < thumbs.Count; i++)
            {
                if (tiles[i] == null) yield break;
                var req = UnityWebRequest.Get(Url + "/lib/thumb?p=" + UnityWebRequest.EscapeURL(thumbs[i])); req.timeout = 10;
                yield return req.SendWebRequest();
                Texture2D tex = null; if (!req.isNetworkError && !req.isHttpError && req.downloadHandler != null) tex = Pics.Decode(req.downloadHandler.data);
                req.Dispose();
                if (tex == null) continue;
                if (tiles[i] == null) { UnityEngine.Object.Destroy(tex); yield break; }
                Pics.Show(tiles[i], tex, true);
            }
        }
    }

    // a picture that belongs to one tile: freed together with the tile, so browsing does not pile pictures up in memory
    public class PicOwner : MonoBehaviour
    {
        public Texture2D tex;
        void OnDestroy() { if (tex != null) Destroy(tex); }
    }

    // picture tiles (looks, hair, clothes, poses, scenes) and their pictures: one builder, one decoder
    public static class Pics
    {
        // a tile in a grid: tap anywhere on it. Returns its picture area, dim until Show puts a picture in.
        public static RawImage Tile(RectTransform grid, string name, Action tap)
        {
            var tile = Ui.Rect("Tile " + name, grid); var bg = Ui.Box(tile, Role.Button);
            var bt = tile.gameObject.AddComponent<Button>(); bt.targetGraphic = bg; bt.onClick.AddListener(() => tap());
            var pic = Ui.Rect("Pic", tile); pic.anchorMin = Vector2.zero; pic.anchorMax = Vector2.one; pic.offsetMin = new Vector2(6, 34); pic.offsetMax = new Vector2(-6, -6);
            var raw = pic.gameObject.AddComponent<RawImage>(); raw.color = new Color(1, 1, 1, 0.08f); raw.raycastTarget = false;
            var cap = Ui.Rect("Cap", tile); Ui.Bottom(cap, 32, 0);
            Ui.Label(cap, name, 15, Role.Text, TextAnchor.MiddleCenter);
            return raw;
        }
        // JPG or PNG bytes as a texture, or null. The only place Brene decodes a picture (Texture2D.LoadImage).
        public static Texture2D Decode(byte[] data)
        {
            if (data == null || data.Length == 0) return null;
            var tex = new Texture2D(2, 2);
            if (tex.LoadImage(data)) return tex;
            UnityEngine.Object.Destroy(tex); return null;
        }
        // owned: the picture is this tile's alone and is freed with it; not owned: it is shared (kept by whoever loaded it)
        public static void Show(RawImage raw, Texture2D tex, bool owned)
        {
            raw.texture = tex; raw.color = Color.white;
            if (!owned) return;
            var o = raw.GetComponent<PicOwner>(); if (o == null) o = raw.gameObject.AddComponent<PicOwner>();
            if (o.tex != null && o.tex != tex) UnityEngine.Object.Destroy(o.tex);
            o.tex = tex;
        }
    }
}
