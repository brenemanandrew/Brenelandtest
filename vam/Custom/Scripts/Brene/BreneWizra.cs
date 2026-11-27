// Brene for Virt-a-Mate: Wizra in the scene. Any person can be her body.
//   Voice        her real Brenai voice (the relay asks brenai.fly.dev for it, the same voice as in the app), played from her head.
//   Lip sync     her mouth opens with the loudness of her voice, frame by frame.
//   Expressions  actions in her reply (*smiles*, *rolls her eyes*, *gasps*) show on her face for a few seconds, then ease off.
//   Eyes         she looks at you (VaM's eye setting "Player") while she talks.
// Part of BreneMain. Morph names are matched the same way as the Character panel (any VaM version, the real name used).
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Networking;

namespace Brene
{
    public partial class BreneMain
    {
        JSONStorableBool voiceOn; JSONStorableString wizraBody;
        AudioSource voiceSrc; GameObject voiceGo; readonly float[] voiceBuf = new float[256];
        float mouth, exprUntil, exprAmt; string exprParam, mouthParam; Atom mouthAtom; Button bodyBtn, voiceBtn;
        public int WizraReplies;   // counts her replies (the tutorial waits on it)
        static readonly string[] MOUTH = { "Mouth", "Mouth Open", "Mouth Open Wide", "Lips Part", "Jaw Open" };
        static readonly Dictionary<string, string[]> EXPR = new Dictionary<string, string[]> {
            { "smile", new[] { "Smile", "Smile Open Full Face", "Smile Full Face", "Smile Simple", "Smile" } },
            { "frown", new[] { "Frown", "Frown", "Mouth Frown", "Pout" } },
            { "surprise", new[] { "Surprise", "Surprise", "Eyes Widen", "Mouth Open Wide" } },
        };

        void InitWizra()
        {
            voiceOn = new JSONStorableBool("Wizra's voice", true, v => { if (voiceBtn != null) { UI.SetOn(voiceBtn, v); UI.SetText(voiceBtn, v ? "Voice: on" : "Voice: off"); } });
            RegisterBool(voiceOn); CreateToggle(voiceOn);
            wizraBody = new JSONStorableString("Wizra's body (person)", "", v => ShowBody());
            RegisterString(wizraBody);
        }

        // the bar along the top of the Wizra panel: her voice on/off and which person is her body
        void BuildWizraBar()
        {
            var bar = UI.Rect("WizraBar", pChat.Body); bar.anchorMin = new Vector2(0, 1); bar.anchorMax = new Vector2(1, 1); bar.pivot = new Vector2(0.5f, 1); bar.sizeDelta = new Vector2(0, 48);
            var l = UI.Rect("Voice", bar); l.anchorMin = new Vector2(0, 0); l.anchorMax = new Vector2(0.34f, 1); l.offsetMin = l.offsetMax = Vector2.zero;
            voiceBtn = UI.Button(l, voiceOn.val ? "Voice: on" : "Voice: off", () => voiceOn.val = !voiceOn.val); Flow.Stretch(voiceBtn); UI.SetOn(voiceBtn, voiceOn.val);
            var r = UI.Rect("Body", bar); r.anchorMin = new Vector2(0.36f, 0); r.anchorMax = new Vector2(1, 1); r.offsetMin = r.offsetMax = Vector2.zero;
            bodyBtn = UI.Button(r, "", NextBody); Flow.Stretch(bodyBtn);
            for (int i = 0; i < pChat.Body.childCount; i++) { var c = (RectTransform)pChat.Body.GetChild(i); if (c.name == "Log") c.offsetMax = new Vector2(0, -56); }
            ShowBody();
        }
        void ShowBody() { if (bodyBtn == null) return; var a = Body(); UI.SetText(bodyBtn, a != null ? "Her body: " + a.uid : "Pick her body (tap)"); UI.SetOn(bodyBtn, a != null); }
        Atom Body() { return string.IsNullOrEmpty(wizraBody.val) ? null : SuperController.singleton.GetAtomByUid(wizraBody.val); }
        void NextBody()
        {
            var people = Atoms("Person"); if (people.Count == 0) { wizraBody.val = ""; Line("<i>Add a person to the scene to give her a body.</i>"); return; }
            int i = people.IndexOf(Body());
            wizraBody.val = i + 1 < people.Count ? people[i + 1].uid : "";   // cycles through everyone, then none
        }
        public void MakeWizra(Atom a) { if (a != null) wizraBody.val = a.uid; }

        // ---- a reply arrived ----
        void Heard(string reply, string voiceId)
        {
            WizraReplies++;
            var body = Body(); if (body == null) return;
            Express(body, reply); LookAtMe(body);
            if (voiceId != null) StartCoroutine(PlayVoice(body, voiceId));
        }

