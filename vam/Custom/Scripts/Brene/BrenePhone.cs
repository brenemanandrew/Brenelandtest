// Brene for Virt-a-Mate: the Phone. Wizra's chat and Margo's video call in one panel, for the whole cast.
//   Contacts   Wizra, Zoe, Belinda, Margo: a tile each with an unread badge, Text and Call.
//   Texts      one conversation per contact: the log, a box to type in and Send, back to contacts; the bar on top picks whom
//              (tap for the next), calls her, picks her body, turns voices on or off. VR quick lines sit under it.
//   Call       Margo shows her call faces by mood; the others their latest selfie if Brenai sends one, else a big initial. Her
//              voice plays like a phone call (no body: flat, not from a place in the room). What you send on a call goes with
//              mode "call". Hang up, or Texts to read back while the call goes on.
//   Ringing    when Brenai says someone is calling (an event {kind:'call', who} in the story state or in an answer, or the state's
//              "calling"), the phone opens and rings (a tone made in code): Answer or Decline. No answer in 30 s = ignored.
//   Waiting    a call coming in during a call: a banner "<Name> is calling..." with Switch (hang up, answer the new one) and Ignore.
// Every choice goes to the relay as POST /story/call {who, action: answer|decline|ignore|end}, so the character remembers it.
// Part of BreneMain.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using SimpleJSON;

namespace Brene
{
    public partial class BreneMain
    {
        RectTransform phContacts, phTexts, phCall, phRing, phSay, phWait;
        Text callName, callCaption, callInitial, callLast, ringName, ringNote, ringInitial, waitText; RawImage callFace;
        readonly Dictionary<string, List<string>> logs = new Dictionary<string, List<string>>();
        readonly int[] unreadMine = new int[4], unreadState = new int[4], unreadCleared = new int[4];
        readonly float[] rangAt = new float[4];
        readonly Text[] badgeText = new Text[4]; readonly GameObject[] badgeGo = new GameObject[4]; readonly Button[] contactCall = new Button[4];
        readonly List<string> seenEvents = new List<string>();
        string phScreen = "contacts", callWho = "", ringWho = "", waitWho = "", stateCalling = "";
        float ringUntil, waitUntil; AudioSource ringSrc; AudioClip ringClip; JSONNode castInfo; bool callNoteShown;

