import { LightningElement } from 'lwc';
import MultiStepFormModal from 'c/multiStepFormModal';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class MultiStepFormLauncher extends LightningElement {
    async handleOpenModal(): Promise<void> {
        const result = await MultiStepFormModal.open({
            label: 'New Contact',
            size: 'small'
        });

        if (result?.data) {
            const { firstName, lastName } = result.data;
            const fullName = `${firstName} ${lastName}`.trim();
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Form submitted',
                    message: fullName ? `Captured details for ${fullName}.` : 'Form details captured.',
                    variant: 'success'
                })
            );
            this.dispatchEvent(
                new CustomEvent('formsubmit', {
                    detail: { data: result.data }
                })
            );
        }
    }
}
