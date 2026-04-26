@IsTest
private class OhfyPlanDataReader_Test {

    @TestSetup
    static void setupData() {
        List<Plan_Event_Template__c> events = new List<Plan_Event_Template__c>{
            new Plan_Event_Template__c(
                Event_Id__c = 'iron-bowl-2026',
                Label__c = 'Iron Bowl weekend',
                Category__c = 'sports',
                Region__c = 'AL',
                Season__c = 'fall',
                Month__c = '2026-10',
                Revenue_Delta_Pct__c = 9.50,
                COGS_Delta_Pct__c = 7.20,
                OpEx_Delta_Abs__c = 35,
                Source__c = 'CFBD',
                Notes__c = 'rivalry weekend'
            ),
            new Plan_Event_Template__c(
                Event_Id__c = 'heat-wave-july',
                Label__c = 'July heat wave',
                Category__c = 'weather',
                Region__c = 'AL',
                Season__c = 'summer',
                Month__c = '2026-07',
                Revenue_Delta_Pct__c = 3.10
            ),
            new Plan_Event_Template__c(
                Event_Id__c = 'gulf-hurricane-cat-3',
                Label__c = 'Gulf hurricane',
                Category__c = 'weather',
                Region__c = 'MOB',
                Season__c = 'fall',
                Month__c = '2026-09',
                Revenue_Delta_Pct__c = -7.50
            ),
            new Plan_Event_Template__c(
                Event_Id__c = 'memorial-day-kickoff',
                Label__c = 'Memorial Day grilling',
                Category__c = 'holiday',
                Region__c = 'AL',
                Season__c = 'spring',
                Month__c = '2026-05',
                Revenue_Delta_Pct__c = 4.20
            ),
            new Plan_Event_Template__c(
                Event_Id__c = 'fuel-surcharge-q3',
                Label__c = 'Diesel price surge',
                Category__c = 'macro',
                Region__c = 'AL',
                Season__c = 'summer',
                Month__c = '2026-08',
                Revenue_Delta_Pct__c = 0
            )
        };
        insert events;

        List<Plan_Knowledge_Article__c> articles = new List<Plan_Knowledge_Article__c>{
            new Plan_Knowledge_Article__c(
                Article_Id__c = 'hurricane-playbook',
                Title__c = 'Hurricane impact playbook',
                Body__c = 'A Cat 2+ hurricane crossing the Gulf...',
                Source__c = 'NOAA',
                Tags__c = 'hurricane,weather,playbook,gulf'
            ),
            new Plan_Knowledge_Article__c(
                Article_Id__c = 'sec-football-weekend',
                Title__c = 'SEC football home-game effect',
                Body__c = 'Each home game in Tuscaloosa or Auburn drives +9-11%...',
                Source__c = 'CFBD',
                Tags__c = 'sports,football,sec,iron-bowl,alabama'
            ),
            new Plan_Knowledge_Article__c(
                Article_Id__c = 'yellowhammer-profile',
                Title__c = 'Yellowhammer Beverage profile',
                Body__c = 'Beer + Red Bull wholesaler in Birmingham, AL...',
                Source__c = 'Internal',
                Tags__c = 'profile,customer,yellowhammer,alabama'
            )
        };
        insert articles;
    }

    @IsTest
    static void listEventTemplates_returnsAllWhenNoFilter() {
        Test.startTest();
        List<OhfyPlanDataReader.EventTemplate> result =
            OhfyPlanDataReader.listEventTemplates(null, null);
        Test.stopTest();
        System.assertEquals(5, result.size(), 'all 5 events returned');
    }

    @IsTest
    static void listEventTemplates_filtersCategoryAndRegion() {
        Test.startTest();
        List<OhfyPlanDataReader.EventTemplate> alWeather =
            OhfyPlanDataReader.listEventTemplates('AL', 'weather');
        List<OhfyPlanDataReader.EventTemplate> alOnly =
            OhfyPlanDataReader.listEventTemplates('AL', null);
        List<OhfyPlanDataReader.EventTemplate> sportsOnly =
            OhfyPlanDataReader.listEventTemplates(null, 'sports');
        Test.stopTest();
        System.assertEquals(1, alWeather.size(), 'AL+weather = heat-wave only');
        System.assertEquals('heat-wave-july', alWeather[0].eventId);
        System.assertEquals(4, alOnly.size(), 'AL = all but the MOB hurricane');
        System.assertEquals(1, sportsOnly.size(), 'sports = iron bowl only');
    }