        void BuildPhone()
        {
            var body = pChat.Body;
            link.OnPhone = j => PhoneEvents(j, false);

            // the box to type in and Send: shared by the texts and the call
            phSay = Ui.Rect("Say", body); Ui.Bottom(phSay, 54, 0);
            var inRt = Ui.Rect("Input", phSay); Ui.Fill(inRt, 0, 0, 110, 0);
            chatIn = Input(inRt, "Type here, Enter to send");
            var sendRt = Ui.Rect("Send", phSay); sendRt.anchorMin = sendRt.anchorMax = new Vector2(1, 0); sendRt.pivot = new Vector2(1, 0); sendRt.sizeDelta = new Vector2(100, 54);
            var sb = Ui.Button(sendRt, "Send", SendChat); Ui.Stretch(sb);

            // contacts
            phContacts = Ui.Rect("Contacts", body);
            var cv = phContacts.gameObject.AddComponent<VerticalLayoutGroup>(); cv.spacing = 10; cv.childControlHeight = true; cv.childControlWidth = true; cv.childForceExpandHeight = false;
            for (int i = 0; i < CAST.Length; i++) ContactRow(i);

            // texts
            phTexts = Ui.Rect("Texts", body);
            BuildWizraBar(phTexts);
            var logArea = Ui.Rect("Log", phTexts); Ui.Fill(logArea, 0, 104, 0, 0);
            Ui.Box(logArea, Role.Field);
            chatScroll = Scroll(logArea); var logContent = chatScroll.content;
            var lv = logContent.gameObject.AddComponent<VerticalLayoutGroup>(); lv.childControlHeight = true; lv.childControlWidth = true; lv.padding = new RectOffset(10, 10, 8, 8);
            chatLog = Ui.Label(logContent, "", 21, Role.Text, TextAnchor.UpperLeft);
            chatLog.verticalOverflow = VerticalWrapMode.Overflow; chatLog.supportRichText = true;
            chatLog.gameObject.AddComponent<LayoutElement>();

            // the call
            phCall = Ui.Rect("Call", body);
            var cn = Ui.Rect("Name", phCall); Ui.Top(cn, 40, 0);
            callName = Ui.Label(cn, "", 24, Role.Text, TextAnchor.MiddleCenter); callName.fontStyle = FontStyle.Bold;
            var fr = Ui.Rect("Face", phCall); Ui.Fill(fr, 0, 44, 0, 150); Ui.Box(fr, Role.Field);
            var fi = Ui.Rect("Img", fr); Ui.Fill(fi, 6, 6, 6, 6); callFace = fi.gameObject.AddComponent<RawImage>(); callFace.color = new Color(1, 1, 1, 0); callFace.raycastTarget = false;
            callInitial = Ui.Label(fr, "", 140, Role.Dim, TextAnchor.MiddleCenter); callInitial.fontStyle = FontStyle.Bold;
            var cc = Ui.Rect("Caption", phCall); Ui.Bottom(cc, 28, 116);
            callCaption = Ui.Label(cc, "", 17, Role.Dim, TextAnchor.MiddleCenter);
            var cl = Ui.Rect("Last", phCall); Ui.Bottom(cl, 56, 58);
            callLast = Ui.Label(cl, "", 18, Role.Text, TextAnchor.MiddleLeft); callLast.supportRichText = true;
            var cb = Ui.Rect("Buttons", phCall); Ui.Bottom(cb, 52, 0);
            var hu = Ui.Rect("Hang up", cb); Ui.Span(hu, 0, 0.58f); var hub = Ui.Button(hu, "Hang up", () => EndCall(true)); Ui.Stretch(hub); Ui.SetOn(hub, true); Ui.WithIcon(hub, "phone");
            var tx = Ui.Rect("Texts", cb); Ui.Span(tx, 0.6f, 1); Ui.Stretch(Ui.Button(tx, "Texts", () => PhoneShow("texts")));

            // ringing
            phRing = Ui.Rect("Ring", body);
            var rf = Ui.Rect("Face", phRing); rf.anchorMin = rf.anchorMax = new Vector2(0.5f, 1); rf.pivot = new Vector2(0.5f, 1); rf.sizeDelta = new Vector2(200, 200); rf.anchoredPosition = new Vector2(0, -20);
            var rfi = Ui.Box(rf, Role.Title); rfi.sprite = BreneIcons.Get("disc"); rfi.type = Image.Type.Simple;
            var rring = Ui.Rect("Ring", rf); Ui.Fill(rring, 0, 0, 0, 0); Ui.Glyph(rring, "halo", Role.Accent);
            ringInitial = Ui.Label(rf, "", 110, Role.Text, TextAnchor.MiddleCenter); ringInitial.fontStyle = FontStyle.Bold;
            var rn = Ui.Rect("Name", phRing); Ui.Top(rn, 44, 236);
            ringName = Ui.Label(rn, "", 28, Role.Text, TextAnchor.MiddleCenter); ringName.fontStyle = FontStyle.Bold;
            var rnn = Ui.Rect("Note", phRing); Ui.Top(rnn, 60, 282);
            ringNote = Ui.Label(rnn, "", 19, Role.Dim, TextAnchor.UpperCenter);
            var rb = Ui.Rect("Buttons", phRing); Ui.Bottom(rb, 72, 10);
            var ra = Ui.Rect("Answer", rb); Ui.Span(ra, 0, 0.49f); var rab = Ui.Button(ra, "Answer", Answer); Ui.Stretch(rab); Ui.SetOn(rab, true); Ui.WithIcon(rab, "phone");
            var rd = Ui.Rect("Decline", rb); Ui.Span(rd, 0.51f, 1); Ui.Stretch(Ui.Button(rd, "Decline", Decline));

            // call waiting: a banner over the top
            phWait = Ui.Rect("Waiting", body); Ui.Top(phWait, 60, 0); Ui.Box(phWait, Role.Title);
            var wt = Ui.Rect("Text", phWait); Ui.Span(wt, 0, 0.5f); waitText = Ui.Label(wt, "", 19, Role.Text, TextAnchor.MiddleLeft); waitText.fontStyle = FontStyle.Bold;
            var ws = Ui.Rect("Switch", phWait); ws.anchorMin = new Vector2(0.5f, 0); ws.anchorMax = new Vector2(0.75f, 1); ws.offsetMin = new Vector2(4, 6); ws.offsetMax = new Vector2(-4, -6);
            var wsb = Ui.Button(ws, "Switch", SwitchCall); Ui.Stretch(wsb); Ui.SetOn(wsb, true);
            var wi = Ui.Rect("Ignore", phWait); wi.anchorMin = new Vector2(0.75f, 0); wi.anchorMax = new Vector2(1, 1); wi.offsetMin = new Vector2(4, 6); wi.offsetMax = new Vector2(-6, -6);
            Ui.Stretch(Ui.Button(wi, "Ignore", IgnoreWaiting));
            phWait.gameObject.SetActive(waitWho != "");

            PhoneLayout();
            PhoneShow(ringWho != "" ? "ring" : callWho != "" ? "call" : "contacts");
            if (callWho != "") { callName.text = Nice(callWho); callInitial.text = Initial(callWho); }
        }

