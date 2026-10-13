import { LightningElement, api } from "lwc";
import LOCALE from "@salesforce/i18n/locale";

/*
 * Full-screen Replace User flow: Assign users → Resolve activities → Review,
 * then a processing state and a completion summary.
 *
 * The flow only collects decisions. The parent performs the replacement when
 * it receives `initiate`, sets `processing` while it works and `batchId` when
 * it is done, which switches the flow to its completion view.
 */

// Incoming events
// From c-request-user-role-explorer-edit-cell (pencil button inside a datatable cell).
/** The single-row editor popover currently open over a cell. */
const STEP_LABELS = {
  assign: "Assign users",
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
  @api users = [];

  /** True while the parent is applying the replacement ("Replacing Records"). */
  @api processing = false;

  /** Set by the parent once the replacement is done; switches to the completion view. */
  @api batchId = "";

  /** ISO date the replacement took effect; shown as the new roles' start date. */
  @api effectiveDate = "";

  @api
  get roles() {
    return this.flowRoles;
  }
  set roles(value) {
    this.flowRoles = value ?? [];
    // Every role starts selected so one "Assign" covers the common case.
    this.selectedRoleIds = this.flowRoles.map((role) => role.id);
  }

  @api activities = [];

  flowRoles = [];
  step = "assign";
  selectedRoleIds = [];
  selectedActivityIds = [];
  replaceWith = {};
  activityActions = {};
  bulkUser = "";
  bulkAction = "";
  editor = null;
  activitySelectionInitialized = false;

  // --------------------------------------------------------------- state

  get isComplete() {
    return Boolean(this.batchId);
  }

  get pendingActivities() {
    const roleIds = new Set(this.flowRoles.map((role) => role.id));
    return this.activities.filter((activity) => roleIds.has(activity.roleId));
  }

  get hasActivities() {
    return this.pendingActivities.length > 0;
  }

  get stepKeys() {
    return this.hasActivities
      ? ["assign", "activities", "review"]
      : ["assign", "review"];
  }

  get isAssignStep() {
    return !this.isComplete && this.step === "assign";
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

  get showStepper() {
    return !this.isComplete;
  }

  get showBackButton() {
    return !this.isComplete && this.step !== "assign";
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

  // -------------------------------------------------------- assign users

  get replacementOptions() {
    return this.replacementUsers.map((user) => ({ label: user, value: user }));
  }

  get replacementUsers() {
    return this.users.filter((user) => user !== this.currentUser);
  }

  get selectedRoleCount() {
    return this.selectedRoleIds.length;
  }

  get selectedRoleLabel() {
    return `${this.selectedRoleCount} selected`;
  }

  get isAssignDisabled() {
    return !this.bulkUser || this.selectedRoleCount === 0;
  }

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
        type: "editCell",
        initialWidth: WIDE_COLUMN,
        typeAttributes: {
          placeholder: this.isAssignStep ? "Select User" : "",
          label: "Replace With",
          fieldKey: "replaceWith",
          editable: this.isAssignStep,
          rowKey: { fieldName: "id" }
        }
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
        replaceWith: this.replaceWith[role.id] ?? "",
        effectiveStartDateLabel: effectiveStart,
        ...note
      };
    });
  }

  get isAssignNextDisabled() {
    return this.flowRoles.some((role) => !this.replaceWith[role.id]);
  }

  get assignNextLabel() {
    return this.hasActivities ? "Next: Resolve Activities" : "Next: Review";
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
        replacingUser:
          action === "assign" ? (this.replaceWith[activity.roleId] ?? "") : "",
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

  handleRoleSelection(event) {
    this.selectedRoleIds = event.detail.selectedRows.map((row) => row.id);
  }

  handleActivitySelection(event) {
    this.selectedActivityIds = event.detail.selectedRows.map((row) => row.id);
  }

  handleBulkUserChange(event) {
    this.bulkUser = event.detail.value;
  }

  handleAssign() {
    if (this.isAssignDisabled) {
      return;
    }
    const updates = Object.fromEntries(
      this.selectedRoleIds.map((id) => [id, this.bulkUser])
    );
    this.replaceWith = { ...this.replaceWith, ...updates };
  }

  handleClearRoleSelection() {
    this.selectedRoleIds = [];
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

  /** Pencil in a Replace With / Action cell: open the editor popover over that cell. */
  handleCellEdit(event) {
    event.stopPropagation();
    const { rowKey, fieldKey, top, left, width } = event.detail;
    const isUser = fieldKey === "replaceWith";
    const role = this.flowRoles.find((item) => item.id === rowKey);
    this.editor = {
      rowKey,
      fieldKey,
      label: isUser ? `Replace With for ${role?.roleName ?? "role"}` : "Action",
      placeholder: isUser ? "Select User..." : "Select Action...",
      value: isUser
        ? (this.replaceWith[rowKey] ?? "")
        : (this.activityActions[rowKey] ?? ""),
      options: isUser ? this.replacementOptions : ACTION_OPTIONS,
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
    if (editor.fieldKey === "replaceWith") {
      this.replaceWith = { ...this.replaceWith, [editor.rowKey]: value };
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

  handleNextFromAssign() {
    if (this.isAssignNextDisabled) {
      return;
    }
    if (this.hasActivities && !this.activitySelectionInitialized) {
      // Like the roles step, every activity starts selected so one "Apply" covers the common case.
      this.selectedActivityIds = this.pendingActivities.map(
        (activity) => activity.id
      );
      this.activitySelectionInitialized = true;
    }
    this.step = this.hasActivities ? "activities" : "review";
  }

  handleNextFromActivities() {
    if (this.isActivitiesNextDisabled) {
      return;
    }
    this.step = "review";
  }

  handleBack() {
    const index = this.stepKeys.indexOf(this.step);
    this.step = this.stepKeys[Math.max(0, index - 1)];
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
            newUser: this.replaceWith[role.id]
          })),
          activityActions: this.pendingActivities.map((activity) => ({
            activityId: activity.id,
            action: this.activityActions[activity.id],
            newUser: this.replaceWith[activity.roleId]
          }))
        }
      })
    );
  }
}
