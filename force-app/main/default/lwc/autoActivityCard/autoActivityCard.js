import { LightningElement } from "lwc";

export default class AutoActivityCard extends LightningElement {
  handleEdit() {
    this.dispatchEvent(
      new CustomEvent("edit", { bubbles: true, composed: true })
    );
  }

  handleTransfer() {
    this.dispatchEvent(
      new CustomEvent("transfer", { bubbles: true, composed: true })
    );
  }

  handleViewActivity() {
    this.dispatchEvent(
      new CustomEvent("viewactivity", { bubbles: true, composed: true })
    );
  }
}