        void ContactRow(int i)
        {
            var who = CAST[i];
            var row = Ui.Rect("Contact " + who, phContacts); row.gameObject.AddComponent<LayoutElement>().minHeight = 100; Ui.Box(row, Role.Title);
            var av = Ui.Rect("Avatar", row); av.anchorMin = av.anchorMax = new Vector2(0, 0.5f); av.pivot = new Vector2(0, 0.5f); av.sizeDelta = new Vector2(80, 80); av.anchoredPosition = new Vector2(10, 0);
            var avi = Ui.Box(av, Role.Button); avi.sprite = BreneIcons.Get("disc"); avi.type = Image.Type.Simple;
            Ui.Label(av, Initial(who), 42, Role.Text, TextAnchor.MiddleCenter).fontStyle = FontStyle.Bold;
            var bd = Ui.Rect("Badge", row); bd.anchorMin = bd.anchorMax = new Vector2(0, 1); bd.pivot = new Vector2(0.5f, 0.5f); bd.sizeDelta = new Vector2(34, 34); bd.anchoredPosition = new Vector2(80, -18);
            var bdi = Ui.Box(bd, Role.Accent); bdi.sprite = BreneIcons.Get("disc"); bdi.type = Image.Type.Simple;
            badgeText[i] = Ui.Label(bd, "", 17, Role.Text, TextAnchor.MiddleCenter); badgeText[i].fontStyle = FontStyle.Bold;
            ((RectTransform)badgeText[i].transform).offsetMin = Vector2.zero; ((RectTransform)badgeText[i].transform).offsetMax = Vector2.zero;
            badgeGo[i] = bd.gameObject; bd.gameObject.SetActive(false);
            var nm = Ui.Rect("Name", row); nm.anchorMin = Vector2.zero; nm.anchorMax = Vector2.one; nm.offsetMin = new Vector2(100, 0); nm.offsetMax = new Vector2(-224, 0);
            Ui.Label(nm, Nice(who), 24, Role.Text, TextAnchor.MiddleLeft).fontStyle = FontStyle.Bold;
            var tb = Ui.Rect("Text", row); tb.anchorMin = tb.anchorMax = new Vector2(1, 0.5f); tb.pivot = new Vector2(1, 0.5f); tb.sizeDelta = new Vector2(104, 60); tb.anchoredPosition = new Vector2(-116, 0);
            Ui.Stretch(Ui.Button(tb, "Text", () => OpenTexts(who)));
            var cb = Ui.Rect("Call", row); cb.anchorMin = cb.anchorMax = new Vector2(1, 0.5f); cb.pivot = new Vector2(1, 0.5f); cb.sizeDelta = new Vector2(104, 60); cb.anchoredPosition = new Vector2(-8, 0);
            contactCall[i] = Ui.Button(cb, "Call", () => CallContact(who)); Ui.Stretch(contactCall[i]); Ui.SetOn(contactCall[i], true);
        }

        static string Initial(string who) { return string.IsNullOrEmpty(who) ? "?" : who.Substring(0, 1).ToUpperInvariant(); }

