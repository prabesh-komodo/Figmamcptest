import { LightningElement, api } from "lwc";
import LOCALE from "@salesforce/i18n/locale";

/*
 * Full-screen De-activate Role(s) flow: Resolve activities (only when the
 * outgoing user holds open activities) → Review, then a processing state and
 * a completion summary.
 *
 * The flow only collects decisions. The parent de-activates the roles when it
 * receives `initiate`, sets `processing` while it works and `batchId` when it
 * is done, which switches the flow to its completion view.
 */

// Incoming events
// From c-request-user-role-explorer-edit-cell (pencil button inside a datatable cell).
/** The single-row editor popover currently open over a cell. */
const STEP_LABELS = {
  activities: "Resolve activities",
  review: "Review"
};

const ACTION_LABELS = {
  assign: "Assign to New User",
  none: "Do Nothing"
};

const ACTION_OPTIONS = Object.keys(ACTION_LABELS).map((value) => ({
  label: ACTION_LABELS[value],
  value
}));

// The editor popover overlaps the cell's padding so it lines up with the cell edges.
const EDITOR_INSET = 8;

const NO_VALUE = "—";
const DO_NOTHING_NOTE =
  "User may lose access to complete this task. Reassign later if needed.";
const WILL_DEACTIVATE_NOTE = "Will de-activate";
const DEACTIVATED_NOTE = "De-activated";
const REASSIGNED_NOTE = "Reassigned";

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

// Column widths (px) from the De-activate design; the last column takes the remaining width.
const WIDE_COLUMN = 224;
const ACTIVITY_COLUMN = 240;
const REQUEST_COLUMN = 115;
const USER_COLUMN = 163;
const ACTION_COLUMN = 160;

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

export default class RequestUserRoleDeactivateFlow extends LightningElement {
  @api currentUser = "";
  @api reason = "";
  @api note = "";
  @api users = [];
  @api roles = [];

  /** True while the parent is de-activating the roles ("De-activating Role(s)"). */
  @api processing = false;

  /** Set by the parent once the de-activation is done; switches to the completion view. */
  @api batchId = "";

  /** ISO date the roles were ended on; shown as their effective end date. */
  @api effectiveDate = "";

  @api
  get activities() {
    return this.flowActivities;
  }
  set activities(value) {
    this.flowActivities = value ?? [];
    // Every activity starts selected so one "Apply" covers the common case.
    this.selectedActivityIds = this.flowActivities.map(
      (activity) => activity.id
    );
    this.step = this.flowActivities.length > 0 ? "activities" : "review";
  }

  flowActivities = [];
  step = "review";
  selectedActivityIds = [];
  activityActions = {};
  assignTo = {};
  bulkAction = "";
  bulkUser = "";
  editor = null;

  // --------------------------------------------------------------- state

  get isComplete() {
    return Boolean(this.batchId);
  }

