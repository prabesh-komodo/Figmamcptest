import { LightningElement, api } from "lwc";

/** Choosing this reason makes the note mandatory, since the reason alone says nothing. */
const REASON_REQUIRING_NOTE = "Other";

const DEFAULT_REASONS = [
  "Extended Leave",
  "Role Change",
  "Left the Organization",
  "Temporary Coverage",
  "Workload Rebalancing",
  "Other"
];

/**
 * First step of the Replace User and De-activate Role(s) flows: confirms the
 * existing user and the scope, and captures a required reason plus an
 * optional note. Emits `cancel`, or `next` with `{ reason, note }`.
 */
export default class RequestUserRoleReplaceReasonModal extends LightningElement {
  @api currentUser = "";

  /** e.g. "4 distinct request(s) · 3 role type(s) · 6 record(s)" */
  @api scopeLabel = "";

  @api heading = "Replace User";
  @api reasonLabel = "Replacement Reason";

  /** Used in the "Other" note prompt, e.g. "Describe the reason for this replacement...". */
  @api actionNoun = "replacement";

  /** Reasons offered; defaults to the replace / de-activate reasons. */
  @api
  get reasons() {
    return this.reasonOptions.map((option) => option.value);
  }
  set reasons(value) {
    this.reasonOptions = (value?.length ? value : DEFAULT_REASONS).map(
      (reason) => ({ label: reason, value: reason })
    );
  }

  /** Pre-filled values, e.g. when the user comes back to this popup from the flow. */
  @api initialReason = "";
  @api initialNote = "";

  reasonOptions = DEFAULT_REASONS.map((reason) => ({
    label: reason,
    value: reason
  }));

  /** The Existing User pair is shown only when there is one (not for batch reversals). */
  get hasCurrentUser() {
    return Boolean(this.currentUser);
  }
  reason = "";
  note = "";
  hasFocused = false;

  get isNoteRequired() {
    return this.reason === REASON_REQUIRING_NOTE;
  }

  get notePlaceholder() {
    return this.isNoteRequired
      ? `Describe the reason for this ${this.actionNoun}...`
      : "Add Notes...";
  }

  connectedCallback() {
    this.reason = this.initialReason ?? "";
    this.note = this.initialNote ?? "";
  }

  get isNextDisabled() {
    return !this.reason || (this.isNoteRequired && !this.note.trim());
  }

  renderedCallback() {
    if (this.hasFocused) {
      return;
    }
    this.hasFocused = true;
    const combobox = this.template.querySelector("lightning-combobox");
    combobox?.focus();
  }

  handleReasonChange(event) {
    this.reason = event.detail.value;
  }

  handleNoteChange(event) {
    this.note = event.detail.value ?? "";
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      this.handleCancel();
    }
  }

  handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
  }

  handleNext() {
    if (this.isNextDisabled) {
      const textarea = this.template.querySelector("lightning-textarea");

      textarea?.reportValidity();
      return;
    }
    this.dispatchEvent(
      new CustomEvent("next", {
        detail: { reason: this.reason, note: this.note.trim() }
      })
    );
  }
}
