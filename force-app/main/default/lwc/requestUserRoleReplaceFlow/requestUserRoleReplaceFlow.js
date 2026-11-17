import { LightningElement, api } from "lwc";
import LOCALE from "@salesforce/i18n/locale";

/*
 * Full-screen Replace User flow: Resolve activities (only when the roles have
 * open activities) → Review, then a processing state and a completion summary.
 * The replacing user is picked in the reason popup that opens the flow.
 *
 * The flow only collects decisions. The parent performs the replacement when
 * it receives `initiate`, sets `processing` while it works and `batchId` when
 * it is done, which switches the flow to its completion view.
 */

// Incoming events
// From c-request-user-role-explorer-edit-cell (pencil button inside a datatable cell).
/** The single-row editor popover currently open over a cell. */
const STEP_LABELS = {
  activities: "Resolve activities",
  review: "Review"
};

const ACTION_LABELS = {
  assign: "Assign to Replacing User",
  none: "Do Nothing"
};

const ACTION_OPTIONS = Object.keys(ACTION_LABELS).map((value) => ({
  label: ACTION_LABELS[value],
  value
}));

// The editor popover overlaps the cell's padding so it lines up with the cell edges.
const EDITOR_INSET = 8;

const PENDING_ACTIVITIES_NOTE = "Pending Activities";
const DO_NOTHING_NOTE =
  "User may lose access to complete this task. Reassign later if needed.";
const REPLACED_NOTE = "Replaced";
const RESOLVED_NOTE = "Resolved";
const EMPTY_VALUE = "-";

const WARNING_NOTE = {
  noteIcon: "utility:warning",
  noteIconVariant: "warning",
  noteTextClass: "note-text_warning"
};
const SUCCESS_NOTE = {
  noteIcon: "utility:success",
  noteIconVariant: "success",
  noteTextClass: "note-text_success"
};
const PLAIN_NOTE = { noteIcon: "", noteIconVariant: "", noteTextClass: "" };

const NOTE_TYPE_ATTRIBUTES = {
  iconName: { fieldName: "noteIcon" },
  iconVariant: { fieldName: "noteIconVariant" },
  textClass: { fieldName: "noteTextClass" }
};

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC"
});

// Column widths (px) from the Bulk Flow design; Notes takes the remaining width.
const WIDE_COLUMN = 212;
const ACTIVITY_COLUMN = 247;
const REQUEST_COLUMN = 115;
const USER_COLUMN = 160;

function linkColumn(label, fieldName, actionName, initialWidth) {
  return {
    label,
    fieldName,
    type: "link",
    initialWidth,
    typeAttributes: { actionName, rowKey: { fieldName: "id" } }
  };
}

function scopeSummary(roles) {
  const requests = new Set(roles.map((role) => role.requestId)).size;
  const roleTypes = new Set(roles.map((role) => role.roleType)).size;
  return `${requests} distinct request(s) · ${roleTypes} role type(s) · ${roles.length} record(s)`;
}

export default class RequestUserRoleReplaceFlow extends LightningElement {
  @api currentUser = "";
  @api reason = "";
  @api note = "";

  /** Who takes over every role; chosen in the reason popup. */
  @api replacementUser = "";

  /** True while the parent is applying the replacement ("Replacing Records"). */
  @api processing = false;

  /** Set by the parent once the replacement is done; switches to the completion view. */
  @api batchId = "";

  /** ISO date the replacement took effect; shown as the new roles' start date. */
  @api effectiveDate = "";

  @api roles = [];
  @api activities = [];

  step = "review";
  selectedActivityIds = [];
  activityActions = {};
  bulkAction = "";
  editor = null;

  connectedCallback() {
    // Like De-activate, every activity starts selected so one "Apply" covers the common case.
    this.selectedActivityIds = this.pendingActivities.map(
      (activity) => activity.id
    );
    this.step = this.hasActivities ? "activities" : "review";
  }

