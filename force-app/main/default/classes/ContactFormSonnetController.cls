public with sharing class ContactFormSonnetController {

    @AuraEnabled(cacheable=true)
    public static User getCurrentUser() {
        return [
            SELECT Id, Name, SmallPhotoUrl
            FROM User
            WHERE Id = :UserInfo.getUserId()
            LIMIT 1
        ];
    }

    @AuraEnabled
    public static Contact saveContact(Contact contactRecord) {
        try {
            if (contactRecord.Id == null) {
                insert contactRecord;
            } else {
                update contactRecord;
            }
            return contactRecord;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getDmlMessage(0));
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}
