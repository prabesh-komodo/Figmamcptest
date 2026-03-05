import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import saveContact from '@salesforce/apex/ContactFormOpusController.saveContact';
import getCurrentUser from '@salesforce/apex/ContactFormOpusController.getCurrentUser';

export default class ContactFormGemini extends LightningElement {
    @track formData = {};
    accountName = '';
    ownerName = '';
    @track reportsToId = null;
    @track leadSourceId = null;

    @wire(getCurrentUser)
    wiredUser({ error, data }) {
        if (data) {
            this.ownerName = data.Name;
        } else if (error) {
            console.error('Error fetching user', error);
        }
    }

    get salutationOptions() {
        return [
            { label: '--None--', value: '' },
            { label: 'Mr.', value: 'Mr.' },
            { label: 'Ms.', value: 'Ms.' },
            { label: 'Mrs.', value: 'Mrs.' },
            { label: 'Dr.', value: 'Dr.' },
            { label: 'Prof.', value: 'Prof.' }
        ];
    }

    handleChange(event) {
        const field = event.target.dataset.field;
        const value = event.target.value;
        if (field === 'AccountName') {
            this.accountName = value;
        } else {
            this.formData[field] = value;
        }
    }

    handleReportsToChange(event) {
        this.reportsToId = event.detail.recordId;
        this.formData['ReportsToId'] = this.reportsToId;
    }

    handleLeadSourceChange(event) {
        this.leadSourceId = event.detail.recordId;
        this.formData['LeadSource'] = this.leadSourceId;
    }

    handleCancel() {
        this.formData = {};
        this.accountName = '';
        this.reportsToId = null;
        this.leadSourceId = null;
        
        const inputs = this.template.querySelectorAll('lightning-input, lightning-textarea, lightning-combobox');
        inputs.forEach(input => {
            if (!input.readOnly) {
                input.value = '';
            }
        });
    }

    handleSave() {
        const allValid = [...this.template.querySelectorAll('lightning-input, lightning-textarea, lightning-combobox')]
            .reduce((validSoFar, inputCmp) => {
                inputCmp.reportValidity();
                return validSoFar && inputCmp.checkValidity();
            }, true);

        if (!allValid) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: 'Please fill in all required fields.',
                variant: 'error'
            }));
            return;
        }

        saveContact({ contactJson: JSON.stringify(this.formData), accountName: this.accountName })
            .then(result => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Success',
                    message: 'Contact saved successfully',
                    variant: 'success'
                }));
                this.handleCancel();
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Error saving record',
                    message: error.body ? error.body.message : error.message,
                    variant: 'error'
                }));
            });
    }
}