    @IsTest
    static void listKnowledgeArticles_returnsAllWhenNoTag() {
        Test.startTest();
        List<OhfyPlanDataReader.KnowledgeArticle> result =
            OhfyPlanDataReader.listKnowledgeArticles(null);
        Test.stopTest();
        System.assertEquals(3, result.size(), 'all 3 articles returned');
    }

    @IsTest
    static void listKnowledgeArticles_filtersTag() {
        Test.startTest();
        List<OhfyPlanDataReader.KnowledgeArticle> sec =
            OhfyPlanDataReader.listKnowledgeArticles('sec');
        List<OhfyPlanDataReader.KnowledgeArticle> alabama =
            OhfyPlanDataReader.listKnowledgeArticles('alabama');
        Test.stopTest();
        System.assertEquals(1, sec.size(), 'sec tag matches sec-football-weekend');
        System.assertEquals('sec-football-weekend', sec[0].articleId);
        System.assertEquals(2, alabama.size(), 'alabama tag matches sec + profile');
    }

    @IsTest
    static void getEventTemplate_returnsByExternalId() {
        Test.startTest();
        OhfyPlanDataReader.EventTemplate result =
            OhfyPlanDataReader.getEventTemplate('iron-bowl-2026');
        Test.stopTest();
        System.assertNotEquals(null, result);
        System.assertEquals('Iron Bowl weekend', result.label);
        System.assertEquals(9.50, result.revenueDeltaPct);
    }

    @IsTest
    static void getEventTemplate_returnsNullForMissing() {
        Test.startTest();
        OhfyPlanDataReader.EventTemplate result =
            OhfyPlanDataReader.getEventTemplate('does-not-exist');
        OhfyPlanDataReader.EventTemplate blank =
            OhfyPlanDataReader.getEventTemplate('');
        Test.stopTest();
        System.assertEquals(null, result);
        System.assertEquals(null, blank);
    }

    @IsTest
    static void recordDecision_persistsRowAndReturnsId() {
        Datetime before = Datetime.now().addSeconds(-1);
        Test.startTest();
        String decisionId = OhfyPlanDataReader.recordDecision(
            'yellowhammer-stress',
            'accept',
            'CFO approved hurricane stress test',
            new List<String>{'iron-bowl-2026', 'heat-wave-july'}
        );
        Test.stopTest();

        System.assertNotEquals(null, decisionId, 'decision id returned');
        System.assert(decisionId.length() >= 32, 'uuid-shaped id');

        Plan_Scenario_Decision__c row = [
            SELECT Decision_Id__c, Scenario_Id__c, Decision_Type__c, Rationale__c,
                   User_Id_Hash__c, Recorded_At__c, Applied_Event_Ids__c
            FROM Plan_Scenario_Decision__c
            WHERE Decision_Id__c = :decisionId
            LIMIT 1
        ];
        System.assertEquals('yellowhammer-stress', row.Scenario_Id__c);
        System.assertEquals('accept', row.Decision_Type__c);
        System.assertEquals('iron-bowl-2026,heat-wave-july', row.Applied_Event_Ids__c);
        System.assertNotEquals(null, row.User_Id_Hash__c);
        System.assertNotEquals(UserInfo.getUserId(), row.User_Id_Hash__c, 'never raw user id');
        System.assertEquals(64, row.User_Id_Hash__c.length(), 'sha-256 hex is 64 chars');
        System.assert(row.Recorded_At__c >= before, 'recorded_at within last second');
    }

    @IsTest
    static void recordDecision_rejectsInvalidDecisionType() {
        Boolean threw = false;
        Test.startTest();
        try {
            OhfyPlanDataReader.recordDecision(
                'yellowhammer-stress',
                'totally-invalid',
                'should fail',
                new List<String>()
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'invalid decisionType throws AuraHandledException');
    }

    @IsTest
    static void recordDecision_rejectsBlankScenarioId() {
        Boolean threw = false;
        Test.startTest();
        try {
            OhfyPlanDataReader.recordDecision('', 'accept', 'no scenario', null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'blank scenarioId throws AuraHandledException');
    }

    @IsTest
    static void recordDecision_handlesNullAppliedEventIds() {
        Test.startTest();
        String decisionId = OhfyPlanDataReader.recordDecision(
            'yellowhammer-6mo', 'reject', 'rejecting baseline', null
        );
        Test.stopTest();
        Plan_Scenario_Decision__c row = [
            SELECT Applied_Event_Ids__c FROM Plan_Scenario_Decision__c
            WHERE Decision_Id__c = :decisionId
        ];
        // SF normalizes an empty LongTextArea write to null on read.
        System.assert(
            row.Applied_Event_Ids__c == null || row.Applied_Event_Ids__c == '',
            'null list -> empty/null, got ' + row.Applied_Event_Ids__c
        );
    }
}
