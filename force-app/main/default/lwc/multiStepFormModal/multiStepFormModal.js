import LightningModal from "lightning/modal";
import { api, track } from "lwc";

const TOTAL_STEPS = 2;

export default class MultiStepFormModal extends LightningModal {
  @api label = "New Contact";

  @track currentStep = 1;

  @track formData = {
    salutation: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    mobile: ""
  };

  salutationOptions = [
    { label: "None", value: "" },
    { label: "Mr.", value: "Mr." },
    { label: "Ms.", value: "Ms." },
    { label: "Mrs.", value: "Mrs." },
    { label: "Dr.", value: "Dr." },
    { label: "Prof.", value: "Prof." }
  ];

  get isStep1() {
    return this.currentStep === 1;
  }

  get isStep2() {
    return this.currentStep === 2;
  }

  get isFirstStep() {
    return this.currentStep === 1;
  }

  get isLastStep() {
    return this.currentStep === TOTAL_STEPS;
  }

  get currentStepValue() {
    return `step-${this.currentStep}`;
  }

  handleFieldChange(event) {
    const target = event.target;
    const field = target.dataset.field;
    if (!field) {
      return;
    }
    this.formData = { ...this.formData, [field]: event.detail?.value ?? "" };
  }

  handlePrevious() {
    if (this.currentStep > 1) {
      this.currentStep -= 1;
    }
  }

  handleNext() {
    if (!this.validateCurrentStep()) {
      return;
    }
    if (this.currentStep < TOTAL_STEPS) {
      this.currentStep += 1;
    }
  }

  handleSubmit() {
    if (!this.validateCurrentStep()) {
      return;
    }
    const result = {
      data: { ...this.formData }
    };
    this.close(result);
  }

  handleCancel() {
    this.close();
  }

  validateCurrentStep() {
    const inputs = Array.from(
      this.template.querySelectorAll("lightning-input,lightning-combobox")
    );
    return inputs.reduce(
      (valid, input) => input.reportValidity() && valid,
      true
    );
  }
}
