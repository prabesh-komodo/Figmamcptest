import { LightningElement, api } from "lwc";

/*
 * Full-screen Reverse Batch flow: Review (what will be reversed or skipped),
 * then a processing state and a completion summary. Reversals take effect on
 * the day they run.
 *
 * The parent works out the entries (`planReversal`), reverses the batch when
 * it receives `initiate`, sets `processing` while it works and
 * `reversalBatchId` when it is done, which switches the flow to its summary.
 */

/** One role change of the batch: what reversing it does, or why it can't be reversed. */
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

const NOTE_TYPE_ATTRIBUTES = {
  iconName: { fieldName: "noteIcon" },
  iconVariant: { fieldName: "noteIconVariant" },
  textClass: { fieldName: "noteTextClass" }
};

const NO_VALUE = "—";

// Column widths (px) from the Reverse Batch design; the last column takes the remaining width.
const WIDE_COLUMN = 220;
const REQUEST_COLUMN = 115;

function recordCount(count) {
  return `${count} ${count === 1 ? "record" : "records"}`;
}

function linkColumn(label, fieldName, actionName, initialWidth) {
  return {
    label,
    fieldName,
    type: "link",
    initialWidth,
    typeAttributes: { actionName, rowKey: { fieldName: "id" } }
  };
}

export default class RequestUserRoleReversalFlow extends LightningElement {
  @api batchId = "";
  /** e.g. "Bulk Replace" */
  @api operation = "";
  @api reason = "";
  @api note = "";
  @api entries = [];

  /** True while the parent is reversing the batch ("Reversing Batch"). */
  @api processing = false;

  /** Set by the parent once the reversal is done; switches to the summary. */
  @api reversalBatchId = "";

  get isComplete() {
    return Boolean(this.reversalBatchId);
  }

  get title() {
    return `Reverse Batch · ${this.batchId}`;
  }

  get breadcrumbLabel() {
    return `${this.batchId} · Reverse batch`;
  }

  get reverseEntries() {
    return this.entries.filter((entry) => !entry.skipReason);
  }

  get skipEntries() {
    return this.entries.filter((entry) => entry.skipReason);
  }

  get hasReversible() {
    return this.reverseEntries.length > 0;
  }

  get hasSkips() {
    return this.skipEntries.length > 0;
  }

  get scopeLabel() {
    const reversed = this.reverseEntries.length;
    const skipped = this.skipEntries.length;
    const verb = this.isComplete ? "reversed" : "will be reversed";
    return `${this.entries.length} record(s) · ${reversed} ${verb} · ${skipped} skipped`;
  }

  get reverseTitle() {
    const count = this.reverseEntries.length;
    return this.isComplete
      ? `Reversed · ${count}`
      : `Will reverse · ${recordCount(count)}`;
  }

  get skipTitle() {
    const count = this.skipEntries.length;
    return this.isComplete
      ? `Skipped · ${count}`
      : `Will be skipped · ${recordCount(count)}`;
  }

  /** e.g. "Batch reversed · 4 role records reverted to Eli Thompson, 2 skipped." */
  get completionMessage() {
    const reversed = this.reverseEntries.length;
    const targets = new Set(
      this.reverseEntries.map((entry) => entry.revertingTo).filter(Boolean)
    );
    const to = targets.size === 1 ? ` to ${[...targets][0]}` : "";
    const noun = reversed === 1 ? "role record" : "role records";
    return `Batch reversed · ${reversed} ${noun} reverted${to}, ${this.skipEntries.length} skipped.`;
  }

  get reverseColumns() {
    return this.columns(this.isComplete ? "Outcome" : "Status");
  }

  get skipColumns() {
    return this.columns(this.isComplete ? "Reason" : "Notes");
  }

  columns(lastLabel) {
    return [
      { label: "Role Type", fieldName: "roleType", initialWidth: WIDE_COLUMN },
      linkColumn("Request", "requestId", "view_request", REQUEST_COLUMN),
      linkColumn("Program Name", "programName", "view_program", WIDE_COLUMN),
      {
        label: "Current User",
        fieldName: "currentUserLabel",
        initialWidth: WIDE_COLUMN
      },
      {
        label: "Reverting To",
        fieldName: "revertingToLabel",
        initialWidth: WIDE_COLUMN
      },
      {
        label: lastLabel,
        fieldName: "note",
        type: "note",
        typeAttributes: NOTE_TYPE_ATTRIBUTES
      }
    ];
  }

  toRow(entry, note) {
    return {
      ...entry,
      currentUserLabel: entry.currentUser || NO_VALUE,
      revertingToLabel: entry.revertingTo || NO_VALUE,
      ...note
    };
  }

  get reverseRows() {
    const note = this.isComplete ? "Reversed" : "Will reverse";
    return this.reverseEntries.map((entry) =>
      this.toRow(entry, { note, ...SUCCESS_NOTE })
    );
  }

  get skipRows() {
    return this.skipEntries.map((entry) =>
      this.toRow(entry, { note: entry.skipReason, ...WARNING_NOTE })
    );
  }

  get isInitiateDisabled() {
    return this.processing || !this.hasReversible;
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
          detail: { recordId: entry.id, requestId: entry.requestId }
        })
      );
    } else if (actionName === "view_program") {
      this.dispatchEvent(
        new CustomEvent("programselect", {
          detail: { recordId: entry.id, programName: entry.programName }
        })
      );
    }
  }

  /** Back returns to the Reverse Batch popup (the parent reopens it with the same answers). */
  handleBack() {
    this.dispatchEvent(new CustomEvent("back"));
  }

  handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
  }

  handleHistory() {
    this.dispatchEvent(new CustomEvent("history"));
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
