import { LightningElement, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getCurrentUser from '@salesforce/apex/ContactFieldOpusController.getCurrentUser';
import getFieldSetMembers from '@salesforce/apex/ContactFieldOpusController.getFieldSetMembers';
import saveContact from '@salesforce/apex/ContactFieldOpusController.saveContact';

;                         
                      
                  
                 
                     
 

;                        
             
                                                              
 

const ADDRESS_FIELD_PATHS = new Set([
    'MailingStreet', 'MailingCity', 'MailingState', 'MailingPostalCode', 'MailingCountry',
    'OtherStreet', 'OtherCity', 'OtherState', 'OtherPostalCode', 'OtherCountry'
]);

const DESCRIPTION_FIELD_PATHS = new Set(['Description']);

export default class ContactFieldOpus extends LightningElement {
    ownerName = '';
    accountName = '';
    isSaving = false;

    contactFields                   = [];
    addressFields                   = [];
    descriptionFields                   = [];

    @wire(getCurrentUser)
    wiredUser({ error, data }                               ) {
        if (data) {
            this.ownerName = data.Name ?? '';
        }
        if (error) {
            console.error('Error fetching user', error);
        }
    }

    @wire(getFieldSetMembers, { fieldSetName: 'ContactComposerFields' })
    wiredFieldSet({ data, error }                              ) {
        if (data && data.length > 0) {
            const filtered = data.filter((f                ) => f.fieldPath !== 'AccountId');
            this.contactFields = filtered.filter(
                (f                ) =>
                    !ADDRESS_FIELD_PATHS.has(f.fieldPath) &&
                    !DESCRIPTION_FIELD_PATHS.has(f.fieldPath)
            );
            this.addressFields = filtered.filter((f                ) =>
                ADDRESS_FIELD_PATHS.has(f.fieldPath)
            );
            this.descriptionFields = filtered.filter((f                ) =>
                DESCRIPTION_FIELD_PATHS.has(f.fieldPath)
            );
        }
        if (error) {
            this.contactFields = [];
            this.addressFields = [];
            this.descriptionFields = [];
        }
    }

    handleAccountNameChange(event       ) {
        this.accountName = (event.target                    ).value ?? '';
    }

    handleCancel() {
        const form = this.template.querySelector('lightning-record-edit-form')                                          ;
        if (form) {
            form.reset();
        }
        this.accountName = '';
    }

    handleSubmit(event                                                  ) {
        event.preventDefault();
        const fields = event.detail?.fields;
        if (!fields) return;

        this.isSaving = true;
        const contactData                          = {};
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined && value !== null && value !== '') {
                contactData[key] =
                    typeof value === 'object' && value !== null
                        ? String(value)
                        : value;
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
                        message: 'Contact saved successfully',
                        variant: 'success'
                    })
                );
                this.handleCancel();
            })
            .catch((err                                                   ) => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error saving record',
                        message: err?.body?.message ?? err?.message ?? 'An error occurred',
                        variant: 'error'
                    })
                );
            })
            .finally(() => {
                this.isSaving = false;
            });
    }
}