  // --------------------------------------------------------------- state

  get isComplete() {
    return Boolean(this.batchId);
  }

  get flowRoles() {
    return this.roles ?? [];
  }

  get pendingActivities() {
    const roleIds = new Set(this.flowRoles.map((role) => role.id));
    return this.activities.filter((activity) => roleIds.has(activity.roleId));
  }

  get hasActivities() {
    return this.pendingActivities.length > 0;
  }

  get stepKeys() {
    return this.hasActivities ? ["activities", "review"] : ["review"];
  }

  get isActivitiesStep() {
    return !this.isComplete && this.step === "activities";
  }

  get isReviewStep() {
    return !this.isComplete && this.step === "review";
  }

  /** Review and completion both show the read-only Roles + Activities summary. */
  get isSummary() {
    return this.isComplete || this.step === "review";
  }

  /** Without open activities there is only one step, so the stepper is dropped. */
  get showStepper() {
    return !this.isComplete && this.hasActivities;
  }

  get scopeLabel() {
    return scopeSummary(this.flowRoles);
  }

  get steps() {
    const currentIndex = this.stepKeys.indexOf(this.step);
    return this.stepKeys.map((key, index) => {
      const state =
        index < currentIndex
          ? "completed"
          : index === currentIndex
            ? "active"
            : "upcoming";
      return {
        key,
        label: STEP_LABELS[key],
        marker: state === "completed" ? "✓" : String(index + 1),
        markerClass: `slds-grid slds-grid_align-center slds-grid_vertical-align-center slds-shrink-none stepper__marker stepper__marker_${state}`,
        labelClass: `slds-m-left_xx-small stepper__label stepper__label_${state}`,
        ariaCurrent: state === "active" ? "step" : null,
        assistiveText: state === "completed" ? " (completed)" : "",
        showConnector: index > 0
      };
    });
  }

  // ----------------------------------------------------------------- roles

  get rolesWithActivities() {
    return new Set(this.pendingActivities.map((activity) => activity.roleId));
  }

  get roleColumns() {
    const columns = [
      { label: "Role Name", fieldName: "roleName", initialWidth: WIDE_COLUMN },
      { label: "Role Type", fieldName: "roleType", initialWidth: WIDE_COLUMN },
      linkColumn("Request", "requestId", "view_request", REQUEST_COLUMN),
      linkColumn("Program Name", "programName", "view_program", WIDE_COLUMN),
      {
        label: "Current User",
        fieldName: "assignedUser",
        initialWidth: WIDE_COLUMN
      },
      {
        label: "Replace With",
        fieldName: "replaceWith",
        initialWidth: WIDE_COLUMN
      }
    ];
    if (this.isComplete) {
      columns.push({
        label: "Effective Start Date",
        fieldName: "effectiveStartDateLabel",
        initialWidth: WIDE_COLUMN
      });
    }
    columns.push({
      label: this.isComplete ? "Outcome" : "Notes",
      fieldName: "note",
      type: "note",
      typeAttributes: NOTE_TYPE_ATTRIBUTES
    });
    return columns;
  }

  get roleRows() {
    const withActivities = this.rolesWithActivities;
    const effectiveStart = this.effectiveDate
      ? dateFormatter.format(new Date(`${this.effectiveDate}T00:00:00Z`))
      : EMPTY_VALUE;
    return this.flowRoles.map((role) => {
      let note = { note: "", ...PLAIN_NOTE };
      if (this.isComplete) {
        note = { note: REPLACED_NOTE, ...SUCCESS_NOTE };
      } else if (withActivities.has(role.id)) {
        note = { note: PENDING_ACTIVITIES_NOTE, ...WARNING_NOTE };
      }
      return {
        ...role,
        replaceWith: this.replacementUser,
        effectiveStartDateLabel: effectiveStart,
        ...note
      };
    });
  }

