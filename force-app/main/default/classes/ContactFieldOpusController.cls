public with sharing class ContactFieldOpusController {

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

    @AuraEnabled
    public static String saveContact(String contactJson, String accountName) {
        Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(contactJson);
        Contact c = new Contact();

        Set<String> validFields = new Set<String>();
        Schema.FieldSet fs = Contact.SObjectType.getDescribe().fieldSets.getMap().get(DEFAULT_FIELD_SET);
        if (fs != null) {
            for (Schema.FieldSetMember fsm : fs.getFields()) {
                validFields.add(fsm.getFieldPath());
            }
        }

        Map<String, Schema.SObjectField> fieldMap = Contact.SObjectType.getDescribe().fields.getMap();
        for (String key : data.keySet()) {
            if (key == 'AccountName') continue;
            if (!validFields.isEmpty() && !validFields.contains(key)) {
                continue;
            }
            Schema.SObjectField fieldToken = fieldMap.get(key);
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
                // Skip field if value cannot be cast
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
}