        // the screens above the box to type in (higher in the headset, where the quick lines sit under them)
        void PhoneLayout()
        {
            if (phTexts == null) return;
            float sayH = quickRow != null ? 186 : 62;
            Ui.Fill(phTexts, 0, 0, 0, sayH); Ui.Fill(phCall, 0, 0, 0, sayH); Ui.Fill(phContacts, 0, 0, 0, 0); Ui.Fill(phRing, 0, 0, 0, 0);
        }
        void PhoneShow(string screen)
        {
            if (phTexts == null) return;
            phScreen = screen;
            phContacts.gameObject.SetActive(screen == "contacts"); phTexts.gameObject.SetActive(screen == "texts");
            phCall.gameObject.SetActive(screen == "call"); phRing.gameObject.SetActive(screen == "ring");
            bool say = screen == "texts" || screen == "call";
            phSay.gameObject.SetActive(say); if (quickRow != null) quickRow.SetActive(say);
            if (phWait.gameObject.activeSelf) phWait.SetAsLastSibling();
            if (screen == "texts") { Seen(talkTo); ShowLog(); }
            if (screen == "call") ShowCallLast();
            ShowBody(); RefreshContacts();
        }
        // the Phone, on whatever matters now: a call ringing, the call you are on, else where you left it
        public void OpenPhone()
        {
            Show(pChat);
            PhoneShow(ringWho != "" ? "ring" : callWho != "" ? "call" : phScreen == "ring" || phScreen == "call" ? "contacts" : phScreen);
        }
        void OpenTexts(string who) { TalkTo(who); Show(pChat); PhoneShow("texts"); if (chatIn != null) chatIn.ActivateInputField(); }
        void CallContact(string who)
        {
            if (Array.IndexOf(CAST, who) < 0) return;
            if (callWho == who) { Show(pChat); PhoneShow("call"); return; }
            if (callWho != "") EndCall(true);
            StartCall(who);
        }

        // ---- the logs, one per contact ----
        List<string> LogOf(string who) { if (who == null) who = ""; List<string> l; if (!logs.TryGetValue(who, out l)) { l = new List<string>(); logs[who] = l; } return l; }
        void Line(string s) { LineTo(talkTo, s); }
        void LineTo(string who, string s)
        {
            var l = LogOf(who); l.Add(s); while (l.Count > 80) l.RemoveAt(0);
            if (who == talkTo) ShowLog();
            if (who == callWho) ShowCallLast();
        }
        void ShowLog()
        {
            if (chatLog == null) return;
            var l = LogOf(talkTo);
            chatLog.text = l.Count > 0 ? string.Join("\n\n", l.ToArray()) : "Say something to " + Nice(talkTo) + ". Her words come from Brenai through the Brene relay.";
            Canvas.ForceUpdateCanvases(); if (chatScroll != null) chatScroll.verticalNormalizedPosition = 0;
        }
        // the call screen shows the last two lines of the talk
        void ShowCallLast()
        {
            if (callLast == null || callWho == "") return;
            var l = LogOf(callWho); int from = Mathf.Max(0, l.Count - 2);
            callLast.text = string.Join("\n", l.GetRange(from, l.Count - from).ToArray());
        }

        // ---- unread ----
        // a reply arrived: unread unless her texts or her call are on screen
        void Unseen(string who)
        {
            int k = Array.IndexOf(CAST, who); if (k < 0) return;
            bool looking = pChat != null && pChat.Root.gameObject.activeSelf && ((phScreen == "texts" && talkTo == who) || (phScreen == "call" && callWho == who));
            if (!looking) unreadMine[k]++;
            RefreshContacts();
        }
        void Seen(string who) { int k = Array.IndexOf(CAST, who); if (k < 0) return; unreadMine[k] = 0; unreadCleared[k] = unreadState[k]; RefreshContacts(); }
        void RefreshContacts()
        {
            for (int i = 0; i < CAST.Length; i++)
            {
                if (badgeGo[i] == null) continue;
                int n = unreadMine[i] + Mathf.Max(0, unreadState[i] - unreadCleared[i]);
                badgeGo[i].SetActive(n > 0); badgeText[i].text = n > 9 ? "9+" : n.ToString();
                if (contactCall[i] != null) Ui.SetText(contactCall[i], callWho == CAST[i] ? "On call" : "Call");
            }
        }

