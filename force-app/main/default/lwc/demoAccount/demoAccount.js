import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';

;                                                      
                                        
 

;                                                        
                                                
 

;                                                         
                           
 

;                                                       
                                                  
 

export default class DemoAccount extends NavigationMixin(LightningElement) {
    @api recordId         ;

    @track isSaving = false;
    @track relatesToId                = null;

    handleRelatesToChange(event                         )       {
        this.relatesToId = event.detail.recordId;
    }

    handleSubmit(event                           )       {
        event.preventDefault();
        this.isSaving = true;

        const fields = event.detail?.fields ?? {};

        const form = this.template.querySelector('lightning-record-edit-form')   
                                                                               
                  ;

        if (form) {
            form.submit(fields);
        }
    }

    handleSuccess(event                            )       {
        this.isSaving = false;
        const savedId = event.detail?.id;

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Success',
                message: 'Contact saved successfully.',
                variant: 'success'
            })
        );

        if (savedId) {
            (this[NavigationMixin.Navigate]                         )({
                type: 'standard__recordPage',
                attributes: {
                    recordId: savedId,
                    actionName: 'view'
                }
            });
        }
    }

    handleError(event                          )       {
        this.isSaving = false;
        const message =
            event.detail?.detail ?? event.detail?.message ?? 'An error occurred while saving.';

        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error saving contact',
                message,
                variant: 'error'
            })
        );
    }

    handleCancel()       {
        this.relatesToId = null;
        this.isSaving = false;

        const form = this.template.querySelector('lightning-record-edit-form')   
                                               
                  ;

        form?.reset();

        this.dispatchEvent(new CustomEvent('cancel'));
    }
}
