// Brene crash test B: compiles only these files (BreneLink.cs, BreneViture.cs). If VaM loads this without closing, they are fine.
using UnityEngine;
namespace BreneTestsB { public class BreneTestB : MVRScript { public override void Init() { SuperController.LogMessage("Brene test B compiled and loaded fine"); } } }
