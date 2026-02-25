@IsTest
private class AccountFormControllerTest {
    @IsTest
    static void saveAccount_success() {
        Map<String, Object> data = new Map<String, Object>{
            'Name' => 'Test Account',
            'Phone' => '555-0100',
            'Industry' => 'Technology'
        };
        Test.startTest();
        Id accId = AccountFormController.saveAccount(data);
        Test.stopTest();
        System.assertNotEquals(null, accId, 'Account Id should be returned');
        Account a = [SELECT Id, Name, Phone, Industry FROM Account WHERE Id = :accId];
        System.assertEquals('Test Account', a.Name);
        System.assertEquals('555-0100', a.Phone);
        System.assertEquals('Technology', a.Industry);
    }

    @IsTest
    static void saveAccount_nameRequired() {
        Map<String, Object> data = new Map<String, Object>{
            'Phone' => '555-0100'
        };
        Test.startTest();
        try {
            AccountFormController.saveAccount(data);
            System.assert(false, 'Expected AuraHandledException');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('Name'), 'Message should mention Name');
        }
        Test.stopTest();
    }

    @IsTest
    static void saveAccount_emptyData() {
        Test.startTest();
        try {
            AccountFormController.saveAccount(new Map<String, Object>());
            System.assert(false, 'Expected AuraHandledException');
        } catch (AuraHandledException e) {
            System.assert(true, 'Expected exception');
        }
        Test.stopTest();
    }
}