        IEnumerator PlayVoice(Atom body, string id)
        {
            var url = link.Url + "/voice?id=" + id;
            for (int i = 0; i < 120; i++)   // up to a minute for her voice to be made on the PC
            {
                var head = UnityWebRequest.Get(url); head.timeout = 5; yield return head.SendWebRequest();
                var code = head.responseCode; var txt = head.downloadHandler != null && code != 200 ? head.downloadHandler.text : ""; head.Dispose();
                if (code == 200) break;
                if (code != 202) { if (txt.Contains("error")) Line("<color=#ffb070>" + Esc(SimpleJSON.JSON.Parse(txt)["error"].Value) + "</color>"); yield break; }
                yield return new WaitForSeconds(0.5f);
            }
            var req = UnityWebRequestMultimedia.GetAudioClip(url, AudioType.WAV); req.timeout = 20;
            yield return req.SendWebRequest();
            if (req.isNetworkError || req.isHttpError) { req.Dispose(); yield break; }
            var clip = DownloadHandlerAudioClip.GetContent(req); req.Dispose();
            if (clip == null) yield break;
            if (voiceGo == null) { voiceGo = new GameObject("Brene Wizra voice"); voiceSrc = voiceGo.AddComponent<AudioSource>(); voiceSrc.spatialBlend = 1f; voiceSrc.minDistance = 0.6f; voiceSrc.volume = 1f; }
            voiceSrc.Stop(); voiceSrc.clip = clip; voiceSrc.Play();
        }

        // every frame: the voice follows her head, the mouth follows the voice, the expression fades on time
        void TickWizra()
        {
            var body = Body();
            if (voiceGo != null && body != null) { var h = Head(body); if (h != null) voiceGo.transform.position = h.position; }
            if (body == null) return;
            // lip sync
            float target = 0;
            if (voiceSrc != null && voiceSrc.isPlaying)
            {
                voiceSrc.GetOutputData(voiceBuf, 0); float sum = 0; for (int i = 0; i < voiceBuf.Length; i++) sum += voiceBuf[i] * voiceBuf[i];
                target = Mathf.Clamp01(Mathf.Sqrt(sum / voiceBuf.Length) * 7f);
            }
            float was = mouth; mouth += (target - mouth) * (target > mouth ? 0.6f : 0.25f);
            if (Mathf.Abs(mouth - was) > 0.002f || (target == 0 && mouth > 0.001f)) SetMorph(body, ref mouthParam, MOUTH, mouth * 0.8f);
            // expression easing off
            if (exprParam != null && Time.realtimeSinceStartup > exprUntil)
            {
                exprAmt = Mathf.Max(0, exprAmt - Time.deltaTime * 1.2f);
                var f = Geo(body, exprParam); if (f != null) f.val = exprAmt;
                if (exprAmt <= 0) exprParam = null;
            }
        }

        void Express(Atom body, string reply)
        {
            var acts = new System.Text.StringBuilder(); bool inside = false;
            foreach (var ch in reply) { if (ch == '*') { inside = !inside; acts.Append(' '); } else if (inside) acts.Append(char.ToLowerInvariant(ch)); }
            var a = acts.ToString(); string kind = null;
            if (a.Contains("smil") || a.Contains("grin") || a.Contains("laugh") || a.Contains("giggl") || a.Contains("smirk") || a.Contains("blush")) kind = "smile";
            else if (a.Contains("frown") || a.Contains("pout") || a.Contains("rolls her eyes") || a.Contains("glare") || a.Contains("scowl") || a.Contains("sigh")) kind = "frown";
            else if (a.Contains("gasp") || a.Contains("surpris") || a.Contains("eyes widen") || a.Contains("wide-eyed")) kind = "surprise";
            if (kind == null) return;
            if (exprParam != null) { var old = Geo(body, exprParam); if (old != null) old.val = 0; }
            var geo = body.GetStorableByID("geometry"); if (geo == null) return;
            var names = geo.GetFloatParamNames(); if (names == null) return;
            exprParam = Character.Match(names, EXPR[kind]); if (exprParam == null) return;
            exprAmt = 0.75f; var f = geo.GetFloatJSONParam(exprParam); if (f != null) f.val = exprAmt;
            exprUntil = Time.realtimeSinceStartup + 4f;
        }

        void LookAtMe(Atom body)
        {
            try { var eyes = body.GetStorableByID("Eyes"); if (eyes == null) return; var look = eyes.GetStringChooserJSONParam("lookMode"); if (look != null) look.val = "Player"; } catch (Exception) { }
        }

        // ---- small helpers ----
        Transform Head(Atom body)
        {
            if (body.freeControllers == null) return null;
            foreach (var fc in body.freeControllers) if (fc != null && fc.name == "headControl") return fc.control != null ? fc.control : fc.transform;
            return null;
        }
        JSONStorableFloat Geo(Atom body, string param) { var g = body.GetStorableByID("geometry"); return g != null ? g.GetFloatJSONParam(param) : null; }
        void SetMorph(Atom body, ref string cache, string[] candidates, float v)
        {
            if (mouthAtom != body) { mouthAtom = body; cache = null; }
            var geo = body.GetStorableByID("geometry"); if (geo == null) return;
            if (cache == null) { var names = geo.GetFloatParamNames(); if (names == null) return; cache = Character.Match(names, candidates); if (cache == null) { cache = ""; return; } }
            if (cache == "") return;
            var f = geo.GetFloatJSONParam(cache); if (f != null) f.val = v;
        }

        void DropWizra() { if (voiceGo != null) Destroy(voiceGo); }
    }
}
