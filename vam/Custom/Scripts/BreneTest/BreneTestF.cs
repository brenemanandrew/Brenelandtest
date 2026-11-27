// Brene crash test F: compiles only these files (BreneUIKit.cs, BreneLink.cs, BreneViture.cs, BreneRadial.cs, BreneCharacter.cs, BreneFlow.cs, BreneCoach.cs). If VaM loads this without closing, they are fine.
using UnityEngine;
namespace BreneTestsF { public class BreneTestF : MVRScript { public override void Init() { SuperController.LogMessage("Brene test F compiled and loaded fine"); } } }
