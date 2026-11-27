// Brene for Virt-a-Mate: the cast in the scene (Wizra, Zoe, Belinda, Margo). Brenai is each one's mind; any VaM person can be
// each one's body.
//   Talking to   the Wizra panel talks to one of them at a time ("Talking to: Zoe"); the message goes with where you are and
//                who is in the scene (/story/say on the relay, which falls back to Wizra's normal chat until Brenai's story
//                routes exist).
//   Voice        each one's own Brenai voice, played from her head. Several can talk at once.
//   Lip sync     her mouth opens with the loudness of her voice.
//   Expressions  actions in her reply (*smiles*, *rolls her eyes*, *gasps*) show on her face for a few seconds, then ease off.
//   Eyes         she looks at you while she talks.
// Part of BreneMain. Morph names are matched the same way as the Character panel (any VaM version, the real name used).
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Networking;
using SimpleJSON;

namespace Brene
{
    public partial class BreneMain
    {
        static readonly string[] CAST = { "wizra", "zoe", "belinda", "margo" };
        static string Nice(string who) { return string.IsNullOrEmpty(who) ? "" : char.ToUpperInvariant(who[0]) + who.Substring(1); }

        class Voice { public GameObject go; public AudioSource src; public float mouth; public string mouthParam; public Atom atom; public string exprParam; public float exprUntil, exprAmt; }
        readonly Dictionary<string, Voice> voices = new Dictionary<string, Voice>();
        readonly float[] voiceBuf = new float[256];
        JSONStorableBool voiceOn; JSONStorableString wizraBody, castBodies; string talkTo = "wizra";
        Button bodyBtn, voiceBtn, whoBtn;
        public int WizraReplies;   // counts replies from anyone (the tutorial waits on it)
        static readonly string[] MOUTH = { "Mouth", "Mouth Open", "Mouth Open Wide", "Lips Part", "Jaw Open" };
        static readonly Dictionary<string, string[]> EXPR = new Dictionary<string, string[]> {
            { "smile", new[] { "Smile", "Smile Open Full Face", "Smile Full Face", "Smile Simple", "Smile" } },
            { "frown", new[] { "Frown", "Frown", "Mouth Frown", "Pout" } },
            { "surprise", new[] { "Surprise", "Surprise", "Eyes Widen", "Mouth Open Wide" } },
        };

        void InitWizra()
        {
            voiceOn = new JSONStorableBool("Their voices", true, (bool v) => { if (voiceBtn != null) { Ui.SetOn(voiceBtn, v); Ui.SetText(voiceBtn, v ? "Voice: on" : "Voice: off"); } });
            RegisterBool(voiceOn); CreateToggle(voiceOn);
            wizraBody = new JSONStorableString("Wizra's body (person)", "", (string v) => ShowBody()); RegisterString(wizraBody);   // kept from before the cast
            castBodies = new JSONStorableString("Cast bodies", "{}", (string v) => ShowBody()); RegisterString(castBodies);            // {"zoe":"Person#2", ...}
        }

        // ---- who is whose body ----
        string BodyUid(string who)
        {
            if (who == "wizra" && !string.IsNullOrEmpty(wizraBody.val)) return wizraBody.val;
            try { var j = JSON.Parse(castBodies.val); if (j != null && j[who] != null) return j[who].Value; } catch (Exception) { }
            return "";
        }
        void SetBody(string who, string uid)
        {
            if (who == "wizra") { wizraBody.val = uid; return; }
            JSONNode j = null; try { j = JSON.Parse(castBodies.val); } catch (Exception) { }
            var c = j as JSONClass; if (c == null) c = new JSONClass();
            c[who] = uid ?? ""; castBodies.val = c.ToString();
        }
        Atom BodyOf(string who) { var uid = BodyUid(who); return string.IsNullOrEmpty(uid) ? null : SuperController.singleton.GetAtomByUid(uid); }
        Atom Body() { return BodyOf("wizra"); }
        public void MakeWizra(Atom a) { if (a != null) SetBody("wizra", a.uid); }
        public void MakeCast(string who, Atom a) { if (a != null) SetBody(who, a.uid); }
        // who of the cast has a body in this scene right now
        List<string> Present() { var l = new List<string>(); foreach (var w in CAST) if (BodyOf(w) != null) l.Add(w); return l; }

