// Brene for Virt-a-Mate: the link to the Brene relay on this PC (vam/relay/brene-relay.mjs, http://127.0.0.1:8767).
// The relay gathers the glasses' head pose (from viture-bridge.py), hand tracking (from its hands page) and Wizra's replies
// (from brenai.fly.dev or LM Studio), so this side only makes small local HTTP requests and never holds a password.
//   GET  /state  -> {"pose":{"yaw","pitch","roll","pos":[x,y,z],"age"},"hands":[{"id","x","y","size","pinch","closed"}],"glasses":bool,"handsOn":bool}
//   POST /chat   {"text"} -> {"text"} or {"error"}
//   /state may carry "cmd" {"id","kind":"scene|look|pose|rescan","path","person"} from the library page; the plugin runs it and
//   POST /vam    {"people":[uids],"selected","done":id,"error"} reports back (also once a second, so the page lists the people)
using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
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

        // keeps asking the relay for its state, one request at a time, as fast as it answers (about 60 a second on this PC)
        public IEnumerator Poll(Func<bool> wanted)
        {
            while (true)
            {
                if (!wanted()) { Connected = false; yield return new WaitForSeconds(0.5f); continue; }
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
                    req.Dispose(); yield return new WaitForSeconds(1f); continue;
                }
                try { Read(JSON.Parse(req.downloadHandler.text)); lastOk = Time.realtimeSinceStartup; Connected = true; Error = ""; }
                catch (Exception ex) { Error = "Bad answer from the relay: " + ex.Message; }
                req.Dispose();
                yield return null;
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

        // one message to Wizra; done(reply, error)
        // one line to a member of the cast (Little Shepersville): /story/say with where you are and who is there
        public IEnumerator Say(string who, string text, string place, List<string> present, bool voice, Action<string, string, string> done)
        {
            var body = new JSONClass(); body["who"] = who; body["text"] = text; body["place"] = place ?? ""; body["voice"].AsBool = voice;
            var arr = new JSONArray(); foreach (var p in present) arr.Add(p); body["present"] = arr;
            var req = new UnityWebRequest(Url + "/story/say", "POST");
            req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString())); req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json"); req.timeout = 180;
            yield return req.SendWebRequest();
            if (req.isNetworkError) { done(null, "The Brene relay is not running on this PC (" + req.error + ")", null); req.Dispose(); yield break; }
            JSONNode j = null; try { j = JSON.Parse(req.downloadHandler.text); } catch (Exception) { }
            req.Dispose();
            if (j == null) done(null, "Bad answer from the relay", null);
            else if (j["error"] != null && j["error"].Value != "") done(null, j["error"].Value, null);
            else done(j["text"].Value, null, j["voice"] != null && j["voice"].Value != "" && j["voice"].Value != "null" ? j["voice"].Value : null);
        }

        // done(reply, error, voiceId): voiceId is set when the relay is making her voice for this reply (GET /voice?id=)
        public IEnumerator Chat(string text, bool voice, Action<string, string, string> done)
        {
            var body = new JSONClass(); body["text"] = text; body["voice"].AsBool = voice;
            var req = new UnityWebRequest(Url + "/chat", "POST");
            req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString()));
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            req.timeout = 180;
            yield return req.SendWebRequest();
            if (req.isNetworkError) { done(null, "The Brene relay is not running on this PC (" + req.error + ")", null); req.Dispose(); yield break; }
            JSONNode j = null;
            try { j = JSON.Parse(req.downloadHandler.text); } catch (Exception) { }
            if (j == null) done(null, "Bad answer from the relay", null);
            else if (j["error"] != null && j["error"].Value != "") done(null, j["error"].Value, null);
            else done(j["text"].Value, null, j["voice"] != null && j["voice"].Value != "" && j["voice"].Value != "null" ? j["voice"].Value : null);
            req.Dispose();
        }
    }
}
