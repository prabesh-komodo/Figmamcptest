import { LightningElement, api } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

export default class ContactEditForm extends LightningElement {
  @api recordId;
  activeTab = "details";

  handleTabChange(event) {
    const target = event.target;
    this.activeTab = target.value;
  }

  handleSubmit(event) {
    event.preventDefault();
    const fields = event.detail.fields;
    const form = this.template.querySelector("lightning-record-edit-form");

    form.submit(fields);
  }

  handleSuccess(event) {
    this.dispatchEvent(
      new ShowToastEvent({
        title: "Success",
        message: "Contact saved successfully.",
        variant: "success"
      })
    );
    this.dispatchEvent(
      new CustomEvent("save", { detail: { id: event.detail.id } })
    );
  }

  handleError(event) {
    this.dispatchEvent(
      new ShowToastEvent({
        title: "Error",
        message: event.detail.message || "An error occurred while saving.",
        variant: "error"
      })
    );
  }

  handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
  }
}
