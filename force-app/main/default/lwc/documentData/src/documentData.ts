import { LightningElement } from 'lwc';

interface GeneratedDocument {
    id: string;
    documentName: string;
    documentUrl: string;
    request: string;
    requestUrl: string;
    template: string;
    status: string;
    dateModified: string;
    modifiedBy: string;
    dateCreated: string;
    createdBy: string;
}

interface DocumentTemplate {
    id: string;
    templateName: string;
    templateUrl: string;
    category: string;
    status: string;
    dateModified: string;
    modifiedBy: string;
    dateCreated: string;
    createdBy: string;
}

interface DatatableColumn {
    label: string;
    fieldName: string;
    type: string;
    sortable: boolean;
    typeAttributes?: Record<string, unknown>;
}

interface RowActionEvent extends CustomEvent {
    detail: {
        action: { name: string };
        row: Record<string, unknown>;
    };
}

const GENERATED_DOC_COLUMNS: DatatableColumn[] = [
    {
        label: 'Document',
        fieldName: 'documentUrl',
        type: 'url',
        sortable: true,
        typeAttributes: { label: { fieldName: 'documentName' }, target: '_blank' }
    },
    {
        label: 'Request',
        fieldName: 'requestUrl',
        type: 'url',
        sortable: true,
        typeAttributes: { label: { fieldName: 'request' }, target: '_blank' }
    },
    { label: 'Template', fieldName: 'template', type: 'text', sortable: true },
    { label: 'Status', fieldName: 'status', type: 'text', sortable: true },
    { label: 'Date Modified', fieldName: 'dateModified', type: 'text', sortable: true },
    { label: 'Modified By', fieldName: 'modifiedBy', type: 'text', sortable: true },
    { label: 'Date Created', fieldName: 'dateCreated', type: 'text', sortable: true },
    { label: 'Created By', fieldName: 'createdBy', type: 'text', sortable: true }
];

const TEMPLATE_COLUMNS: DatatableColumn[] = [
    {
        label: 'Template Name',
        fieldName: 'templateUrl',
        type: 'url',
        sortable: true,
        typeAttributes: { label: { fieldName: 'templateName' }, target: '_blank' }
    },
    { label: 'Category', fieldName: 'category', type: 'text', sortable: true },
    { label: 'Status', fieldName: 'status', type: 'text', sortable: true },
    { label: 'Date Modified', fieldName: 'dateModified', type: 'text', sortable: true },
    { label: 'Modified By', fieldName: 'modifiedBy', type: 'text', sortable: true },
    { label: 'Date Created', fieldName: 'dateCreated', type: 'text', sortable: true },
    { label: 'Created By', fieldName: 'createdBy', type: 'text', sortable: true }
];

const MOCK_GENERATED_DOCUMENTS: GeneratedDocument[] = [
    {
        id: '1',
        documentName: 'Fellowship Grant Agreement',
        documentUrl: '#',
        request: 'REQ-003',
        requestUrl: '#',
        template: 'Fellowship Grant Agreement',
        status: 'Draft',
        dateModified: '03-01-2026',
        modifiedBy: 'John Hopkins',
        dateCreated: '03-01-2026',
        createdBy: 'John Hopkins'
    },
    {
        id: '2',
        documentName: 'Letter of Intent',
        documentUrl: '#',
        request: 'REQ-002',
        requestUrl: '#',
        template: 'Letter of Intent',
        status: 'Active',
        dateModified: '03-01-2026',
        modifiedBy: 'John Snow',
        dateCreated: '03-01-2026',
        createdBy: 'John Snow'
    },
    {
        id: '3',
        documentName: 'Acceptance Letter',
        documentUrl: '#',
        request: 'REQ-001',
        requestUrl: '#',
        template: 'Acceptance Letter',
        status: 'Draft',
        dateModified: '03-01-2026',
        modifiedBy: 'John Hopkins',
        dateCreated: '03-01-2026',
        createdBy: 'John Hopkins'
    }
];

const MOCK_DOCUMENT_TEMPLATES: DocumentTemplate[] = [
    {
        id: '1',
        templateName: 'Fellowship Grant Agreement',
        templateUrl: '#',
        category: 'Contract',
        status: 'Active',
        dateModified: '03-01-2026',
        modifiedBy: 'John Hopkins',
        dateCreated: '03-01-2026',
        createdBy: 'John Hopkins'
    },
    {
        id: '2',
        templateName: 'Acceptance Letter',
        templateUrl: '#',
        category: 'Correspondence',
        status: 'Active',
        dateModified: '03-01-2026',
        modifiedBy: 'John Hopkins',
        dateCreated: '03-01-2026',
        createdBy: 'John Hopkins'
    },
    {
        id: '3',
        templateName: 'Letter of Intent',
        templateUrl: '#',
        category: 'Letter of Intent',
        status: 'Active',
        dateModified: '03-01-2026',
        modifiedBy: 'John Snow',
        dateCreated: '03-01-2026',
        createdBy: 'John Snow'
    }
];

export default class DocumentData extends LightningElement {
    activeTab = 'generated';
    generatedDocColumns = GENERATED_DOC_COLUMNS;
    templateColumns = TEMPLATE_COLUMNS;
    generatedDocuments = MOCK_GENERATED_DOCUMENTS;
    documentTemplates = MOCK_DOCUMENT_TEMPLATES;

    handleTabChange(event: CustomEvent): void {
        this.activeTab = event.target
            ? (event.target as HTMLElement & { value: string }).value
            : 'generated';
    }

    handleRowAction(event: RowActionEvent): void {
        const { action, row } = event.detail;
        if (action.name === 'view') {
            this.dispatchEvent(
                new CustomEvent('viewrecord', {
                    detail: { recordId: row.id }
                })
            );
        }
    }
}