  get hasActivities() {
    return this.flowActivities.length > 0;
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

  /** Review and completion both show the read-only Roles + Open activities summary. */
  get isSummary() {
    return this.isComplete || this.step === "review";
  }

  /** Without open activities there is only one step, so the design drops the stepper. */
  get showStepper() {
    return !this.isComplete && this.hasActivities;
  }

  get scopeLabel() {
    return scopeSummary(this.roles);
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

  get rolesTitle() {
    const count = this.roles.length;
    return `Roles · ${count} ${count === 1 ? "record" : "records"}`;
  }

  get activitiesTitle() {
    const count = this.flowActivities.length;
    return `Activities · ${count} ${count === 1 ? "record" : "records"}`;
  }

  get completionMessage() {
    const roles = this.roles.length;
    const activities = this.flowActivities.length;
    const resolved =
      activities > 0
        ? `, ${activities} ${activities === 1 ? "activity" : "activities"} resolved`
        : "";
    return `De-activation completed · ${roles} role ${roles === 1 ? "record" : "records"} de-activated${resolved}.`;
  }

  // ------------------------------------------------------------- roles

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
      }
    ];
    if (this.isComplete) {
      columns.push({
        label: "Effective End Date",
        fieldName: "effectiveEndDateLabel",
        initialWidth: WIDE_COLUMN
      });
    }
    columns.push({
      label: this.isComplete ? "Outcome" : "Status",
      fieldName: "note",
      type: "note",
      typeAttributes: NOTE_TYPE_ATTRIBUTES
    });
    return columns;
  }

  get roleRows() {
    const effectiveEnd = this.effectiveDate
      ? dateFormatter.format(new Date(`${this.effectiveDate}T00:00:00Z`))
      : NO_VALUE;
    const note = this.isComplete ? DEACTIVATED_NOTE : WILL_DEACTIVATE_NOTE;
    return this.roles.map((role) => ({
      ...role,
      effectiveEndDateLabel: effectiveEnd,
      note,
      ...SUCCESS_NOTE
    }));
  }

  // ---------------------------------------------------- open activities

  /** Anyone except the outgoing user can take over an activity. */
  get assignUsers() {
    return this.users.filter((user) => user !== this.currentUser);
  }

  get assignOptions() {
    return this.assignUsers.map((user) => ({ label: user, value: user }));
  }

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
        label: this.isComplete ? "Previous Owner" : "Current Owner",
        fieldName: "assignedUser",
        initialWidth: USER_COLUMN
      },
      {
        label: "Action",
        fieldName: "actionLabel",
        type: "editCell",
        initialWidth: ACTION_COLUMN,
        typeAttributes: {
          placeholder: editable ? "Select Action..." : "",
          label: "Action",
          fieldKey: "action",
          editable,
          rowKey: { fieldName: "id" }
        }
      },
      {
        label: this.isComplete ? "Assigned To" : "Assign To",
        fieldName: "assignToLabel",
        type: "editCell",
        initialWidth: WIDE_COLUMN,
        typeAttributes: {
          placeholder: { fieldName: "assignToPlaceholder" },
          label: "Assign To",
          fieldKey: "assignTo",
          editable: { fieldName: "assignToEditable" },
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
    const editable = this.isActivitiesStep;
    return this.flowActivities.map((activity) => {
      const action = this.activityActions[activity.id];
      const newUser = this.assignTo[activity.id] ?? "";
      const isAssign = action === "assign";
      // "Do Nothing" leaves the activity with the outgoing user; the summary names them as its owner.
      let assignToLabel = isAssign ? newUser : NO_VALUE;
      if (this.isComplete && action === "none") {
        assignToLabel = activity.assignedUser;
      }
      return {
        ...activity,
        actionLabel: action ? ACTION_LABELS[action] : "",
        assignToLabel,
        assignToPlaceholder: "Select User",
        assignToEditable: editable && isAssign,
        ...this.activityNote(activity, action)
      };
    });
  }

  activityNote(activity, action) {
    if (action === "none") {
      const message = this.isComplete
        ? `Left with ${activity.assignedUser}, who may lose access`
        : DO_NOTHING_NOTE;
      return { note: message, ...WARNING_NOTE };
    }
    if (action === "assign" && this.isComplete) {
      return { note: REASSIGNED_NOTE, ...SUCCESS_NOTE };
    }
    return { note: "", ...PLAIN_NOTE };
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

  get isBulkAssign() {
    return this.bulkAction === "assign";
  }

  get isApplyDisabled() {
    return (
      !this.bulkAction ||
      !this.hasActivitySelection ||
      (this.isBulkAssign && !this.bulkUser)
    );
  }

  /** Every activity needs an action, and "Assign to New User" needs the user. */
  get isActivitiesNextDisabled() {
    return this.flowActivities.some((activity) => {
      const action = this.activityActions[activity.id];
      return !action || (action === "assign" && !this.assignTo[activity.id]);
    });
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

  handleBulkUserChange(event) {
    this.bulkUser = event.detail.value;
  }

  handleApplyAction() {
    if (this.isApplyDisabled) {
      return;
    }
    const action = this.bulkAction;
    const ids = this.selectedActivityIds;
    this.activityActions = {
      ...this.activityActions,
      ...Object.fromEntries(ids.map((id) => [id, action]))
    };
    if (action === "assign") {
      this.assignTo = {
        ...this.assignTo,
        ...Object.fromEntries(ids.map((id) => [id, this.bulkUser]))
      };
    }
  }

  handleClearActivitySelection() {
    this.selectedActivityIds = [];
  }

  // -------------------------------------------------- single-row editor

  /** Pencil in an Action / Assign To cell: open the editor popover over that cell. */
  handleCellEdit(event) {
    event.stopPropagation();
    const { rowKey, fieldKey, top, left, width } = event.detail;
    const isUser = fieldKey === "assignTo";
    const activity = this.flowActivities.find((item) => item.id === rowKey);
    this.editor = {
      rowKey,
      fieldKey,
      label: isUser
        ? `Assign ${activity?.activityName ?? "activity"} to`
        : "Action",
      placeholder: isUser ? "Select User..." : "Select Action...",
      value: isUser
        ? (this.assignTo[rowKey] ?? "")
        : (this.activityActions[rowKey] ?? ""),
      options: isUser ? this.assignOptions : ACTION_OPTIONS,
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
    const value = event.detail.value;
    if (editor.fieldKey === "assignTo") {
      this.assignTo = { ...this.assignTo, [editor.rowKey]: value };
    } else {
      this.activityActions = {
        ...this.activityActions,
        [editor.rowKey]: value
      };
    }
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
    const record = [...this.roles, ...this.flowActivities].find(
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
          roleIds: this.roles.map((role) => role.id),
          activityActions: this.flowActivities.map((activity) => ({
            activityId: activity.id,
            action: this.activityActions[activity.id],
            newUser:
              this.activityActions[activity.id] === "assign"
                ? this.assignTo[activity.id]
                : ""
          }))
        }
      })
    );
  }
}
