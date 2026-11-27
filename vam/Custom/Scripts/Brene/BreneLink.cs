// Brene for Virt-a-Mate: the link to the Brene relay on this PC (vam/relay/brene-relay.mjs, http://127.0.0.1:8767).
// The relay gathers the glasses' head pose (from viture-bridge.py), hand tracking (from its hands page) and Wizra's replies
// (from brenai.fly.dev or LM Studio), so this side only makes small local HTTP requests and never holds a password.
//   GET  /state  -> {"pose":{"yaw","pitch","roll","pos":[x,y,z],"age"},"hands":[{"id","x","y","size","pinch","closed"}],"glasses":bool,"handsOn":bool}
//   POST /chat   {"text"} -> {"text"} or {"error"}
using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using SimpleJSON;

namespace Brene
{
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
        float lastOk = -10f;

        // keeps asking the relay for its state, one request at a time, as fast as it answers (about 60 a second on this PC)
        public IEnumerator Poll(Func<bool> wanted)
        {
            while (true)
            {
                if (!wanted()) { Connected = false; yield return new WaitForSeconds(0.5f); continue; }
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
        public IEnumerator Chat(string text, Action<string, string> done)
        {
            var body = new JSONClass(); body["text"] = text;
            var req = new UnityWebRequest(Url + "/chat", "POST");
            req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString()));
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            req.timeout = 180;
            yield return req.SendWebRequest();
            if (req.isNetworkError) { done(null, "The Brene relay is not running on this PC (" + req.error + ")"); req.Dispose(); yield break; }
            JSONNode j = null;
            try { j = JSON.Parse(req.downloadHandler.text); } catch (Exception) { }
            if (j == null) done(null, "Bad answer from the relay");
            else if (j["error"] != null && j["error"].Value != "") done(null, j["error"].Value);
            else done(j["text"].Value, null);
            req.Dispose();
        }
    }
}
