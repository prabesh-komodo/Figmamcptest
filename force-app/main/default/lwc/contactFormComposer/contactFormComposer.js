import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getCurrentUser from '@salesforce/apex/ContactFormOpusController.getCurrentUser';
import getFieldSetMembers from '@salesforce/apex/ContactFormOpusController.getFieldSetMembers';
import saveContact from '@salesforce/apex/ContactFormOpusController.saveContact';

;                        
                      
                  
                 
                     
 

const DEFAULT_FIELDS           = [
    'Salutation', 'FirstName', 'MiddleName', 'LastName', 'Phone', 'HomePhone', 'OtherPhone',
    'Title', 'Department', 'Fax', 'Birthdate', 'Email', 'ReportsToId', 'AssistantName', 'AssistantPhone',
    'LeadSource', 'Description', 'MailingStreet', 'MailingCity', 'MailingState', 'MailingPostalCode',
    'MailingCountry', 'OtherStreet', 'OtherCity', 'OtherState', 'OtherPostalCode', 'OtherCountry'
];

export default class ContactFormComposer extends LightningElement {
    ownerName         = '';
    ownerId         = '';
    accountName         = '';
    isSaving          = false;

    fieldSetFields                  = [];

    @wire(getCurrentUser)
    wiredUser({ data, error }                                                          ) {
        if (data) {
            this.ownerName = data.Name ?? '';
            this.ownerId = data.Id ?? '';
        }
        if (error) {
            this.ownerName = 'Unknown';
        }
    }

    @wire(getFieldSetMembers, { fieldSetName: 'ContactComposerFields' })
    wiredFieldSet({ data, error }                                                                                                       ) {
        if (data && data.length > 0) {
            this.fieldSetFields = data.filter((f) => f.fieldPath !== 'AccountId');
        } else {
            // Fallback when field set doesn't exist - use default field list
            this.fieldSetFields = DEFAULT_FIELDS.map((fp) => ({
                fieldPath: fp,
                label: fp.replace(/([A-Z])/g, ' $1').trim(),
                type: 'string',
                required: 'false'
            }));
        }
        if (error) {
            this.fieldSetFields = DEFAULT_FIELDS.map((fp) => ({
                fieldPath: fp,
                label: fp.replace(/([A-Z])/g, ' $1').trim(),
                type: 'string',
                required: 'false'
            }));
        }
    }

    handleAccountNameChange(event                                            )       {
        this.accountName = event.detail?.value ?? event.target.value ?? '';
    }

    handleCancel()       {
        const form = this.template.querySelector('lightning-record-edit-form');
        if (form) {
            (form                         ).reset();
        }
        this.accountName = '';
    }

    handleSubmit(event             )       {
        event.preventDefault();
        const fields = event.detail?.fields;
        if (!fields) {
            return;
        }

        this.isSaving = true;

        const contactData                         = {};
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined && value !== null && value !== '') {
                contactData[key] = String(value);
            }
        }

        saveContact({
            contactJson: JSON.stringify(contactData),
            accountName: this.accountName || null
        })
            .then(() => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Success',
                        message: 'Contact saved successfully.',
                        variant: 'success'
                    })
                );
                this.handleCancel();
            })
            .catch((err                                 ) => {
                const message = err?.body?.message ?? 'An error occurred while saving.';
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error',
                        message,
                        variant: 'error'
                    })
                );
            })
            .finally(() => {
                this.isSaving = false;
            });
    }
}
