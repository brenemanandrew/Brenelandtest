// Stand-ins for the parts of Unity 2018 and VaM that the Brene plugin uses, so `mcs` can check it compiles off the PC.
// They only prove the plugin is valid C# and consistent with itself and with these signatures; they do not prove VaM has
// every member (the real check is loading it in VaM). Run: bash vam/test/compile.sh
#pragma warning disable 0067, 0649, 0414
using System;
using System.Collections;
using System.Collections.Generic;

namespace UnityEngine
{
    public class Object { public string name; public static void Destroy(Object o) { } public static implicit operator bool(Object o) { return o != null; } }
    public class Component : Object { public Transform transform; public GameObject gameObject; public T GetComponent<T>() { return default(T); } public T GetComponentInParent<T>() { return default(T); } public T GetComponentInChildren<T>() { return default(T); } public T[] GetComponentsInChildren<T>(bool inactive) { return new T[0]; } public void SendMessage(string m, SendMessageOptions o) { } public void SendMessage(string m, object a, SendMessageOptions o) { } }
    public class Behaviour : Component { public bool enabled; }
    public class MonoBehaviour : Behaviour { public Coroutine StartCoroutine(IEnumerator e) { return null; } public Coroutine StartCoroutine(string m, object a) { return null; } }
    public class Coroutine { }
    public class YieldInstruction { }
    public class WaitForSeconds : YieldInstruction { public WaitForSeconds(float s) { } }
    public enum SendMessageOptions { RequireReceiver, DontRequireReceiver }
    public enum PrimitiveType { Sphere, Cube }
    public enum KeyCode { Return, KeypadEnter, BackQuote, Tab, Q, F1, Mouse3, Escape }
    public enum TextureFormat { RGBA32 }
    public enum TextureWrapMode { Clamp }
    public enum SpriteMeshType { FullRect, Tight }
    public enum TextAnchor { UpperLeft, MiddleLeft, MiddleCenter }
    public enum FontStyle { Normal, Bold, Italic }
    public enum RenderMode { ScreenSpaceOverlay, WorldSpace }
    public class GameObject : Object
    {
        public Transform transform; public bool activeSelf, activeInHierarchy;
        public GameObject() { } public GameObject(string n) { } public GameObject(string n, params Type[] t) { }
        public T AddComponent<T>() where T : Component { return default(T); } public T GetComponent<T>() { return default(T); }
        public T GetComponentInParent<T>() { return default(T); }
        public void SetActive(bool v) { } public void SendMessage(string m, SendMessageOptions o) { } public void SendMessage(string m, object a, SendMessageOptions o) { }
        public static GameObject CreatePrimitive(PrimitiveType t) { return null; }
    }
    public class Transform : Component, IEnumerable
    {
        public Vector3 position, localPosition, localScale; public Quaternion localRotation, rotation; public Transform parent; public int childCount;
        public void SetParent(Transform p, bool keep) { } public void SetParent(Transform p) { } public Transform GetChild(int i) { return null; }
        public void SetAsLastSibling() { } public int GetSiblingIndex() { return 0; } public void SetSiblingIndex(int i) { }
        public IEnumerator GetEnumerator() { yield break; }
    }
    public class RectTransform : Transform { public void GetWorldCorners(Vector3[] c) { } public Vector2 anchorMin, anchorMax, pivot, anchoredPosition, sizeDelta, offsetMin, offsetMax; public Rect rect; }
    public struct Vector2 { public float x, y; public float magnitude; public Vector2(float x, float y) { this.x = x; this.y = y; magnitude = 0; } public static Vector2 zero, one;
        public static Vector2 operator +(Vector2 a, Vector2 b) { return a; } public static Vector2 operator -(Vector2 a, Vector2 b) { return a; } public static Vector2 operator /(Vector2 a, float b) { return a; } public static Vector2 operator *(Vector2 a, float b) { return a; } public static Vector2 operator *(float b, Vector2 a) { return a; } public static implicit operator Vector2(Vector3 v) { return new Vector2(v.x, v.y); } public static float Distance(Vector2 a, Vector2 b) { return 0; } }
    public struct Vector3 { public float x, y, z; public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; } public static Vector3 zero, one;
        public static Vector3 operator +(Vector3 a, Vector3 b) { return a; } public static Vector3 operator -(Vector3 a, Vector3 b) { return a; } public static Vector3 operator *(Vector3 a, float b) { return a; } public static Vector3 operator *(float b, Vector3 a) { return a; }
        public static bool operator ==(Vector3 a, Vector3 b) { return true; } public static bool operator !=(Vector3 a, Vector3 b) { return false; } public override bool Equals(object o) { return true; } public override int GetHashCode() { return 0; }
        public static float Distance(Vector3 a, Vector3 b) { return 0; } public static Vector3 ClampMagnitude(Vector3 v, float m) { return v; } }
    public struct Vector4 { public Vector4(float a, float b, float c, float d) { } }
    public struct Quaternion { public static Quaternion identity; public static Quaternion Euler(float x, float y, float z) { return identity; } public static Quaternion Inverse(Quaternion q) { return q; }
        public static Quaternion operator *(Quaternion a, Quaternion b) { return a; } public static Vector3 operator *(Quaternion a, Vector3 b) { return b; }
        public static bool operator ==(Quaternion a, Quaternion b) { return true; } public static bool operator !=(Quaternion a, Quaternion b) { return false; } public override bool Equals(object o) { return true; } public override int GetHashCode() { return 0; } }
    public struct Color { public static Color white; public float r, g, b, a; public Color(float r, float g, float b) { this.r = r; this.g = g; this.b = b; a = 1; } public Color(float r, float g, float b, float a) { this.r = r; this.g = g; this.b = b; this.a = a; } }
    public struct Color32 { public Color32(byte r, byte g, byte b, byte a) { } }
    public struct Rect { public float x, y, width, height; public Vector2 size; public Rect(float x, float y, float w, float h) { this.x = x; this.y = y; width = w; height = h; size = new Vector2(w, h); } }
    public class RectOffset { public RectOffset(int l, int r, int t, int b) { } }
    public struct Ray { public Vector3 origin, direction; }
    public static class Mathf { public const float PI = 3.14159f; public static float Abs(float v) { return v; } public static float Clamp(float v, float a, float b) { return v; } public static int Clamp(int v, int a, int b) { return v; } public static float Clamp01(float v) { return v; } public static float Sqrt(float v) { return v; } public static float Max(float a, float b) { return a; } public static int Max(int a, int b) { return a; } public static float Min(float a, float b) { return a; } public static int FloorToInt(float v) { return 0; } public static int RoundToInt(float v) { return 0; } public static float Floor(float v) { return v; } public static float Atan2(float y, float x) { return 0; } public static float Cos(float a) { return 0; } public static float Sin(float a) { return 0; } }
    public static class Screen { public static int width, height; }
    public static class Time { public static float realtimeSinceStartup, deltaTime; }
    public static class Input { public static bool GetKey(KeyCode k) { return false; } public static bool GetKeyDown(KeyCode k) { return false; } public static bool GetKeyUp(KeyCode k) { return false; } public static bool GetMouseButtonDown(int b) { return false; } public static Vector3 mousePosition; }
    public static class Resources { public static T GetBuiltinResource<T>(string n) where T : Object { return null; } }
    public class Font : Object { }
    public enum AudioType { WAV }
    public class AudioClip : Object { }
    public class AudioSource : Behaviour { public AudioClip clip; public bool isPlaying; public float spatialBlend, minDistance, volume; public void Play() { } public void Stop() { } public void GetOutputData(float[] d, int ch) { } }
    public class Texture : Object { }
    public class Texture2D : Texture { public TextureWrapMode wrapMode; public Texture2D(int w, int h) { } public Texture2D(int w, int h, TextureFormat f, bool m) { } public bool LoadImage(byte[] b) { return true; } public void SetPixels32(Color32[] p) { } public void Apply() { } }
    public class Sprite : Object { public static Sprite Create(Texture2D t, Rect r, Vector2 p, float ppu, uint ex, SpriteMeshType m, Vector4 b) { return null; } }
    public class Material : Object { public Color color; }
    public class Renderer : Component { public Material material; }
    public class Collider : Component { }
    public class Camera : Behaviour { public float fieldOfView, nearClipPlane, farClipPlane, depth, aspect; public int cullingMask; public Rect rect; public void CopyFrom(Camera c) { } public void ResetAspect() { }
        public Ray ScreenPointToRay(Vector3 p) { return new Ray(); } public Vector3 WorldToScreenPoint(Vector3 p) { return p; } }
    public class Canvas : Behaviour { public RenderMode renderMode; public int sortingOrder; public float scaleFactor; public static void ForceUpdateCanvases() { } }
    public class CanvasGroup : Behaviour { public bool blocksRaycasts; public float alpha; }
}
namespace UnityEngine.Events { public class UnityEvent { public void AddListener(Action a) { } } public class UnityEvent<T> { public void AddListener(Action<T> a) { } } }
namespace UnityEngine.EventSystems
{
    public class PointerEventData { public UnityEngine.Vector2 delta; }
    public struct RaycastResult { public UnityEngine.GameObject gameObject; }
    public class EventSystem { public static EventSystem current; public void RaycastAll(PointerEventData e, List<RaycastResult> r) { } }
    public interface IBeginDragHandler { void OnBeginDrag(PointerEventData e); }
    public interface IDragHandler { void OnDrag(PointerEventData e); }
    public interface IEndDragHandler { void OnEndDrag(PointerEventData e); }
}
namespace UnityEngine.UI
{
    public enum HorizontalWrapMode { Wrap, Overflow } public enum VerticalWrapMode { Truncate, Overflow }
    public class Graphic : Behaviour { public Color color; public bool raycastTarget; public RectTransform rectTransform; }
    public class RawImage : Graphic { public Texture texture; }
    public class Slider : Selectable { public enum Direction { LeftToRight } public RectTransform fillRect, handleRect; public Direction direction; public float minValue, maxValue, value; public UnityEngine.Events.UnityEvent<float> onValueChanged; }
    public class Image : Graphic { public enum Type { Simple, Sliced } public Sprite sprite; public Type type; public bool fillCenter; }
    public class Text : Graphic { public Font font; public int fontSize; public string text; public TextAnchor alignment; public HorizontalWrapMode horizontalOverflow; public VerticalWrapMode verticalOverflow; public FontStyle fontStyle; public bool supportRichText; }
    public struct ColorBlock { public Color highlightedColor, pressedColor; }
    public class Selectable : Behaviour { public Graphic targetGraphic; public ColorBlock colors; }
    public class Button : Selectable { public class ButtonClickedEvent : UnityEngine.Events.UnityEvent { } public ButtonClickedEvent onClick; }
    public class InputField : Selectable { public enum LineType { SingleLine } public string text; public Text textComponent; public Graphic placeholder; public LineType lineType; public UnityEngine.Events.UnityEvent<string> onEndEdit; public void ActivateInputField() { } }
    public class ScrollRect : Behaviour { public enum MovementType { Clamped } public RectTransform viewport, content; public bool horizontal; public float scrollSensitivity, verticalNormalizedPosition; public MovementType movementType; }
    public class GridLayoutGroup : Behaviour { public Vector2 cellSize, spacing; public TextAnchor childAlignment; }
    public class VerticalLayoutGroup : Behaviour { public float spacing; public bool childForceExpandHeight, childControlHeight, childControlWidth; public RectOffset padding; }
    public class LayoutElement : Behaviour { public float minHeight, preferredHeight; }
    public class ContentSizeFitter : Behaviour { public enum FitMode { PreferredSize } public FitMode verticalFit; }
    public class CanvasScaler : Behaviour { public enum ScaleMode { ConstantPixelSize } public ScaleMode uiScaleMode; public float scaleFactor; }
    public class GraphicRaycaster : Behaviour { }
    public class RectMask2D : Behaviour { }
}
namespace UnityEngine.Networking
{
    public static class UnityWebRequestMultimedia { public static UnityWebRequest GetAudioClip(string u, UnityEngine.AudioType t) { return null; } }
    public class DownloadHandlerAudioClip : DownloadHandler { public static UnityEngine.AudioClip GetContent(UnityWebRequest r) { return null; } }
    public class UploadHandler { } public class UploadHandlerRaw : UploadHandler { public UploadHandlerRaw(byte[] b) { } }
    public class DownloadHandler { public string text; public byte[] data; } public class DownloadHandlerBuffer : DownloadHandler { }
    public class UnityWebRequestAsyncOperation : YieldInstruction { }
    public class UnityWebRequest : IDisposable { public UnityWebRequest(string u, string m) { } public static UnityWebRequest Get(string u) { return null; } public static string EscapeURL(string s) { return s; } public int timeout; public long responseCode; public bool isNetworkError, isHttpError; public string error;
        public UploadHandler uploadHandler; public DownloadHandler downloadHandler; public void SetRequestHeader(string k, string v) { } public UnityWebRequestAsyncOperation SendWebRequest() { return null; } public void Dispose() { } }
}
namespace SimpleJSON
{
    public class JSONNode { public virtual JSONNode this[string k] { get { return null; } set { } } public virtual JSONNode this[int i] { get { return null; } set { } } public virtual string Value { get { return ""; } set { } }
        public virtual float AsFloat { get; set; } public virtual int AsInt { get; set; } public virtual bool AsBool { get; set; } public virtual JSONArray AsArray { get { return null; } } public virtual int Count { get { return 0; } }
        public virtual void Add(JSONNode n) { } public static implicit operator JSONNode(string s) { return null; } }
    public class JSONClass : JSONNode { } public class JSONArray : JSONNode { }
    public static class JSON { public static JSONNode Parse(string s) { return null; } }
}
namespace MVR.FileManagementSecure { public static class FileManagerSecure { public static void CreateDirectory(string p) { } public static bool FileExists(string p) { return false; } public static void DeleteFile(string p) { } } }