        // ---- what Brenai says about the phone (the story state every 2 s, and say / choose / call answers) ----
        void PhoneEvents(JSONNode j, bool fromState)
        {
            if (j == null) return;
            var un = j["unread"];
            if (un != null) for (int i = 0; i < CAST.Length; i++)
            {
                var n = un[CAST[i]]; if (n == null || n.Value == "") continue;
                unreadState[i] = n.AsInt; if (unreadCleared[i] > unreadState[i]) unreadCleared[i] = unreadState[i];
            }
            if (fromState)
            {
                castInfo = j["cast"];
                var c = j["calling"] != null ? j["calling"].Value : "";
                if (c != stateCalling) { stateCalling = c; if (c != "") Incoming(c, ""); }   // rings once per new caller, not every poll
            }
            var ev = j["events"] != null ? j["events"].AsArray : null;
            if (ev != null) for (int i = 0; i < ev.Count; i++)
            {
                var e = ev[i]; if (e == null || e["kind"].Value != "call") continue;
                var who = e["who"].Value; int k = Array.IndexOf(CAST, who); if (k < 0) continue;
                var id = e["id"] != null ? e["id"].Value : "";
                if (id != "") { if (seenEvents.Contains(id)) continue; seenEvents.Add(id); if (seenEvents.Count > 100) seenEvents.RemoveAt(0); }
                else if (fromState && Time.realtimeSinceStartup - rangAt[k] < 30f) continue;   // the same event in the next poll
                Incoming(who, e["reason"] != null ? e["reason"].Value : "");
            }
            RefreshContacts();
        }

        // ---- a call coming in ----
        void Incoming(string who, string reason)
        {
            int k = Array.IndexOf(CAST, who); if (k < 0) return;
            if (who == callWho || who == ringWho || who == waitWho) return;
            rangAt[k] = Time.realtimeSinceStartup;
            if (callWho != "")
            {
                if (waitWho != "") CallReport(waitWho, "ignore");   // a third caller: the one waiting is let go
                waitWho = who; waitUntil = Time.realtimeSinceStartup + 30f;
                if (waitText != null) { waitText.text = Nice(who) + " is calling..."; phWait.gameObject.SetActive(true); phWait.SetAsLastSibling(); }
                Show(pChat); return;
            }
            if (ringWho != "") { CallReport(who, "ignore"); LineTo(who, "<i>Missed call</i>"); unreadMine[k]++; return; }   // already ringing: the second one is missed
            ringWho = who; ringUntil = Time.realtimeSinceStartup + 30f;
            if (ringName != null) { ringName.text = Nice(who) + " is calling"; ringNote.text = reason; ringInitial.text = Initial(who); }
            Show(pChat); PhoneShow("ring"); StartRing();
        }
        void Answer()
        {
            var w = ringWho; if (w == "") return; ringWho = ""; StopRing();
            CallReport(w, "answer"); StartCall(w);
        }
        void Decline()
        {
            var w = ringWho; if (w == "") return; ringWho = ""; StopRing();
            CallReport(w, "decline"); LineTo(w, "<i>You declined her call.</i>");
            PhoneShow(callWho != "" ? "call" : "contacts");
        }
        void SwitchCall()
        {
            var w = waitWho; if (w == "") return; HideWait();
            EndCall(true); CallReport(w, "answer"); StartCall(w);
        }
        void IgnoreWaiting() { var w = waitWho; HideWait(); if (w != "") { CallReport(w, "ignore"); LineTo(w, "<i>Missed call</i>"); Unseen(w); } }
        void HideWait() { waitWho = ""; if (phWait != null) phWait.gameObject.SetActive(false); }

