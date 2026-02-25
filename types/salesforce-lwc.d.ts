/**
 * Ambient declarations for Salesforce LWC and Apex so TypeScript can compile
 * without requiring full type packages. Replace with @salesforce/lwc-types when available.
 */
declare module 'lwc' {
    export class LightningElement {
        template: HTMLElement;
        [key: string]: unknown;
    }
    export function wire(
        adapter: unknown,
        config?: Record<string, unknown>
    ): (target: unknown, propertyKey: string, descriptor?: PropertyDescriptor) => void | PropertyDescriptor;
}

declare module 'lightning/platformShowToastEvent' {
    export interface ShowToastEventDetail {
        title?: string;
        message?: string;
        variant?: 'success' | 'error' | 'warning' | 'info';
    }
    export class ShowToastEvent extends CustomEvent<ShowToastEventDetail> {
        constructor(detail: ShowToastEventDetail);
    }
}

declare module 'lightning/uiObjectInfoApi' {
    export function getObjectInfo(options: { objectApiName: string }): void;
    export function getPicklistValues(options: {
        recordTypeId: string | undefined;
        fieldApiName: object;
    }): void;
}

declare module '@salesforce/schema/Contact' {
    const value: string;
    export default value;
}

declare module '@salesforce/schema/Contact.Salutation' {
    const value: object;
    export default value;
}

declare module '@salesforce/schema/Contact.LeadSource' {
    const value: object;
    export default value;
}

declare module '@salesforce/apex/ContactFormController.getCurrentUser' {
    export default function getCurrentUser(): Promise<{ Name?: string; Id?: string }>;
}

declare module '@salesforce/apex/ContactFormController.getReportsToOptions' {
    export default function getReportsToOptions(): Promise<Array<{ label: string; value: string }>>;
}

declare module '@salesforce/apex/ContactFormController.saveContact' {
    export default function saveContact(params: {
        contactData: Record<string, string>;
    }): Promise<string>;
}
