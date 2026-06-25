import { LightningElement } from "lwc";

export default class TaskCard extends LightningElement {
  taskTitle = "Due Diligence";
  taskStatus = "Open";
  taskDescription = "Follow up on why this request is on the draft state.";
  dueDate = "04-24-2025";
  assignedTo = "Dough Feinch";

  handleTransfer() {
    this.dispatchEvent(new CustomEvent("transfer"));
  }

  handleViewActivity() {
    this.dispatchEvent(new CustomEvent("viewactivity"));
  }
}