        // ---- on a call ----
        void StartCall(string who)
        {
            callWho = who; TalkTo(who);
            callName.text = Nice(who); callInitial.text = Initial(who); callFace.texture = null; callFace.color = new Color(1, 1, 1, 0);
            callCaption.text = "Connecting..."; faceAsk++;
            LineTo(who, "<i>On a call</i>");
            Show(pChat); PhoneShow("call");
            if (who == "margo")
            {
                if (margoInfo == null) StartCoroutine(Json("GET", "/story/margo", null, (j, e) => { margoInfo = j; if (e != null) callCaption.text = e; else if (callWho == "margo") Face("warm", ""); }));
                else Face("warm", "");
            }
            else Selfie(who);
        }
        // the others: their latest selfie, when the story state carries one (cast[who].selfie, a picture in the story folder)
        void Selfie(string who)
        {
            callCaption.text = Nice(who) + " - voice call";
            var path = castInfo != null && castInfo[who] != null && castInfo[who]["selfie"] != null ? castInfo[who]["selfie"].Value : "";
            if (path == "") return;
            int ask = ++faceAsk;
            Picture(path, (Texture2D t) => { if (ask == faceAsk && callWho == who && callFace != null) { Pics.Show(callFace, t, false); callInitial.text = ""; } });
        }
        void EndCall(bool report)
        {
            if (callWho == "") return;
            var w = callWho; callWho = ""; faceAsk++;
            if (report) CallReport(w, "end");
            LineTo(w, "<i>Call ended</i>");
            if (callFace != null) { callFace.texture = null; callFace.color = new Color(1, 1, 1, 0); }
            if (phScreen == "call") PhoneShow("texts"); else { ShowBody(); RefreshContacts(); }
            if (waitWho != "") { var wait = waitWho; HideWait(); Incoming(wait, ""); }   // someone was waiting: now it rings properly
        }
        void CallReport(string who, string action)
        {
            StartCoroutine(Json("POST", "/story/call", Obj("who", who, "action", action), (j, e) =>
            {
                if (j != null) PhoneEvents(j, false);
                if (e != null) { LineTo(who, "<color=#ff8a8a>" + Esc(e) + "</color>"); return; }
                if (j != null && j["ok"] != null && !j["ok"].AsBool && j["note"] != null && j["note"].Value != "" && !callNoteShown) { callNoteShown = true; LineTo(who, "<i>" + Esc(j["note"].Value) + "</i>"); }
            }));
        }

        // every frame: a call nobody answers stops ringing after 30 s (reported as ignored), and so does a waiting one
        void TickPhone()
        {
            float now = Time.realtimeSinceStartup;
            if (ringWho != "" && now > ringUntil)
            {
                var w = ringWho; ringWho = ""; StopRing(); CallReport(w, "ignore"); LineTo(w, "<i>Missed call</i>");
                int k = Array.IndexOf(CAST, w); if (k >= 0) unreadMine[k]++;
                PhoneShow(callWho != "" ? "call" : "contacts");
            }
            if (waitWho != "" && now > waitUntil) IgnoreWaiting();
        }

        // ---- the ring tone: made in code (two tones, ring-ring, pause), played flat like a phone ----
        void StartRing()
        {
            if (ringSrc == null) { var go = new GameObject("Brene ring"); ringSrc = go.AddComponent<AudioSource>(); ringSrc.spatialBlend = 0; ringSrc.loop = true; ringSrc.volume = 0.5f; }
            if (ringClip == null) ringClip = RingClip();
            if (ringClip == null) return;
            ringSrc.clip = ringClip; ringSrc.Play();
        }
        void StopRing() { if (ringSrc != null) ringSrc.Stop(); }
        void DropRing()
        {
            StopRing();
            if (ringSrc != null) Destroy(ringSrc.gameObject); ringSrc = null;
            if (ringClip != null) Destroy(ringClip); ringClip = null;
        }
        static AudioClip RingClip()
        {
            int rate = 22050, n = rate * 3; var d = new float[n];
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)rate, s0 = t < 0.5f ? 0f : 0.6f, s1 = s0 + 0.4f;
                if (t < s0 || t > s1) continue;
                float env = Mathf.Clamp01(Mathf.Min(t - s0, s1 - t) / 0.01f);
                d[i] = 0.22f * env * (Mathf.Sin(2 * Mathf.PI * 440f * t) + Mathf.Sin(2 * Mathf.PI * 480f * t));
            }
            var clip = AudioClip.Create("Brene ring", n, 1, rate, false); if (clip == null) return null;
            clip.SetData(d, 0); return clip;
        }
    }
}
