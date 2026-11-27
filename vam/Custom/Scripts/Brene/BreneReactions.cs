// Brene for Virt-a-Mate: personality and reactions for the cast (steps 9 and 10 of the Character flow).
//   Personality  lives in Brenai (her persona and temperament: warmth, sarcasm, playfulness...). Shown here as bars, read from
//                Brenai through the relay; it changes as you spend time with her. Edited in Brenai's robot panel.
//   Reactions    what she does when you touch a part of her: a face (smile, frown, surprise or none) and whether she is told,
//                so she can answer it in words in her next reply (Brenai's own touch notes, the same as in the app).
//                Touches come from your hands in VR, or the webcam hands on a monitor; Test tries one without touching.
//                The parts are Brenai's own touch areas (head, face, hair, shoulder, arm, hand, belly, knee). Brenai keeps
//                chest, hips and thighs off limits, so they are not offered here.
// Part of BreneMain.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.XR;
using SimpleJSON;

namespace Brene
{
    public partial class BreneMain
    {
        static readonly string[] ZONES = { "head", "face", "hair", "shoulder", "arm", "hand", "belly", "knee" };
        static readonly string[] FACES = { "none", "smile", "frown", "surprise" };
        JSONStorableString reactions;   // {"wizra":{"head":{"face":"smile","tell":true}, ...}, ...}
        readonly Dictionary<string, float> lastTouch = new Dictionary<string, float>();
        public int ReactionTests;
        readonly Dictionary<Atom, Dictionary<string, Transform>> parts = new Dictionary<Atom, Dictionary<string, Transform>>();

        void InitReactions()
        {
            reactions = new JSONStorableString("Cast reactions", "{}", (string v) => { }); RegisterString(reactions);
        }
        string CastOf(Atom a) { if (a == null) return null; foreach (var w in CAST) if (BodyUid(w) == a.uid) return w; return null; }

        // ---- the rules, with defaults: smile and tell for the friendly ones, surprise for the face ----
        string FaceFor(string who, string zone) { var r = Rule(who, zone); return r != null && r["face"] != null ? r["face"].Value : (zone == "face" ? "surprise" : zone == "belly" || zone == "knee" ? "none" : "smile"); }
        bool TellFor(string who, string zone) { var r = Rule(who, zone); return r == null || r["tell"] == null || r["tell"].AsBool; }
        JSONNode Rule(string who, string zone) { try { var j = JSON.Parse(reactions.val); return j != null && j[who] != null && j[who][zone] != null && j[who][zone]["face"] != null ? j[who][zone] : null; } catch (Exception) { return null; } }
        void SetRule(string who, string zone, string face, bool tell)
        {
            JSONClass j = null; try { j = JSON.Parse(reactions.val) as JSONClass; } catch (Exception) { }
            if (j == null) j = new JSONClass();
            var r = new JSONClass(); r["face"] = face; r["tell"].AsBool = tell; j[who][zone] = r;
            reactions.val = j.ToString();
        }

        // ---- step 9: personality ----
        void BuildPersonality(RectTransform c, Atom person)
        {
            var who = CastOf(person);
            if (who == null) { CastPicker(c, person, "Who is " + person.uid + "? Her personality comes from Brenai, so pick which of the cast she is:"); return; }
            Flow.Say(c, Nice(who) + "'s personality lives in Brenai: her persona and temperament. It shifts as you spend time with her. Change her persona in Brenai's robot panel (owner only).");
            var holder = Ui.Rect("Traits", c); var v = holder.gameObject.AddComponent<VerticalLayoutGroup>(); v.spacing = 4; v.childControlHeight = true; v.childControlWidth = true; v.childForceExpandHeight = false;
            Flow.Say(holder, "Reading from Brenai...");
            StartCoroutine(Json("GET", "/story/personality?who=" + who, null, (j, e) =>
            {
                for (int i = holder.childCount - 1; i >= 0; i--) Destroy(holder.GetChild(i).gameObject);
                if (j == null || e != null) { Flow.Say(holder, e ?? "No answer"); return; }
                var t = j["traitList"].AsArray;   // a list from the relay (VaM's checker refuses some ways of walking a JSON object)
                if (t != null) for (int i = 0; i < t.Count; i++) Bar(holder, Nice(t[i]["name"].Value), t[i]["value"].AsFloat / 100f);
                if (j["mood"] != null && j["mood"].Value != "") Flow.Say(holder, "Mood right now: " + j["mood"].Value);
                if (j["feeling"] != null && j["feeling"].Value != "") Flow.Say(holder, "Feeling: " + j["feeling"].Value);
            }));
        }
        void Bar(RectTransform parent, string label, float v)
        {
            var row = Ui.Rect("Trait " + label, parent); row.gameObject.AddComponent<LayoutElement>().minHeight = 34;
            var l = Ui.Rect("L", row); l.anchorMin = new Vector2(0, 0); l.anchorMax = new Vector2(0.34f, 1); l.offsetMin = l.offsetMax = Vector2.zero; Ui.Label(l, label, 18, Role.Text, TextAnchor.MiddleLeft);
            var track = Ui.Rect("Track", row); track.anchorMin = new Vector2(0.36f, 0.3f); track.anchorMax = new Vector2(1, 0.7f); track.offsetMin = track.offsetMax = Vector2.zero; Ui.Box(track, Role.Field);
            var fill = Ui.Rect("Fill", track); fill.anchorMin = Vector2.zero; fill.anchorMax = new Vector2(Mathf.Clamp01(v), 1); fill.offsetMin = fill.offsetMax = Vector2.zero; Ui.Box(fill, Role.Accent);
        }
        void CastPicker(RectTransform c, Atom person, string say)
        {
            Flow.Say(c, say); var g = Flow.Grid(c, new Vector2(140, 56));
            foreach (var w in CAST) { var who = w; Ui.Button(g, Nice(who), () => { SetBody(who, person.uid); ShowBody(); chr.Redraw(); }); }
        }

