import { LightningElement } from "lwc";

export default class SonnetActivityCard extends LightningElement {
  taskTitle = "Due Diligence";
  taskStatus = "Open";
  description = "Follow up on why this request is on the draft state.";
  dueDate = "04-24-2025";
  assignedTo = "Dough Feinch";

  handleEdit() {
    this.dispatchEvent(new CustomEvent("edit"));
  }

  handleTransfer() {
    this.dispatchEvent(new CustomEvent("transfer"));
  }

  handleViewActivity() {
    this.dispatchEvent(new CustomEvent("viewactivity"));
  }
}
