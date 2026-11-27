// Brene crash test D: compiles only these files (BreneUIKit.cs, BreneLink.cs, BreneCharacter.cs). If VaM loads this without closing, they are fine.
using UnityEngine;
namespace BreneTestsD { public class BreneTestD : MVRScript { public override void Init() { SuperController.LogMessage("Brene test D compiled and loaded fine"); } } }
