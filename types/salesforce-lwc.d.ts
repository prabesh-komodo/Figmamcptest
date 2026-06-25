/**
 * Ambient declarations for Salesforce LWC and Apex so TypeScript can compile
 * without requiring full type packages. Replace with @salesforce/lwc-types when available.
 */
declare module 'lwc' {
    export class LightningElement {
        template: HTMLElement;
        dispatchEvent(event: Event): boolean;
        [key: string]: unknown;
    }
    export function wire(
        adapter: unknown,
        config?: Record<string, unknown>
    ): (target: unknown, propertyKey: string, descriptor?: PropertyDescriptor) => void | PropertyDescriptor;
    export function track(
        target: unknown,
        propertyKey: string
    ): void;
    export function api(
        target: unknown,
        propertyKey: string
    ): void;
}

declare module 'lightning/modal' {
    import { LightningElement } from 'lwc';
    export default class LightningModal extends LightningElement {
        close(result?: unknown): void;
    }
}

declare module 'lightning/navigation' {
    export const NavigationMixin: unknown;
}

declare module 'lightning/platformResourceLoader' {
    export function loadScript(
        component: unknown,
        resourceUrl: string
    ): Promise<void>;
    export function loadStyle(
        component: unknown,
        resourceUrl: string
    ): Promise<void>;
}

declare module 'c/multiRowInputModal' {
    interface MultiRowInputModalOpenOptions {
        label?: string;
        size?: 'small' | 'medium' | 'large';
    }
    const MultiRowInputModal: {
        open(options?: MultiRowInputModalOpenOptions): Promise<
            { rows: Array<{ id: string; name: string; detail: string }> } | undefined
        >;
    };
    export default MultiRowInputModal;
}

declare module '@salesforce/resourceUrl/d3' {
    const resourceUrl: string;
    export default resourceUrl;
}

interface D3ZoomIdentity {
    k: number;
    x: number;
    y: number;
    translate(x: number, y: number): D3ZoomIdentity;
    scale(k: number): D3ZoomIdentity;
}

interface D3Selection {
    append(type: string): D3Selection;
    attr(name: string, value?: unknown): D3Selection;
    style(name: string, value?: unknown): D3Selection;
    on(event: string, handler: (...args: unknown[]) => void): D3Selection;
    call(fn: unknown, ...args: unknown[]): D3Selection;
    select(selector: string): D3Selection;
    selectAll(selector: string): D3Selection;
    data(data: unknown[], key?: (d: unknown) => string): D3Selection;
    join(type: string): D3Selection;
    each(fn: (this: SVGElement, d: unknown, i: number, nodes: SVGElement[]) => void): D3Selection;
    classed(names: string, value: boolean | ((d: unknown) => boolean)): D3Selection;
    text(value: string): D3Selection;
    node(): SVGElement;
    transition(): D3Selection;
    duration(ms: number): D3Selection;
    ease(fn: unknown): D3Selection;
    remove(): D3Selection;
}

interface D3Static {
    select(selector: string | Element): D3Selection;
    zoom(): D3ZoomBehavior;
    zoomIdentity: D3ZoomIdentity;
    easeCubicOut: unknown;
}

interface D3ZoomBehavior {
    scaleExtent(extent: [number, number]): D3ZoomBehavior;
    on(event: string, handler: (event: D3ZoomEvent) => void): D3ZoomBehavior;
    transform: unknown;
    scaleBy: unknown;
}

interface D3ZoomEvent {
    transform: D3ZoomIdentity;
}

interface Window {
    d3: D3Static;
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

declare module '@salesforce/schema/Campaign' {
    const value: string;
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

declare module '@salesforce/apex/ContactFormOpusController.getCurrentUser' {
    export default function getCurrentUser(): Promise<{ Name?: string; Id?: string }>;
}

declare module '@salesforce/apex/ContactFormOpusController.getFieldSetMembers' {
    export default function getFieldSetMembers(params: {
        fieldSetName: string;
    }): Promise<Array<{ fieldPath: string; label: string; type: string; required: string }>>;
}

declare module '@salesforce/apex/ContactFormOpusController.searchContacts' {
    export default function searchContacts(params: {
        searchTerm: string;
    }): Promise<Array<{ label: string; value: string }>>;
}

declare module '@salesforce/apex/ContactFormOpusController.saveContact' {
    export default function saveContact(params: {
        contactJson: string;
        accountName: string | null;
    }): Promise<string>;
}

declare module '@salesforce/apex/ContactFieldOpusController.getCurrentUser' {
    export default function getCurrentUser(): Promise<{ Name?: string; Id?: string }>;
}

declare module '@salesforce/apex/ContactFieldOpusController.getFieldSetMembers' {
    export default function getFieldSetMembers(params: {
        fieldSetName: string;
    }): Promise<Array<{ fieldPath: string; label: string; type: string; required: string }>>;
}

declare module '@salesforce/apex/ContactFieldOpusController.saveContact' {
    export default function saveContact(params: {
        contactJson: string;
        accountName: string | null;
    }): Promise<string>;
}

declare module '@salesforce/apex/ContactFormSonnetController.getCurrentUser' {
    export default function getCurrentUser(): Promise<{ Name?: string; SmallPhotoUrl?: string; Id?: string }>;
}

declare module '@salesforce/apex/ContactFormSonnetController.saveContact' {
    export default function saveContact(params: {
        contactRecord: Record<string, unknown>;
    }): Promise<{ Id: string }>;
}

declare module '@salesforce/apex/ContactEditFormController.getFieldSetMembers' {
    export default function getFieldSetMembers(params: {
        fieldSetName: string;
    }): Promise<Array<{ fieldPath: string; label: string; type: string; required: boolean }>>;
}

declare module '@salesforce/apex/ContactEditFormController.getCurrentUserInfo' {
    export default function getCurrentUserInfo(): Promise<Record<string, string>>;
}

declare module '@salesforce/apex/ContactEditFormController.searchContacts' {
    export default function searchContacts(params: {
        searchTerm: string;
    }): Promise<Array<{ label: string; value: string }>>;
}
