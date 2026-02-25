public with sharing class ContactFormController {
    private static final Set<String> ALLOWED_FIELDS = new Set<String>{
        'AccountId', 'FirstName', 'LastName', 'Salutation', 'Phone', 'MobilePhone', 'HomePhone', 'OtherPhone', 'Fax', 'Email',
        'Title', 'Department', 'Birthdate', 'ReportsToId', 'LeadSource',
        'AssistantName', 'AssistantPhone',
        'MailingStreet', 'MailingCity', 'MailingState', 'MailingPostalCode', 'MailingCountry',
        'OtherStreet', 'OtherCity', 'OtherState', 'OtherPostalCode', 'OtherCountry',
        'Description'
    };

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getReportsToOptions() {
        List<Map<String, String>> options = new List<Map<String, String>>();
        options.add(new Map<String, String>{ 'label' => '--None--', 'value' => '' });
        for (Contact c : [SELECT Id, Name FROM Contact ORDER BY LastName, FirstName LIMIT 200]) {
            options.add(new Map<String, String>{ 'label' => c.Name, 'value' => c.Id });
        }
        return options;
    }

    @AuraEnabled(cacheable=true)
    public static Map<String, String> getCurrentUser() {
        User u = [SELECT Id, Name FROM User WHERE Id = :UserInfo.getUserId() LIMIT 1];
        return new Map<String, String>{ 'Id' => u.Id, 'Name' => u.Name };
    }

    @AuraEnabled
    public static Id saveContact(Map<String, Object> contactData) {
        if (contactData == null || contactData.isEmpty()) {
            throw new AuraHandledException('Contact data is required.');
        }
        Contact c = new Contact();
        c.OwnerId = UserInfo.getUserId();
        for (String key : contactData.keySet()) {
            if (!ALLOWED_FIELDS.contains(key)) {
                continue;
            }
            Object val = contactData.get(key);
            if (val == null || (val instanceof String && String.isBlank((String) val))) {
                if (key == 'FirstName' || key == 'LastName' || key == 'Phone') {
                    if (key == 'Phone') {
                        throw new AuraHandledException('Phone is required.');
                    }
                    if (key == 'FirstName') {
                        throw new AuraHandledException('First Name is required.');
                    }
                    if (key == 'LastName') {
                        throw new AuraHandledException('Last Name is required.');
                    }
                }
                continue;
            }
            if (key == 'Birthdate' && val instanceof String) {
                c.put(key, Date.valueOf((String) val));
            } else if ((key == 'ReportsToId' || key == 'AccountId') && val != null) {
                if (val instanceof Id) {
                    c.put(key, val);
                } else if (val instanceof String && String.isNotBlank((String) val)) {
                    String s = (String) val;
                    if (s.length() == 15 || s.length() == 18) {
                        try {
                            c.put(key, (Id) val);
                        } catch (Exception e) { /* skip invalid Id */ }
                    }
                }
            } else if (key != 'ReportsToId' && key != 'AccountId') {
                c.put(key, val);
            }
        }
        if (String.isBlank(c.FirstName)) {
            throw new AuraHandledException('First Name is required.');
        }
        if (String.isBlank(c.LastName)) {
            throw new AuraHandledException('Last Name is required.');
        }
        if (String.isBlank(c.Phone)) {
            throw new AuraHandledException('Phone is required.');
        }
        insert c;
        return c.Id;
    }
}
