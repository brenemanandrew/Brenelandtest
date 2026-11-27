using UnityEngine; using UnityEngine.EventSystems;
namespace BreneTestsQ { public class Dragger : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler {
  public void OnBeginDrag(PointerEventData e) { } public void OnDrag(PointerEventData e) { } public void OnEndDrag(PointerEventData e) { } } }
