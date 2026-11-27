// Brene crash test A: compiles only these files (BreneUIKit.cs). If VaM loads this without closing, they are fine.
using UnityEngine;
namespace BreneTestsA { public class BreneTestA : MVRScript { public override void Init() { SuperController.LogMessage("Brene test A compiled and loaded fine"); } } }
