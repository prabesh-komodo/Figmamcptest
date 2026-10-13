import { LightningElement, api } from "lwc";

/**
 * Single-line, truncated text link rendered inside a datatable cell. Datatable
 * custom types cannot dispatch events themselves, so this cell emits a
 * bubbling, composed `linkcellclick` event that the datatable's parent handles.
 */
export default class RequestUserRoleExplorerLinkCell extends LightningElement {
  @api label = "";
  @api actionName = "";
  @api rowKey = "";

  handleClick() {
    this.dispatchEvent(
      new CustomEvent("linkcellclick", {
        bubbles: true,
        composed: true,
        detail: { actionName: this.actionName, rowKey: this.rowKey }
      })
    );
  }
}
