// Brene crash test C: compiles only these files (BreneUIKit.cs, BreneRadial.cs, BreneFlow.cs, BreneCoach.cs). If VaM loads this without closing, they are fine.
using UnityEngine;
namespace BreneTestsC { public class BreneTestC : MVRScript { public override void Init() { SuperController.LogMessage("Brene test C compiled and loaded fine"); } } }
