import LightningModal from 'lightning/modal';
import { api, track } from 'lwc';

interface ComboOption {
    label: string;
    value: string;
}

interface FormData {
    salutation: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    mobile: string;
}

export interface MultiStepFormResult {
    data: FormData;
}

const TOTAL_STEPS = 2;

export default class MultiStepFormModal extends LightningModal {
    @api label = 'New Contact';

    @track currentStep = 1;

    @track formData: FormData = {
        salutation: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        mobile: ''
    };

    salutationOptions: ComboOption[] = [
        { label: 'None', value: '' },
        { label: 'Mr.', value: 'Mr.' },
        { label: 'Ms.', value: 'Ms.' },
        { label: 'Mrs.', value: 'Mrs.' },
        { label: 'Dr.', value: 'Dr.' },
        { label: 'Prof.', value: 'Prof.' }
    ];

    get isStep1(): boolean {
        return this.currentStep === 1;
    }

    get isStep2(): boolean {
        return this.currentStep === 2;
    }

    get isFirstStep(): boolean {
        return this.currentStep === 1;
    }

    get isLastStep(): boolean {
        return this.currentStep === TOTAL_STEPS;
    }

    get currentStepValue(): string {
        return `step-${this.currentStep}`;
    }

    handleFieldChange(event: CustomEvent<{ value: string }>): void {
        const target = event.target as HTMLElement & { dataset: DOMStringMap };
        const field = target.dataset.field as keyof FormData | undefined;
        if (!field) {
            return;
        }
        this.formData = { ...this.formData, [field]: event.detail?.value ?? '' };
    }

    handlePrevious(): void {
        if (this.currentStep > 1) {
            this.currentStep -= 1;
        }
    }

    handleNext(): void {
        if (!this.validateCurrentStep()) {
            return;
        }
        if (this.currentStep < TOTAL_STEPS) {
            this.currentStep += 1;
        }
    }

    handleSubmit(): void {
        if (!this.validateCurrentStep()) {
            return;
        }
        const result: MultiStepFormResult = {
            data: { ...this.formData }
        };
        this.close(result);
    }

    handleCancel(): void {
        this.close();
    }

    validateCurrentStep(): boolean {
        const inputs = Array.from(
            this.template.querySelectorAll<HTMLElement & { reportValidity(): boolean }>(
                'lightning-input,lightning-combobox'
            )
        );
        return inputs.reduce((valid, input) => input.reportValidity() && valid, true);
    }
}