// ---- VaM ----
public class JSONStorableUrl { public string val; }
public class JSONStorable : UnityEngine.MonoBehaviour { public JSONStorableUrl GetUrlJSONParam(string n) { return null; } public void CallAction(string n) { } public List<string> GetFloatParamNames() { return null; } public JSONStorableFloat GetFloatJSONParam(string n) { return null; } public JSONStorableString GetStringJSONParam(string n) { return null; } public JSONStorableStringChooser GetStringChooserJSONParam(string n) { return null; } }
public class Atom : UnityEngine.MonoBehaviour { public string uid, type; public FreeControllerV3 mainController; public FreeControllerV3[] freeControllers; public JSONStorable GetStorableByID(string id) { return null; } }
public class FreeControllerV3 : UnityEngine.MonoBehaviour { public UnityEngine.Transform control; public Atom containingAtom; }
public class SuperController : UnityEngine.MonoBehaviour
{
    public enum GameMode { Edit, Play }
    public static SuperController singleton; public GameMode gameMode; public bool freezeAnimation; public UnityEngine.Camera MonitorCenterCamera;
    public List<Atom> GetAtoms() { return null; } public Atom GetAtomByUid(string u) { return null; } public Atom GetSelectedAtom() { return null; } public void SelectController(FreeControllerV3 fc) { }
    public void SaveJSON(SimpleJSON.JSONClass j, string p) { } public SimpleJSON.JSONClass LoadJSON(string p) { return null; }
    public static void LogError(string s) { } public static void LogMessage(string s) { }
}
public class JSONStorableBool { public bool val; public JSONStorableBool(string n, bool d, Action<bool> cb) { } }
public class JSONStorableFloat { public float val, min, max; public JSONStorableFloat(string n, float d, Action<float> cb, float min, float max) { } }
public class JSONStorableString { public string val; public JSONStorableString(string n, string d, Action<string> cb) { } }
public class UIDynamic { public float height; }
public class JSONStorableStringChooser { public string val; public JSONStorableStringChooser(string n, List<string> choices, string d, string label) { } }
public class UIDynamicButton : UIDynamic { public UnityEngine.UI.Button button; }
public class MVRScript : UnityEngine.MonoBehaviour
{
    public Atom containingAtom; public virtual void Init() { }
    public void RegisterBool(JSONStorableBool b) { } public void RegisterFloat(JSONStorableFloat f) { } public void RegisterString(JSONStorableString s) { } public void RegisterStringChooser(JSONStorableStringChooser c) { } public UIDynamic CreatePopup(JSONStorableStringChooser c, bool right = false) { return null; }
    public UIDynamic CreateToggle(JSONStorableBool b, bool right = false) { return null; } public UIDynamic CreateSlider(JSONStorableFloat f, bool right = false) { return null; }
    public UIDynamic CreateTextField(JSONStorableString s, bool right = false) { return null; } public UIDynamicButton CreateButton(string l, bool right = false) { return null; }
}
