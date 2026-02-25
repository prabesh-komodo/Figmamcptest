import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getObjectInfo, getPicklistValues } from 'lightning/uiObjectInfoApi';
import CONTACT_OBJECT from '@salesforce/schema/Contact';
import SALUTATION_FIELD from '@salesforce/schema/Contact.Salutation';
import LEAD_SOURCE_FIELD from '@salesforce/schema/Contact.LeadSource';
import getCurrentUser from '@salesforce/apex/ContactFormController.getCurrentUser';
import getReportsToOptions from '@salesforce/apex/ContactFormController.getReportsToOptions';
import saveContact from '@salesforce/apex/ContactFormController.saveContact';

export default class AccountForm extends LightningElement {
    contactRecordTypeId;
    salutationOptions = [];
    leadSourceOptions = [];
    reportsToOptions = [];
    currentUserName = '';
    isSaving = false;

    @wire(getObjectInfo, { objectApiName: CONTACT_OBJECT })
    objectInfoWire({ data, error }) {
        if (data) {
            this.contactRecordTypeId = data.defaultRecordTypeId;
        }
    }

    @wire(getCurrentUser)
    currentUserWire({ data, error }) {
        if (data) {
            this.currentUserName = data.Name || '';
        }
    }

    @wire(getPicklistValues, {
        recordTypeId: '$contactRecordTypeId',
        fieldApiName: SALUTATION_FIELD
    })
    salutationPicklistWire({ data, error }) {
        if (data) {
            this.salutationOptions = data.values || [];
        }
    }

    @wire(getPicklistValues, {
        recordTypeId: '$contactRecordTypeId',
        fieldApiName: LEAD_SOURCE_FIELD
    })
    leadSourcePicklistWire({ data, error }) {
        if (data) {
            this.leadSourceOptions = data.values || [];
        }
    }

    @wire(getReportsToOptions)
    reportsToOptionsWire({ data, error }) {
        if (data) {
            this.reportsToOptions = data || [];
        }
    }

    get salutationOptionsWithEmpty() {
        return [
            { label: '--None--', value: '' },
            ...(this.salutationOptions || [])
        ];
    }

    get leadSourceOptionsWithEmpty() {
        return [
            { label: '--None--', value: '' },
            ...(this.leadSourceOptions || [])
        ];
    }

    get reportsToOptionsWithEmpty() {
        return (this.reportsToOptions && this.reportsToOptions.length > 0) ? this.reportsToOptions : [{ label: '--None--', value: '' }];
    }

    handleSubmit() {
        this.isSaving = true;
        const fields = this.collectFieldValues();
        if (!fields.FirstName || !fields.FirstName.trim()) {
            this.showToast('Error', 'First Name is required.', 'error');
            this.isSaving = false;
            return;
        }
        if (!fields.LastName || !fields.LastName.trim()) {
            this.showToast('Error', 'Last Name is required.', 'error');
            this.isSaving = false;
            return;
        }
        if (!fields.Phone || !fields.Phone.trim()) {
            this.showToast('Error', 'Phone is required.', 'error');
            this.isSaving = false;
            return;
        }
        saveContact({ contactData: fields })
            .then((result) => {
                this.showToast('Success', 'Contact saved successfully.', 'success');
                this.resetForm();
                this.dispatchEvent(new CustomEvent('contactcreated', { detail: { id: result } }));
            })
            .catch((error) => {
                const message = error.body?.message || error.message || 'Unknown error';
                this.showToast('Error Saving Contact', message, 'error');
            })
            .finally(() => {
                this.isSaving = false;
            });
    }

    collectFieldValues() {
        const inputFields = this.template.querySelectorAll('lightning-input, lightning-combobox, lightning-textarea');
        const data = {};
        const excludeNames = new Set(['Owner']);
        inputFields.forEach((field) => {
            const name = field.name;
            if (name && !excludeNames.has(name) && !field.disabled) {
                const val = field.type === 'checkbox' ? field.checked : (field.value || '').trim();
                if (val !== '' || name === 'FirstName' || name === 'LastName' || name === 'Phone') {
                    data[name] = val;
                }
            }
        });
        return data;
    }

    resetForm() {
        const inputFields = this.template.querySelectorAll('lightning-input, lightning-combobox, lightning-textarea');
        inputFields.forEach((field) => {
            if (field.name === 'Owner') return;
            if (field.type === 'checkbox') {
                field.checked = false;
            } else {
                field.value = '';
            }
        });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({ title, message, variant })
        );
    }
}