  // ---------------------------------------------------- resolve activities

  get activityColumns() {
    const editable = this.isActivitiesStep;
    return [
      {
        label: "Activity",
        fieldName: "activityName",
        initialWidth: ACTIVITY_COLUMN
      },
      linkColumn("Request", "requestId", "view_request", REQUEST_COLUMN),
      linkColumn(
        "Program Name",
        "programName",
        "view_program",
        ACTIVITY_COLUMN
      ),
      {
        label: "Current User",
        fieldName: "assignedUser",
        initialWidth: USER_COLUMN
      },
      {
        label: "Replacing User",
        fieldName: "replacingUser",
        initialWidth: USER_COLUMN
      },
      {
        label: "Action",
        fieldName: "actionLabel",
        type: "editCell",
        initialWidth: ACTIVITY_COLUMN,
        typeAttributes: {
          placeholder: editable ? "Select Action" : "",
          label: "Action",
          fieldKey: "action",
          editable,
          rowKey: { fieldName: "id" }
        }
      },
      {
        label: this.isComplete ? "Outcome" : "Notes",
        fieldName: "note",
        type: "note",
        typeAttributes: NOTE_TYPE_ATTRIBUTES
      }
    ];
  }

  get activityRows() {
    return this.pendingActivities.map((activity) => {
      const action = this.activityActions[activity.id];
      return {
        ...activity,
        // Only an activity being handed over has a replacing user; "Do Nothing" stays with the current user.
        replacingUser: action === "assign" ? this.replacementUser : "",
        actionLabel: action ? ACTION_LABELS[action] : "",
        ...this.activityNote(activity, action)
      };
    });
  }

  /**
   * "Do Nothing" warns that the user may lose access; once the replacement is
   * done it says who the activity was left with. Reassigned activities are resolved.
   */
  activityNote(activity, action) {
    if (!action) {
      return { note: "", ...PLAIN_NOTE };
    }
    if (this.isComplete) {
      return action === "none"
        ? {
            note: `Left with ${activity.assignedUser}, who may lose access`,
            ...WARNING_NOTE
          }
        : { note: RESOLVED_NOTE, ...SUCCESS_NOTE };
    }
    return action === "none"
      ? { note: DO_NOTHING_NOTE, ...WARNING_NOTE }
      : { note: EMPTY_VALUE, ...PLAIN_NOTE };
  }

  get rolesTitle() {
    return `Roles · ${this.flowRoles.length} ${this.flowRoles.length === 1 ? "record" : "records"}`;
  }

  get activitiesTitle() {
    const count = this.pendingActivities.length;
    return `Activities · ${count} ${count === 1 ? "record" : "records"}`;
  }

  get actionLabels() {
    return ACTION_OPTIONS.map((option) => option.label);
  }

  get bulkActionLabel() {
    return this.bulkAction ? ACTION_LABELS[this.bulkAction] : "";
  }

  get hasActivitySelection() {
    return this.selectedActivityIds.length > 0;
  }

  get activityBarClass() {
    const base =
      "slds-grid slds-grid_vertical-align-center slds-border_bottom slds-p-horizontal_small selection-bar";
    return this.hasActivitySelection ? `${base} selection-bar_active` : base;
  }

  get selectedActivityLabel() {
    return `${this.selectedActivityIds.length} selected`;
  }

  get isApplyDisabled() {
    return !this.bulkAction || this.selectedActivityIds.length === 0;
  }

  get isActivitiesNextDisabled() {
    return this.pendingActivities.some(
      (activity) => !this.activityActions[activity.id]
    );
  }

  // ------------------------------------------------------------- handlers

  handleActivitySelection(event) {
    this.selectedActivityIds = event.detail.selectedRows.map((row) => row.id);
  }

  /** The selection bar's picklist works with labels; map back to the action key. */
  handleBulkActionChange(event) {
    const option = ACTION_OPTIONS.find(
      (item) => item.label === event.detail.value
    );
    this.bulkAction = option?.value ?? "";
  }

