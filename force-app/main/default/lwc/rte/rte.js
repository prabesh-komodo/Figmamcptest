import { LightningElement, api, track } from "lwc";

export default class Rte extends LightningElement {
  _value = "";
  _showPageBreakButton;

  @api label = "Rich text";
  @api placeholder;
  @api disabled = false;
  @api readOnly = false;
  @api required = false;
  @api labelVisible = false;
  @api pageBreakMarker = "[[PAGE_BREAK]]";

  @api
  get showPageBreakButton() {
    return this._showPageBreakButton !== false;
  }

  set showPageBreakButton(value) {
    this._showPageBreakButton = value;
  }

  @track isPreviewMode = false;

  get isEditMode() {
    return !this.isPreviewMode;
  }

  get editButtonVariant() {
    return this.isPreviewMode ? "neutral" : "brand";
  }

  get previewButtonVariant() {
    return this.isPreviewMode ? "brand" : "neutral";
  }

  get pageBreakButtonDisabled() {
    return this.disabled || this.readOnly;
  }

  get previewSections() {
    const raw = this._value || "";
    const marker = this.pageBreakMarker;
    if (!raw || !marker) {
      return [{ key: "s-0", html: raw, hasPageBreak: false }];
    }

    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`<p>\\s*${escaped}\\s*</p>|${escaped}`, "gi");
    const parts = raw.split(pattern).filter((p) => p.trim().length > 0);

    if (parts.length === 0) {
      return [{ key: "s-0", html: raw, hasPageBreak: false }];
    }

    return parts.map((html, idx) => ({
      key: `s-${idx}`,
      html,
      hasPageBreak: idx < parts.length - 1
    }));
  }

  @api
  get value() {
    return this._value;
  }

  set value(html) {
    this._value = html ?? "";
  }

  handleEditMode() {
    this.isPreviewMode = false;
  }

  handlePreviewMode() {
    this.isPreviewMode = true;
  }

  handleChange(event) {
    this._value = event.detail.value;
    this.fireChange();
  }

  handleInsertPageBreak() {
    const editor = this.refs.richText;
    editor.setRangeText(this.pageBreakMarker);
    this._value = editor.value;
    this.fireChange();
  }

  fireChange() {
    this.dispatchEvent(
      new CustomEvent("change", {
        detail: { value: this._value },
        bubbles: true,
        composed: true
      })
    );
  }
}
