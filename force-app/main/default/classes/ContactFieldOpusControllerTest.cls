@IsTest
private class ContactFieldOpusControllerTest {

    @IsTest
    static void testGetFieldSetMembers() {
        List<Map<String, String>> members = ContactFieldOpusController.getFieldSetMembers('ContactComposerFields');
        System.assertNotEquals(null, members, 'Should return a list');
    }

    @IsTest
    static void testGetFieldSetMembersBlankName() {
        List<Map<String, String>> members = ContactFieldOpusController.getFieldSetMembers('');
        System.assertNotEquals(null, members, 'Should fall back to default field set');
    }

    @IsTest
    static void testGetFieldSetMembersInvalidName() {
        List<Map<String, String>> members = ContactFieldOpusController.getFieldSetMembers('NonExistentFieldSet');
        System.assertEquals(0, members.size(), 'Should return empty list for invalid field set');
    }

    @IsTest
    static void testGetCurrentUser() {
        Map<String, String> userData = ContactFieldOpusController.getCurrentUser();
        System.assertNotEquals(null, userData.get('Id'), 'Should return current user Id');
        System.assertNotEquals(null, userData.get('Name'), 'Should return current user Name');
    }

    @IsTest
    static void testSaveContactBasic() {
        String json = '{"LastName":"TestContact"}';
        String contactId = ContactFieldOpusController.saveContact(json, null);
        System.assertNotEquals(null, contactId, 'Should return a Contact Id');
        Contact c = [SELECT LastName FROM Contact WHERE Id = :contactId];
        System.assertEquals('TestContact', c.LastName);
    }

    @IsTest
    static void testSaveContactWithNewAccount() {
        String json = '{"LastName":"TestWithAccount"}';
        String contactId = ContactFieldOpusController.saveContact(json, 'NewTestAccount');
        System.assertNotEquals(null, contactId, 'Should return a Contact Id');
        Contact c = [SELECT AccountId, Account.Name FROM Contact WHERE Id = :contactId];
        System.assertEquals('NewTestAccount', c.Account.Name);
    }

    @IsTest
    static void testSaveContactWithExistingAccount() {
        Account a = new Account(Name = 'ExistingAccount');
        insert a;
        String json = '{"LastName":"TestExisting"}';
        String contactId = ContactFieldOpusController.saveContact(json, 'ExistingAccount');
        Contact c = [SELECT AccountId FROM Contact WHERE Id = :contactId];
        System.assertEquals(a.Id, c.AccountId);
    }
}
