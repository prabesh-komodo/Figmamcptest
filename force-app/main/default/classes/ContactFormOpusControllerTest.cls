@IsTest
private class ContactFormOpusControllerTest {

    @IsTest
    static void testGetFieldSetMembers() {
        List<Map<String, String>> result = ContactFormOpusController.getFieldSetMembers('ContactComposerFields');
        // May be empty if field set not deployed in test context
        System.assertNotEquals(null, result, 'Result should not be null');
    }

    @IsTest
    static void testGetCurrentUser() {
        Map<String, String> result = ContactFormOpusController.getCurrentUser();
        System.assertNotEquals(null, result.get('Id'), 'User Id should not be null');
        System.assertNotEquals(null, result.get('Name'), 'User Name should not be null');
    }

    @IsTest
    static void testSearchContactsShortTerm() {
        List<Map<String, String>> results = ContactFormOpusController.searchContacts('a');
        System.assertEquals(0, results.size(), 'Should return empty for short search term');
    }

    @IsTest
    static void testSearchContacts() {
        Contact c = new Contact(LastName = 'TestSearchOpus');
        insert c;

        Test.startTest();
        List<Map<String, String>> results = ContactFormOpusController.searchContacts('TestSearchOpus');
        Test.stopTest();

        System.assert(results.size() > 0, 'Should find the test contact');
    }

    @IsTest
    static void testSaveContactWithNewAccount() {
        String json = '{"LastName":"OpusTest","FirstName":"Jane","Email":"jane@test.com"}';

        Test.startTest();
        String contactId = ContactFormOpusController.saveContact(json, 'Opus Test Account');
        Test.stopTest();

        System.assertNotEquals(null, contactId, 'Contact Id should not be null');
        Contact c = [SELECT Id, AccountId, Account.Name FROM Contact WHERE Id = :contactId];
        System.assertEquals('Opus Test Account', c.Account.Name, 'Account should be created');
    }

    @IsTest
    static void testSaveContactWithExistingAccount() {
        Account a = new Account(Name = 'Existing Opus Account');
        insert a;

        String json = '{"LastName":"OpusExisting","Phone":"1234567890"}';

        Test.startTest();
        String contactId = ContactFormOpusController.saveContact(json, 'Existing Opus Account');
        Test.stopTest();

        Contact c = [SELECT AccountId FROM Contact WHERE Id = :contactId];
        System.assertEquals(a.Id, c.AccountId, 'Should link to existing account');
    }

    @IsTest
    static void testSaveContactWithoutAccount() {
        String json = '{"LastName":"OpusNoAcct","Birthdate":"2000-01-15"}';

        Test.startTest();
        String contactId = ContactFormOpusController.saveContact(json, null);
        Test.stopTest();

        Contact c = [SELECT AccountId, Birthdate FROM Contact WHERE Id = :contactId];
        System.assertEquals(null, c.AccountId, 'AccountId should be null');
        System.assertEquals(Date.newInstance(2000, 1, 15), c.Birthdate, 'Birthdate should match');
    }
}