        // ---- step 10: reactions ----
        void BuildReactions(RectTransform c, Atom person)
        {
            var who = CastOf(person);
            if (who == null) { CastPicker(c, person, "Reactions belong to a member of the cast. Who is " + person.uid + "?"); return; }
            Flow.Say(c, "What " + Nice(who) + " does when you touch each part. Tap the face to change it. \"Tell her\" lets her answer it in words. Test tries it now.");
            foreach (var z in ZONES)
            {
                var zone = z; var row = Flow.Grid(c, new Vector2(140, 50));
                Ui.Label(Ui.Rect("Zone", row), Nice(zone), 19, Role.Text, TextAnchor.MiddleLeft).fontStyle = FontStyle.Bold;
                var face = FaceFor(who, zone); var tell = TellFor(who, zone);
                Ui.Button(row, "Face: " + face, () => { SetRule(who, zone, FACES[(Array.IndexOf(FACES, FaceFor(who, zone)) + 1) % FACES.Length], TellFor(who, zone)); chr.Redraw(); });
                Ui.SetOn(Ui.Button(row, tell ? "Tell her: yes" : "Tell her: no", () => { SetRule(who, zone, FaceFor(who, zone), !TellFor(who, zone)); chr.Redraw(); }), tell);
                Ui.Button(row, "Test", () => { ReactionTests++; Touch(who, zone, true); });
            }
        }

        // ---- a touch ----
        void Touch(string who, string zone, bool test)
        {
            var body = BodyOf(who); var face = FaceFor(who, zone);
            if (body != null && face != "none") Express(who, body, "*" + (face == "smile" ? "smiles" : face == "frown" ? "frowns" : "gasps") + "*");
            if (body != null) LookAtMe(body);
            if (TellFor(who, zone))
            {
                var b = Obj("who", who, "zone", zone);
                StartCoroutine(Json("POST", "/story/touch", b, (j, e) => { if (test) chr.Note(e != null ? e : j["note"] != null && j["note"].Value != "" ? j["note"].Value : Nice(who) + " felt it: she can answer in her next reply."); }));
            }
            else if (test) chr.Note(Nice(who) + " reacted (not told).");
        }

        // where each part is on a body (from its physics parts, found by name; any VaM version)
        Transform Part(Atom a, string name)
        {
            Dictionary<string, Transform> d;
            if (!parts.TryGetValue(a, out d)) { d = new Dictionary<string, Transform>(); foreach (var rb in a.GetComponentsInChildren<Rigidbody>(true)) if (!d.ContainsKey(rb.name)) d[rb.name] = rb.transform; parts[a] = d; }
            Transform t; return d.TryGetValue(name, out t) ? t : null;
        }
        List<Vector3> ZonePoints(Atom a, string zone)
        {
            var l = new List<Vector3>(); var head = Part(a, "head");
            Action<string> add = n => { var t = Part(a, n); if (t != null) l.Add(t.position); };
            switch (zone)
            {
                case "head": if (head != null) l.Add(head.position + head.up * 0.11f); break;
                case "face": if (head != null) l.Add(head.position + head.forward * 0.09f + head.up * 0.03f); break;
                case "hair": if (head != null) l.Add(head.position - head.forward * 0.09f + head.up * 0.05f); break;
                case "shoulder": add("lShldr"); add("rShldr"); break;
                case "arm": add("lForeArm"); add("rForeArm"); break;
                case "hand": add("lHand"); add("rHand"); break;
                case "belly": add("abdomen"); break;
                case "knee": add("lShin"); add("rShin"); break;
            }
            return l;
        }

        // every frame: your hands (VR controllers, or the webcam hands) against each cast member's parts
        void TickReactions()
        {
            var hands = new List<Vector3>();
            if (vr)
            {
                var h = HeadT();
                if (h != null)
                {
                    var rig = h.rotation * Quaternion.Inverse(InputTracking.GetLocalRotation(XRNode.Head)); var hl = InputTracking.GetLocalPosition(XRNode.Head);
                    foreach (var n in new[] { XRNode.LeftHand, XRNode.RightHand }) hands.Add(h.position + rig * (InputTracking.GetLocalPosition(n) - hl));
                }
            }
            else hands.AddRange(vit.HandPoints());
            if (hands.Count == 0) return;
            float now = Time.realtimeSinceStartup;
            foreach (var who in CAST)
            {
                var body = BodyOf(who); if (body == null) continue;
                foreach (var zone in ZONES)
                {
                    var key = who + "|" + zone; float last; if (lastTouch.TryGetValue(key, out last) && now - last < 3f) continue;
                    bool hit = false;
                    foreach (var p in ZonePoints(body, zone)) foreach (var hp in hands) if (Vector3.Distance(p, hp) < 0.09f) hit = true;
                    if (hit) { lastTouch[key] = now; Touch(who, zone, false); }
                }
            }
        }
    }
}