        // the bar along the top of the chat panel: talking to whom, her body, voice on or off
        void BuildWizraBar()
        {
            var bar = Ui.Rect("WizraBar", pChat.Body); bar.anchorMin = new Vector2(0, 1); bar.anchorMax = new Vector2(1, 1); bar.pivot = new Vector2(0.5f, 1); bar.sizeDelta = new Vector2(0, 48);
            var a = Ui.Rect("Who", bar); a.anchorMin = new Vector2(0, 0); a.anchorMax = new Vector2(0.33f, 1); a.offsetMin = a.offsetMax = Vector2.zero;
            whoBtn = Ui.Button(a, "", NextWho); Flow.Stretch(whoBtn); Ui.SetOn(whoBtn, true);
            var b = Ui.Rect("Body", bar); b.anchorMin = new Vector2(0.35f, 0); b.anchorMax = new Vector2(0.78f, 1); b.offsetMin = b.offsetMax = Vector2.zero;
            bodyBtn = Ui.Button(b, "", NextBody); Flow.Stretch(bodyBtn);
            var c = Ui.Rect("Voice", bar); c.anchorMin = new Vector2(0.8f, 0); c.anchorMax = new Vector2(1, 1); c.offsetMin = c.offsetMax = Vector2.zero;
            voiceBtn = Ui.Button(c, voiceOn.val ? "Voice: on" : "Voice: off", () => voiceOn.val = !voiceOn.val); Flow.Stretch(voiceBtn); Ui.SetOn(voiceBtn, voiceOn.val);
            voiceBtn.GetComponentInChildren<Text>().fontSize = 16;
            for (int i = 0; i < pChat.Body.childCount; i++) { var r = (RectTransform)pChat.Body.GetChild(i); if (r.name == "Log") r.offsetMax = new Vector2(0, -56); }
            ShowBody();
        }
        void ShowBody()
        {
            if (whoBtn != null) Ui.SetText(whoBtn, "Talking to: " + Nice(talkTo));
            if (bodyBtn == null) return; var a = BodyOf(talkTo);
            Ui.SetText(bodyBtn, a != null ? Nice(talkTo) + "'s body: " + a.uid : "Pick " + Nice(talkTo) + "'s body (tap)"); Ui.SetOn(bodyBtn, a != null);
        }
        public void TalkTo(string who) { if (Array.IndexOf(CAST, who) >= 0) { talkTo = who; ShowBody(); } }
        void NextWho() { talkTo = CAST[(Array.IndexOf(CAST, talkTo) + 1) % CAST.Length]; ShowBody(); }
        void NextBody()
        {
            var people = Atoms("Person"); if (people.Count == 0) { SetBody(talkTo, ""); Line("<i>Add a person to the scene to give " + Nice(talkTo) + " a body.</i>"); return; }
            int i = people.IndexOf(BodyOf(talkTo));
            SetBody(talkTo, i + 1 < people.Count ? people[i + 1].uid : "");   // cycles through everyone, then none
            ShowBody();
        }

        // ---- sending and hearing ----
        void SayTo(string who, string text, Action<string> after)
        {
            chatBusy = true; Line("<b>You</b> to " + Nice(who) + ": " + Esc(text)); Line("<i>" + Nice(who) + " is thinking...</i>");
            StartCoroutine(link.Say(who, text, storyPlace, Present(), voiceOn.val, (reply, err, voiceId) =>
            {
                chatBusy = false; chatLines.RemoveAt(chatLines.Count - 1);
                if (err != null) { Line("<color=#ff8a8a>" + Esc(err) + "</color>"); return; }
                Line("<b>" + Nice(who) + ":</b> " + Esc(reply));
                Heard(who, reply, voiceId);
                if (after != null) after(reply);
            }));
        }

        void Heard(string who, string reply, string voiceId)
        {
            WizraReplies++;
            if (who == "margo") MargoHeard(reply);
            var body = BodyOf(who);
            if (body != null) { Express(who, body, reply); LookAtMe(body); }
            if (voiceId != null) StartCoroutine(PlayVoice(who, body, voiceId));
        }

