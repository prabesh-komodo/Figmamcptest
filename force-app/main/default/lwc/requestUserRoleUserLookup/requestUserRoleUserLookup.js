import { LightningElement, api } from "lwc";

const MAX_VISIBLE_OPTIONS = 50;
// SLDS dropdowns keep a 2px vertical margin; opening upward has to clear it twice.
const DROPDOWN_MARGIN = 2;

/**
 * Lightweight type-ahead user picker (SLDS lookup blueprint) for a list of
 * user names. Shows a search icon while empty and a clear button once a user
 * is chosen. Emits `change` with `{ value }` ('' when cleared).
 *
 * With `picklist` set it acts as a read-only picklist (SLDS combobox blueprint):
 * no typing, a down arrow, and a check on the chosen option. Either way the
 * list is fixed to the screen, so table cards and scroll areas can't clip it.
 */
export default class RequestUserRoleUserLookup extends LightningElement {
  @api label = "User";
  @api placeholder = "Select User...";
  @api options = [];
  @api disabled = false;

  /** Empties the input after each pick, for multi-select use where the parent shows picks as pills. */
  @api clearOnSelect = false;

  /** Read-only picklist instead of a type-ahead search. */
  @api picklist = false;

  @api
  get value() {
    return this.selectedValue;
  }
  set value(newValue) {
    this.selectedValue = newValue ?? "";
    this.searchTerm = "";
  }

  selectedValue = "";
  searchTerm = "";
  isOpen = false;
  activeIndex = -1;

  // Keeps the fixed-position list attached to the input while the page scrolls or resizes.
  reposition = () => {
    if (this.isOpen) {
      this.positionDropdown();
    }
  };

  connectedCallback() {
    window.addEventListener("scroll", this.reposition, true);
    window.addEventListener("resize", this.reposition);
  }

  disconnectedCallback() {
    window.removeEventListener("scroll", this.reposition, true);
    window.removeEventListener("resize", this.reposition);
  }

  renderedCallback() {
    this.reposition();
  }

  /** Places the list under the input, or above it when it only fits there. */
  positionDropdown() {
    const field = this.template.querySelector(".slds-combobox__form-element");
    const dropdown = this.template.querySelector(".lookup-dropdown");
    if (!field || !dropdown) {
      return;
    }
    const rect = field.getBoundingClientRect();
    const height = dropdown.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    // Flip only when the whole list fits above; otherwise it never goes off the top of the screen.
    const openUpward =
      spaceBelow < height + DROPDOWN_MARGIN &&
      rect.top >= height + 2 * DROPDOWN_MARGIN;
    const top = openUpward
      ? rect.top - height - 2 * DROPDOWN_MARGIN
      : rect.bottom;
    this.placeDropdown(dropdown, top, rect.left);
    dropdown.style.setProperty("--c-dropdown-width", `${rect.width}px`);

    // A transformed ancestor (e.g. the SLDS modal container) makes `position: fixed`
    // relative to that ancestor instead of the screen. Measure where the list really
    // landed and shift it back by that ancestor's offset.
    const placed = dropdown.getBoundingClientRect();
    const marginTop = parseFloat(getComputedStyle(dropdown).marginTop) || 0;
    const offsetX = placed.left - rect.left;
    const offsetY = placed.top - marginTop - top;
    if (Math.abs(offsetX) >= 1 || Math.abs(offsetY) >= 1) {
      this.placeDropdown(dropdown, top - offsetY, rect.left - offsetX);
    }
  }

  placeDropdown(dropdown, top, left) {
    dropdown.style.setProperty("--c-dropdown-top", `${top}px`);
    dropdown.style.setProperty("--c-dropdown-left", `${left}px`);
  }

  get inputValue() {
    return this.isOpen && !this.picklist ? this.searchTerm : this.selectedValue;
  }

  get showClear() {
    return Boolean(this.selectedValue) && !this.picklist;
  }

  get rightIcon() {
    return this.picklist ? "utility:down" : "utility:search";
  }

  get inputClass() {
    return this.picklist
      ? "slds-input slds-combobox__input picklist-input"
      : "slds-input slds-combobox__input";
  }

  get comboboxClass() {
    const base =
      "slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click";
    return this.isOpen ? `${base} slds-is-open` : base;
  }

  get ariaExpanded() {
    return String(this.isOpen);
  }

  get filteredValues() {
    const term = this.picklist ? "" : this.searchTerm.trim().toLowerCase();
    const matches = term
      ? this.options.filter((option) => option.toLowerCase().includes(term))
      : this.options;
    return matches.slice(0, MAX_VISIBLE_OPTIONS);
  }

  get visibleOptions() {
    return this.filteredValues.map((value, index) => {
      const isActive = index === this.activeIndex;
      const isSelected = value === this.selectedValue;
      let className =
        "slds-media slds-listbox__option slds-listbox__option_plain slds-media_small";
      if (isActive) {
        className += " slds-has-focus";
      }
      if (isSelected && this.picklist) {
        className += " slds-is-selected";
      }
      return {
        id: `user-option-${index}`,
        value,
        className,
        ariaSelected: String(isSelected),
        showCheck: this.picklist && isSelected
      };
    });
  }

  get activeOptionId() {
    return this.isOpen && this.activeIndex >= 0
      ? `user-option-${this.activeIndex}`
      : undefined;
  }

  get hasNoMatches() {
    return this.filteredValues.length === 0;
  }

  handleFocus() {
    this.searchTerm = "";
    this.activeIndex = -1;
    this.isOpen = true;
  }

  /** Reopens the list when the input already has focus (e.g. right after a pick). */
  handleClick() {
    if (!this.isOpen) {
      this.handleFocus();
    }
  }

  handleBlur() {
    this.isOpen = false;
    this.searchTerm = "";
  }

  handleInput(event) {
    this.searchTerm = event.target.value;
    this.activeIndex = this.filteredValues.length > 0 ? 0 : -1;
    this.isOpen = true;
  }

  handleKeyDown(event) {
    const count = this.filteredValues.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.isOpen = true;
      if (count > 0) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        this.activeIndex = (this.activeIndex + step + count) % count;
      }
    } else if (event.key === "Enter" && this.isOpen && this.activeIndex >= 0) {
      event.preventDefault();
      this.select(this.filteredValues[this.activeIndex]);
    } else if (event.key === "Escape" && this.isOpen) {
      event.stopPropagation();
      this.isOpen = false;
      this.searchTerm = "";
    }
  }

  // mousedown (not click) so the input keeps focus and blur doesn't close the list first.
  handleOptionMouseDown(event) {
    event.preventDefault();
    const value = event.currentTarget.dataset.value;
    this.select(value);
  }

  handleClear() {
    this.selectedValue = "";
    this.dispatchChange();
    const input = this.template.querySelector("input");
    input?.focus();
  }

  select(value) {
    this.selectedValue = value;
    this.isOpen = false;
    this.searchTerm = "";
    this.dispatchChange();
    if (this.clearOnSelect) {
      this.selectedValue = "";
    }
  }

  dispatchChange() {
    this.dispatchEvent(
      new CustomEvent("change", { detail: { value: this.selectedValue } })
    );
  }
}
