public with sharing class AccountFormController {
    private static final Set<String> ALLOWED_FIELDS = new Set<String>{
        'Name', 'Phone', 'Website', 'Type', 'Industry', 'Description',
        'BillingStreet', 'BillingCity', 'BillingState', 'BillingPostalCode', 'BillingCountry'
    };

    @AuraEnabled
    public static Id saveAccount(Map<String, Object> accountData) {
        if (accountData == null || accountData.isEmpty()) {
            throw new AuraHandledException('Account data is required.');
        }
        Account acc = new Account();
        for (String key : accountData.keySet()) {
            if (!ALLOWED_FIELDS.contains(key)) {
                continue;
            }
            Object val = accountData.get(key);
            if (val == null || (val instanceof String && String.isBlank((String) val))) {
                if (key == 'Name') {
                    throw new AuraHandledException('Account Name is required.');
                }
                continue;
            }
            acc.put(key, val);
        }
        if (String.isBlank(acc.Name)) {
            throw new AuraHandledException('Account Name is required.');
        }
        insert acc;
        return acc.Id;
    }
}