        IEnumerator PlayVoice(string who, Atom body, string id)
        {
            var url = link.Url + "/voice?id=" + id;
            for (int i = 0; i < 120; i++)   // up to a minute for the voice to be made on the PC
            {
                var head = UnityWebRequest.Get(url); head.timeout = 5; yield return head.SendWebRequest();
                var code = head.responseCode; var txt = head.downloadHandler != null && code != 200 ? head.downloadHandler.text : ""; head.Dispose();
                if (code == 200) break;
                if (code != 202) { if (txt.Contains("error")) Line("<color=#ffb070>" + Esc(JSON.Parse(txt)["error"].Value) + "</color>"); yield break; }
                yield return new WaitForSeconds(0.5f);
            }
            // VaM leaves out Unity's audio download module, so the WAV is fetched as plain bytes and turned into a clip here
            var req = UnityWebRequest.Get(url); req.timeout = 20;
            yield return req.SendWebRequest();
            if (req.isNetworkError || req.isHttpError) { req.Dispose(); yield break; }
            var clip = WavClip(req.downloadHandler.data, "voice " + who); req.Dispose();
            if (clip == null) { Line("<color=#ffb070>Her voice came back in a sound format Brene can't read.</color>"); yield break; }
            var v = VoiceOf(who);
            // no body (Margo on a call): heard as a phone voice, not from a place in the room
            v.src.spatialBlend = body != null ? 1f : 0f;
            v.src.Stop(); v.src.clip = clip; v.src.Play();
        }
        Voice VoiceOf(string who)
        {
            Voice v; if (voices.TryGetValue(who, out v) && v.go != null) return v;
            v = new Voice(); v.go = new GameObject("Brene voice " + who); v.src = v.go.AddComponent<AudioSource>(); v.src.minDistance = 0.6f; v.src.volume = 1f;
            voices[who] = v; return v;
        }

        // every frame: each voice follows its body's head, each mouth follows its voice, expressions fade on time
        void TickWizra()
        {
            foreach (var kv in new List<KeyValuePair<string, Voice>>(voices))
            {
                var v = kv.Value; var body = BodyOf(kv.Key);
                if (v.go != null && body != null) { var h = Head(body); if (h != null) v.go.transform.position = h.position; }
                if (body == null) continue;
                if (v.atom != body) { v.atom = body; v.mouthParam = null; }
                float target = 0;
                if (v.src != null && v.src.isPlaying)
                {
                    v.src.GetOutputData(voiceBuf, 0); float sum = 0; for (int i = 0; i < voiceBuf.Length; i++) sum += voiceBuf[i] * voiceBuf[i];
                    target = Mathf.Clamp01(Mathf.Sqrt(sum / voiceBuf.Length) * 7f);
                }
                float was = v.mouth; v.mouth += (target - v.mouth) * (target > v.mouth ? 0.6f : 0.25f);
                if (Mathf.Abs(v.mouth - was) > 0.002f || (target == 0 && v.mouth > 0.001f)) SetMorph(body, ref v.mouthParam, MOUTH, v.mouth * 0.8f);
                if (v.exprParam != null && Time.realtimeSinceStartup > v.exprUntil)
                {
                    v.exprAmt = Mathf.Max(0, v.exprAmt - Time.deltaTime * 1.2f);
                    var f = Geo(body, v.exprParam); if (f != null) f.val = v.exprAmt;
                    if (v.exprAmt <= 0) v.exprParam = null;
                }
            }
        }

