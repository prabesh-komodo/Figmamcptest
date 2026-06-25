import { LightningElement } from "lwc";

const GENERATED_DOC_COLUMNS = [
  {
    label: "Document",
    fieldName: "documentUrl",
    type: "url",
    sortable: true,
    typeAttributes: { label: { fieldName: "documentName" }, target: "_blank" }
  },
  {
    label: "Request",
    fieldName: "requestUrl",
    type: "url",
    sortable: true,
    typeAttributes: { label: { fieldName: "request" }, target: "_blank" }
  },
  { label: "Template", fieldName: "template", type: "text", sortable: true },
  { label: "Status", fieldName: "status", type: "text", sortable: true },
  {
    label: "Date Modified",
    fieldName: "dateModified",
    type: "text",
    sortable: true
  },
  {
    label: "Modified By",
    fieldName: "modifiedBy",
    type: "text",
    sortable: true
  },
  {
    label: "Date Created",
    fieldName: "dateCreated",
    type: "text",
    sortable: true
  },
  { label: "Created By", fieldName: "createdBy", type: "text", sortable: true }
];

const TEMPLATE_COLUMNS = [
  {
    label: "Template Name",
    fieldName: "templateUrl",
    type: "url",
    sortable: true,
    typeAttributes: { label: { fieldName: "templateName" }, target: "_blank" }
  },
  { label: "Category", fieldName: "category", type: "text", sortable: true },
  { label: "Status", fieldName: "status", type: "text", sortable: true },
  {
    label: "Date Modified",
    fieldName: "dateModified",
    type: "text",
    sortable: true
  },
  {
    label: "Modified By",
    fieldName: "modifiedBy",
    type: "text",
    sortable: true
  },
  {
    label: "Date Created",
    fieldName: "dateCreated",
    type: "text",
    sortable: true
  },
  { label: "Created By", fieldName: "createdBy", type: "text", sortable: true }
];

const MOCK_GENERATED_DOCUMENTS = [
  {
    id: "1",
    documentName: "Fellowship Grant Agreement",
    documentUrl: "#",
    request: "REQ-003",
    requestUrl: "#",
    template: "Fellowship Grant Agreement",
    status: "Draft",
    dateModified: "03-01-2026",
    modifiedBy: "John Hopkins",
    dateCreated: "03-01-2026",
    createdBy: "John Hopkins"
  },
  {
    id: "2",
    documentName: "Letter of Intent",
    documentUrl: "#",
    request: "REQ-002",
    requestUrl: "#",
    template: "Letter of Intent",
    status: "Active",
    dateModified: "03-01-2026",
    modifiedBy: "John Snow",
    dateCreated: "03-01-2026",
    createdBy: "John Snow"
  },
  {
    id: "3",
    documentName: "Acceptance Letter",
    documentUrl: "#",
    request: "REQ-001",
    requestUrl: "#",
    template: "Acceptance Letter",
    status: "Draft",
    dateModified: "03-01-2026",
    modifiedBy: "John Hopkins",
    dateCreated: "03-01-2026",
    createdBy: "John Hopkins"
  }
];

const MOCK_DOCUMENT_TEMPLATES = [
  {
    id: "1",
    templateName: "Fellowship Grant Agreement",
    templateUrl: "#",
    category: "Contract",
    status: "Active",
    dateModified: "03-01-2026",
    modifiedBy: "John Hopkins",
    dateCreated: "03-01-2026",
    createdBy: "John Hopkins"
  },
  {
    id: "2",
    templateName: "Acceptance Letter",
    templateUrl: "#",
    category: "Correspondence",
    status: "Active",
    dateModified: "03-01-2026",
    modifiedBy: "John Hopkins",
    dateCreated: "03-01-2026",
    createdBy: "John Hopkins"
  },
  {
    id: "3",
    templateName: "Letter of Intent",
    templateUrl: "#",
    category: "Letter of Intent",
    status: "Active",
    dateModified: "03-01-2026",
    modifiedBy: "John Snow",
    dateCreated: "03-01-2026",
    createdBy: "John Snow"
  }
];

export default class DocumentData extends LightningElement {
  activeTab = "generated";
  generatedDocColumns = GENERATED_DOC_COLUMNS;
  templateColumns = TEMPLATE_COLUMNS;
  generatedDocuments = MOCK_GENERATED_DOCUMENTS;
  documentTemplates = MOCK_DOCUMENT_TEMPLATES;

  handleTabChange(event) {
    this.activeTab = event.target ? event.target.value : "generated";
  }

  handleRowAction(event) {
    const { action, row } = event.detail;
    if (action.name === "view") {
      this.dispatchEvent(
        new CustomEvent("viewrecord", {
          detail: { recordId: row.id }
        })
      );
    }
  }
}
