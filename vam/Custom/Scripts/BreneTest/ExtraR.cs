using System.Collections.Generic; using UnityEngine;
namespace BreneTestsR { public static class Colours {
  static readonly Dictionary<string, Color[]> sets = new Dictionary<string, Color[]> { { "Night", new[] { C(0.1f,0.1f,0.1f,1f), C(0.2f,0.2f,0.2f,1f) } } };
  static Color C(float r, float g, float b, float a) { return new Color(r, g, b, a); }
  static Font font; public static Font Font { get { if (font == null) font = Resources.GetBuiltinResource<Font>("Arial.ttf"); return font; } }
  public static Color Get(int i) { return sets["Night"][i]; } } }