        static string ActionsOf(string reply)
        {
            var acts = new System.Text.StringBuilder(); bool inside = false;
            foreach (var ch in reply) { if (ch == '*') { inside = !inside; acts.Append(' '); } else if (inside) acts.Append(char.ToLowerInvariant(ch)); }
            return acts.ToString();
        }
        static string Feeling(string reply)
        {
            var a = ActionsOf(reply);
            if (a.Contains("smil") || a.Contains("grin") || a.Contains("laugh") || a.Contains("giggl") || a.Contains("smirk") || a.Contains("blush")) return "smile";
            if (a.Contains("frown") || a.Contains("pout") || a.Contains("rolls her eyes") || a.Contains("glare") || a.Contains("scowl") || a.Contains("sigh")) return "frown";
            if (a.Contains("gasp") || a.Contains("surpris") || a.Contains("eyes widen") || a.Contains("wide-eyed")) return "surprise";
            return null;
        }
        void Express(string who, Atom body, string reply)
        {
            var kind = Feeling(reply); if (kind == null) return;
            var v = VoiceOf(who);
            if (v.exprParam != null) { var old = Geo(body, v.exprParam); if (old != null) old.val = 0; }
            var geo = body.GetStorableByID("geometry"); if (geo == null) return;
            var names = geo.GetFloatParamNames(); if (names == null) return;
            v.exprParam = Character.Match(names, EXPR[kind]); if (v.exprParam == null) return;
            v.exprAmt = 0.75f; var f = geo.GetFloatJSONParam(v.exprParam); if (f != null) f.val = v.exprAmt;
            v.exprUntil = Time.realtimeSinceStartup + 4f;
        }

        void LookAtMe(Atom body)
        {
            try { var eyes = body.GetStorableByID("Eyes"); if (eyes == null) return; var look = eyes.GetStringChooserJSONParam("lookMode"); if (look != null) look.val = "Player"; } catch (Exception) { }
        }

        // ---- small helpers ----
        Transform Head(Atom body)
        {
            if (body.freeControllers == null) return null;
            foreach (var fc in body.freeControllers) if (fc != null && fc.name == "headControl") return Vam.Ctrl(fc);
            return null;
        }
        JSONStorableFloat Geo(Atom body, string param) { var g = body.GetStorableByID("geometry"); return g != null ? g.GetFloatJSONParam(param) : null; }
        void SetMorph(Atom body, ref string cache, string[] candidates, float v)
        {
            var geo = body.GetStorableByID("geometry"); if (geo == null) return;
            if (cache == null) { var names = geo.GetFloatParamNames(); if (names == null) return; cache = Character.Match(names, candidates); if (cache == null) { cache = ""; return; } }
            if (cache == "") return;
            var f = geo.GetFloatJSONParam(cache); if (f != null) f.val = v;
        }

        // a WAV file (16-bit, 24-bit or 32-bit float PCM, any rate and channel count) as a Unity clip
        static AudioClip WavClip(byte[] b, string name)
        {
            if (b == null || b.Length < 44 || b[0] != 'R' || b[1] != 'I' || b[2] != 'F' || b[3] != 'F') return null;
            int fmt = 0, ch = 0, rate = 0, bits = 0, dataAt = -1, dataLen = 0, p = 12;
            while (p + 8 <= b.Length)
            {
                string id = "" + (char)b[p] + (char)b[p + 1] + (char)b[p + 2] + (char)b[p + 3]; int len = BitConverter.ToInt32(b, p + 4);
                if (id == "fmt ") { fmt = BitConverter.ToInt16(b, p + 8); ch = BitConverter.ToInt16(b, p + 10); rate = BitConverter.ToInt32(b, p + 12); bits = BitConverter.ToInt16(b, p + 22); }
                else if (id == "data") { dataAt = p + 8; dataLen = Math.Min(len < 0 ? b.Length : len, b.Length - dataAt); break; }
                p += 8 + len + (len & 1); if (len < 0) break;
            }
            if (dataAt < 0 || ch < 1 || rate < 1000) return null;
            int step = bits / 8; if (step < 2) return null;
            int n = dataLen / step; var data = new float[n];
            for (int i = 0, q = dataAt; i < n; i++, q += step)
            {
                if (fmt == 3 && bits == 32) data[i] = BitConverter.ToSingle(b, q);
                else if (bits == 16) data[i] = BitConverter.ToInt16(b, q) / 32768f;
                else if (bits == 24) data[i] = ((b[q] | (b[q + 1] << 8) | ((sbyte)b[q + 2] << 16))) / 8388608f;
                else if (bits == 32) data[i] = BitConverter.ToInt32(b, q) / 2147483648f;
                else return null;
            }
            var clip = AudioClip.Create(name, n / ch, ch, rate, false); clip.SetData(data, 0);
            return clip;
        }

        void DropWizra() { foreach (var v in new List<Voice>(voices.Values)) if (v.go != null) Destroy(v.go); voices.Clear(); }
    }
}
