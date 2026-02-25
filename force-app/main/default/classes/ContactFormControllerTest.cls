@IsTest
private class ContactFormControllerTest {
    @IsTest
    static void getCurrentUser_returnsUser() {
        Test.startTest();
        Map<String, String> user = ContactFormController.getCurrentUser();
        Test.stopTest();
        System.assertNotEquals(null, user, 'Should return user map');
        System.assertNotEquals(null, user.get('Id'), 'Should have Id');
        System.assertNotEquals(null, user.get('Name'), 'Should have Name');
    }

    @IsTest
    static void getReportsToOptions_returnsOptions() {
        Test.startTest();
        List<Map<String, String>> options = ContactFormController.getReportsToOptions();
        Test.stopTest();
        System.assertNotEquals(null, options, 'Should return options list');
        System.assert(options.size() >= 1, 'Should have at least --None--');
        System.assertEquals('--None--', options[0].get('label'));
        System.assertEquals('', options[0].get('value'));
    }

    @IsTest
    static void saveContact_success() {
        Account acc = new Account(Name = 'Test Account');
        insert acc;
        Map<String, Object> data = new Map<String, Object>{
            'FirstName' => 'Test',
            'LastName' => 'Contact',
            'Phone' => '555-0100',
            'Email' => 'test@example.com',
            'AccountId' => acc.Id
        };
        Test.startTest();
        Id conId = ContactFormController.saveContact(data);
        Test.stopTest();
        System.assertNotEquals(null, conId, 'Contact Id should be returned');
        Contact c = [SELECT Id, FirstName, LastName, Phone, Email FROM Contact WHERE Id = :conId];
        System.assertEquals('Test', c.FirstName);
        System.assertEquals('Contact', c.LastName);
        System.assertEquals('555-0100', c.Phone);
    }

    @IsTest
    static void saveContact_firstNameRequired() {
        Map<String, Object> data = new Map<String, Object>{
            'LastName' => 'Contact',
            'Phone' => '555-0100'
        };
        Test.startTest();
        try {
            ContactFormController.saveContact(data);
            System.assert(false, 'Expected AuraHandledException');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('First Name'), 'Message should mention First Name');
        }
        Test.stopTest();
    }

    @IsTest
    static void saveContact_emptyData() {
        Test.startTest();
        try {
            ContactFormController.saveContact(new Map<String, Object>());
            System.assert(false, 'Expected AuraHandledException');
        } catch (AuraHandledException e) {
            System.assert(true, 'Expected exception');
        }
        Test.stopTest();
    }
}
