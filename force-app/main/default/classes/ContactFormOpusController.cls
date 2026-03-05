public with sharing class ContactFormOpusController {

    private static final String DEFAULT_FIELD_SET = 'ContactComposerFields';

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getFieldSetMembers(String fieldSetName) {
        if (String.isBlank(fieldSetName)) {
            fieldSetName = DEFAULT_FIELD_SET;
        }
        List<Map<String, String>> result = new List<Map<String, String>>();
        Schema.SObjectType token = Contact.SObjectType;
        Schema.DescribeSObjectResult describe = token.getDescribe();
        Map<String, Schema.FieldSet> fsMap = describe.fieldSets.getMap();
        Schema.FieldSet fs = fsMap.get(fieldSetName);
        if (fs == null) {
            return result;
        }
        for (Schema.FieldSetMember fsm : fs.getFields()) {
            Schema.DescribeFieldResult dfr = fsm.getSObjectField().getDescribe();
            result.add(new Map<String, String>{
                'fieldPath' => fsm.getFieldPath(),
                'label' => fsm.getLabel(),
                'type' => String.valueOf(dfr.getType()).toLowerCase(),
                'required' => String.valueOf(fsm.getRequired())
            });
        }
        return result;
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, String> getCurrentUser() {
        User u = [SELECT Id, Name FROM User WHERE Id = :UserInfo.getUserId() LIMIT 1];
        return new Map<String, String>{
            'Id' => u.Id,
            'Name' => u.Name
        };
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> searchContacts(String searchTerm) {
        List<Map<String, String>> results = new List<Map<String, String>>();
        if (String.isBlank(searchTerm) || searchTerm.length() < 2) {
            return results;
        }
        String likeKey = '%' + String.escapeSingleQuotes(searchTerm) + '%';
        for (Contact c : [SELECT Id, Name FROM Contact WHERE Name LIKE :likeKey ORDER BY Name LIMIT 20]) {
            results.add(new Map<String, String>{ 'label' => c.Name, 'value' => c.Id });
        }
        return results;
    }

    @AuraEnabled
    public static String saveContact(String contactJson, String accountName) {
        Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(contactJson);
        Contact c = new Contact();

        // Use field set to restrict which fields can be saved (when field set exists)
        Set<String> validFields = new Set<String>();
        Schema.FieldSet fs = getFieldSet(DEFAULT_FIELD_SET);
        if (fs != null) {
            for (Schema.FieldSetMember fsm : fs.getFields()) {
                validFields.add(fsm.getFieldPath());
            }
        }

        Map<String, Schema.SObjectField> fieldMap = Contact.SObjectType.getDescribe().fields.getMap();
        for (String key : data.keySet()) {
            if (key == 'AccountName') continue;
            String fieldKey = key;
            if (key == 'LeadSourceId') {
                fieldKey = fieldMap.containsKey('Lead__c') ? 'Lead__c' : null;
            } else if (!validFields.isEmpty() && !validFields.contains(key)) {
                continue;
            }
            if (fieldKey == null) continue;
            Schema.SObjectField fieldToken = fieldMap.get(fieldKey);
            if (fieldToken == null) {
                continue;
            }
            Object val = data.get(key);
            if (val == null || val == '') {
                continue;
            }
            Schema.DescribeFieldResult dfr = fieldToken.getDescribe();
            try {
                if (dfr.getType() == Schema.DisplayType.Date) {
                    c.put(key, Date.valueOf(String.valueOf(val)));
                } else if (dfr.getType() == Schema.DisplayType.DateTime) {
                    c.put(key, DateTime.valueOf(String.valueOf(val)));
                } else if (dfr.getType() == Schema.DisplayType.Boolean) {
                    c.put(key, Boolean.valueOf(val));
                } else if (dfr.getType() == Schema.DisplayType.Double || dfr.getType() == Schema.DisplayType.Integer) {
                    c.put(key, val);
                } else {
                    c.put(key, String.valueOf(val));
                }
            } catch (Exception e) {
                // Skip field if value cannot be set
            }
        }

        if (String.isNotBlank(accountName)) {
            List<Account> existing = [SELECT Id FROM Account WHERE Name = :accountName LIMIT 1];
            if (!existing.isEmpty()) {
                c.AccountId = existing[0].Id;
            } else {
                Account a = new Account(Name = accountName);
                insert a;
                c.AccountId = a.Id;
            }
        }

        insert c;
        return c.Id;
    }

    private static Schema.FieldSet getFieldSet(String name) {
        return Contact.SObjectType.getDescribe().fieldSets.getMap().get(name);
    }
}