  handleApplyAction() {
    if (this.isApplyDisabled) {
      return;
    }
    const action = this.bulkAction;
    const updates = Object.fromEntries(
      this.selectedActivityIds.map((id) => [id, action])
    );
    this.activityActions = { ...this.activityActions, ...updates };
  }

  handleClearActivitySelection() {
    this.selectedActivityIds = [];
  }

  // -------------------------------------------------- single-row editor

  /** Pencil in an Action cell: open the editor popover over that cell. */
  handleCellEdit(event) {
    event.stopPropagation();
    const { rowKey, fieldKey, top, left, width } = event.detail;
    this.editor = {
      rowKey,
      fieldKey,
      label: "Action",
      placeholder: "Select Action...",
      value: this.activityActions[rowKey] ?? "",
      options: ACTION_OPTIONS,
      top: top - EDITOR_INSET / 2,
      left: left - EDITOR_INSET,
      width: width + EDITOR_INSET * 2
    };
  }

  renderedCallback() {
    const popover = this.template.querySelector(".cell-editor");
    if (
      !popover ||
      !this.editor ||
      popover.dataset.positioned === this.editor.rowKey + this.editor.fieldKey
    ) {
      return;
    }
    // custom: no SLDS equivalent — the popover is fixed over the edited cell, so its
    // position comes from the cell's viewport rectangle at click time.
    popover.style.setProperty("--c-editor-top", `${this.editor.top}px`);
    popover.style.setProperty("--c-editor-left", `${this.editor.left}px`);
    popover.style.setProperty("--c-editor-width", `${this.editor.width}px`);
    popover.dataset.positioned = this.editor.rowKey + this.editor.fieldKey;
    const combobox = popover.querySelector("lightning-combobox");
    combobox?.focus();
  }

  handleEditorChange(event) {
    const editor = this.editor;
    if (!editor) {
      return;
    }
    this.activityActions = {
      ...this.activityActions,
      [editor.rowKey]: event.detail.value
    };
    this.editor = null;
  }

  handleEditorDismiss() {
    this.editor = null;
  }

  handleEditorKeyDown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      this.editor = null;
    }
  }

  handleLinkCellClick(event) {
    event.stopPropagation();
    const { actionName, rowKey } = event.detail;
    const record = [...this.flowRoles, ...this.pendingActivities].find(
      (item) => item.id === rowKey
    );
    if (!record) {
      return;
    }
    if (actionName === "view_request") {
      this.dispatchEvent(
        new CustomEvent("requestselect", {
          detail: { recordId: record.id, requestId: record.requestId }
        })
      );
    } else if (actionName === "view_program") {
      this.dispatchEvent(
        new CustomEvent("programselect", {
          detail: { recordId: record.id, programName: record.programName }
        })
      );
    }
  }

  handleNextFromActivities() {
    if (this.isActivitiesNextDisabled) {
      return;
    }
    this.step = "review";
  }

  /** Back from the first step returns to the reason popup (the parent reopens it). */
  handleBack() {
    const index = this.stepKeys.indexOf(this.step);
    if (index > 0) {
      this.step = this.stepKeys[index - 1];
      return;
    }
    this.dispatchEvent(new CustomEvent("back"));
  }

  handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
  }

  handleDone() {
    this.dispatchEvent(new CustomEvent("done"));
  }

  handleInitiate() {
    if (this.processing) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("initiate", {
        detail: {
          reason: this.reason,
          note: this.note,
          replacements: this.flowRoles.map((role) => ({
            roleId: role.id,
            newUser: this.replacementUser
          })),
          activityActions: this.pendingActivities.map((activity) => ({
            activityId: activity.id,
            action: this.activityActions[activity.id],
            newUser: this.replacementUser
          }))
        }
      })
    );
  }
}
