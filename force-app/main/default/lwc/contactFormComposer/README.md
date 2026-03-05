# contactFormComposer

Contact form driven by the **ContactComposerFields** field set. Fields displayed and saved are configurable via Setup without code changes.

## Field Set Setup (Optional)

To customize which fields appear on the form:

1. Go to **Setup** → **Object Manager** → **Contact**
2. Under **Field Sets**, click **New**
3. Name: `ContactComposerFields`
4. Add the fields you want (e.g., Salutation, FirstName, LastName, Phone, Email, etc.)
5. Save

If the field set is not created, the component uses a default list of common Contact fields.

## Behavior

- **Owner**: Read-only, shows current user
- **Account Name**: Custom input—creates a new Account or links to an existing one by name
- All other fields come from the field set (or defaults)
- Uses `lightning-record-edit-form` and `lightning-input-field` for built-in validation and FLS
