import { LightningElement, api } from "lwc";

/*
 * Full-screen Add Role flow. The role and users are picked in the Add Role
 * popup (step 1), so this page is the Review step, then a processing state and
 * a completion summary.
 *
 * The parent works out which request × user pairs get a new role and which
 * reactivate a role the user held there before (`entries`), applies them when
 * it receives `initiate`, sets `processing` while it works and `batchId` when
 * it is done, which switches the flow to its completion view.
 */

/** `reactivate` when the user already has a de-activated record of this role on the request. */
/** One request × user pair. */
const SUCCESS_NOTE = {
  noteIcon: "utility:success",
  noteIconVariant: "success",
  noteTextClass: "note-text_success"
};

const NOTE_TYPE_ATTRIBUTES = {
  iconName: { fieldName: "noteIcon" },
  iconVariant: { fieldName: "noteIconVariant" },
  textClass: { fieldName: "noteTextClass" }
};

// Column widths (px) from the Add Role design; the last column takes the remaining width.
const WIDE_COLUMN = 276;
const PROGRAM_TYPE_COLUMN = 115;

function recordCount(count) {
  return `${count} ${count === 1 ? "record" : "records"}`;
}

function linkColumn(label, fieldName, actionName) {
  return {
    label,
    fieldName,
    type: "link",
    initialWidth: WIDE_COLUMN,
    typeAttributes: { actionName, rowKey: { fieldName: "id" } }
  };
}

const STEPS = [
  {
    key: "roleUsers",
    label: "Role & users",
    marker: "✓",
    markerClass:
      "slds-grid slds-grid_align-center slds-grid_vertical-align-center slds-shrink-none stepper__marker stepper__marker_completed",
    labelClass: "slds-m-left_xx-small stepper__label stepper__label_completed",
    ariaCurrent: null,
    assistiveText: " (completed)",
    showConnector: false
  },
  {
    key: "review",
    label: "Review",
    marker: "2",
    markerClass:
      "slds-grid slds-grid_align-center slds-grid_vertical-align-center slds-shrink-none stepper__marker stepper__marker_active",
    labelClass: "slds-m-left_xx-small stepper__label stepper__label_active",
    ariaCurrent: "step",
    assistiveText: "",
    showConnector: true
  }
];

export default class RequestUserRoleAddRoleFlow extends LightningElement {
  @api role = "";
  @api users = [];

  /** e.g. "7 request(s) · 3 program(s) · 2 program type(s)" */
  @api scopeLabel = "";

  @api entries = [];

  /** True while the parent is creating the roles ("Adding Roles"). */
  @api processing = false;

  /** Set by the parent once the roles are created; switches to the completion view. */
  @api batchId = "";

  steps = STEPS;

  get isComplete() {
    return Boolean(this.batchId);
  }

  get isReviewStep() {
    return !this.isComplete;
  }

  get usersLabel() {
    return this.users.join(", ");
  }

  get createEntries() {
    return this.entries.filter((entry) => entry.action === "create");
  }

  get reactivateEntries() {
    return this.entries.filter((entry) => entry.action === "reactivate");
  }

  get hasCreates() {
    return this.createEntries.length > 0;
  }

  get hasReactivations() {
    return this.reactivateEntries.length > 0;
  }

  get hasEntries() {
    return this.entries.length > 0;
  }

  get hasNoEntries() {
    return !this.hasEntries;
  }

  get createTitle() {
    const records = recordCount(this.createEntries.length);
    return this.isComplete
      ? `Created · ${records}`
      : `Will create · ${records}`;
  }

  get reactivateTitle() {
    const records = recordCount(this.reactivateEntries.length);
    return this.isComplete
      ? `Reactivated · ${records}`
      : `Will be reactivated · ${records}`;
  }

  get initiateLabel() {
    return this.entries.length === 1 ? "Add Role" : "Add Roles";
  }

  get completionMessage() {
    return `Roles added · ${this.createEntries.length} created, ${this.reactivateEntries.length} reactivated.`;
  }

  get tableColumns() {
    return this.columns(this.isComplete ? "Outcome" : "Status");
  }

  columns(lastLabel) {
    return [
      linkColumn("Request ID", "requestId", "view_request"),
      linkColumn("Program Name", "programName", "view_program"),
      {
        label: "Program Type",
        fieldName: "programType",
        initialWidth: PROGRAM_TYPE_COLUMN
      },
      { label: "Role", fieldName: "role", initialWidth: WIDE_COLUMN },
      { label: "User", fieldName: "user", initialWidth: WIDE_COLUMN },
      {
        label: lastLabel,
        fieldName: "note",
        type: "note",
        typeAttributes: NOTE_TYPE_ATTRIBUTES
      }
    ];
  }

  get createRows() {
    const note = this.isComplete ? "Created" : "Will create";
    return this.createEntries.map((entry) => ({
      ...entry,
      note,
      ...SUCCESS_NOTE
    }));
  }

  get reactivateRows() {
    const note = this.isComplete ? "Reactivated" : "Will reactivate";
    return this.reactivateEntries.map((entry) => ({
      ...entry,
      note,
      ...SUCCESS_NOTE
    }));
  }

  get isInitiateDisabled() {
    return this.processing || !this.hasEntries;
  }

  // ------------------------------------------------------------- handlers

  handleLinkCellClick(event) {
    event.stopPropagation();
    const { actionName, rowKey } = event.detail;
    const entry = this.entries.find((item) => item.id === rowKey);
    if (!entry) {
      return;
    }
    if (actionName === "view_request") {
      this.dispatchEvent(
        new CustomEvent("requestselect", {
          detail: { recordId: entry.requestId, requestId: entry.requestId }
        })
      );
    } else if (actionName === "view_program") {
      this.dispatchEvent(
        new CustomEvent("programselect", {
          detail: { recordId: entry.requestId, programName: entry.programName }
        })
      );
    }
  }

  /** Back returns to the Add Role popup (the parent reopens it with the same picks). */
  handleBack() {
    this.dispatchEvent(new CustomEvent("back"));
  }

  handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
  }

  handleDone() {
    this.dispatchEvent(new CustomEvent("done"));
  }

  handleInitiate() {
    if (this.isInitiateDisabled) {
      return;
    }
    this.dispatchEvent(new CustomEvent("initiate"));
  }
}
