import type { RequestActivity, RequestRecord, RequestUserRole } from './requestUserRoleExplorer';
import type { BatchRecord } from './batchHistory';

/*
 * Preview data for both explorer views.
 *
 * Requests are the single source of truth: every role row references a request
 * by ID and inherits its program, request status, products and region from it,
 * so the "Request User Roles" and "Requests" views always agree.
 * Generation is deterministic: the same data is produced on every load.
 */

// ------------------------------------------------------------------ programs

type ProgramType = 'Grant Application' | 'Investigator Sponsored Study' | 'Research Collaboration';

/** Program name → [program type, products]. */
const PROGRAM_CATALOG: Record<string, [ProgramType, string[]]> = {
    // Programs from the "Request User Roles" design
    'Chronic Pain Relief Initiative': ['Grant Application', ['Infectious Disease', 'Chronic Pain Management']],
    'Pediatric Obesity Research': ['Investigator Sponsored Study', ['Chronic Pain Management']],
    'Neurological Disorders Study': ['Investigator Sponsored Study', ['Neurology']],
    'Hypertension Management Program': ['Grant Application', ['Cardiovascular Health']],
    'Chronic Kidney Disease Study': ['Investigator Sponsored Study', ['Endocrine Disorders']],
    'Substance Abuse Recovery Program': ['Grant Application', ['Mental Health']],
    'Genomic Medicine Initiative': ['Research Collaboration', ['Oncology', 'Rare Diseases']],
    'Telehealth Effectiveness Study': ['Investigator Sponsored Study', ['Chronic Pain Support']],
    'Palliative Care Best Practices': ['Grant Application', ['Oncology']],
    'Rural Health Accessibility Program': ['Grant Application', ['Chronic Pain Solutions']],
    'Social Determinants of Health': ['Research Collaboration', ['Chronic Pain Management']],
    'Nutrition and Wellness Program': ['Grant Application', ['Endocrine Disorders']],
    'Sleep Disorders Treatment Study': ['Investigator Sponsored Study', ['Neurology', 'Mental Health']],
    'Cardiac Rehabilitation Program': ['Grant Application', ['Cardiovascular Health']],
    // Programs from the "Requests" design
    'Chronic Pain Management Program': ['Grant Application', ['Infectious Disease', 'Chronic Pain Management']],
    'Chronic Pain Research Initiative': ['Grant Application', ['Infectious Disease']],
    'Childhood Obesity Prevention': ['Investigator Sponsored Study', ['Infectious Disease']],
    'Childhood Obesity Awareness': ['Investigator Sponsored Study', ['Chronic Pain Management']],
    'Childhood Obesity Intervention': ['Investigator Sponsored Study', ['Chronic Pain Support']],
    'Neurological Health Assessment': ['Investigator Sponsored Study', ['Chronic Pain Solutions']],
    'Blood Pressure Control Program': ['Investigator Sponsored Study', ['Cardiovascular Health']],
    'Kidney Health Evaluation Program': ['Investigator Sponsored Study', ['Endocrine Disorders']],
    'Personalized Genomic Medicine': ['Grant Application', ['Chronic Pain Management']],
    'Health Equity and Social Factors': ['Grant Application', ['Chronic Pain Management']],
    'Diet and Health Monitoring Program': ['Grant Application', ['Chronic Pain Management']],
    'Sleep Health Improvement Study': ['Grant Application', ['Chronic Pain Management']],
    'Cardiac Rehabilitation Effectiveness': ['Grant Application', ['Cardiovascular Health']],
    // Additional programs for generated requests
    'Diabetes Prevention Outreach': ['Grant Application', ['Endocrine Disorders']],
    'Oncology Biomarker Registry': ['Research Collaboration', ['Oncology']],
    'Maternal Health Initiative': ['Grant Application', ["Women's Health"]],
    'Respiratory Care Pathways': ['Investigator Sponsored Study', ['Respiratory Health']],
    'Mental Health Access Program': ['Grant Application', ['Mental Health']],
    'Rare Disease Natural History Study': ['Research Collaboration', ['Rare Diseases']],
    'Vaccine Uptake Analysis': ['Investigator Sponsored Study', ['Infectious Disease']],
    'Alzheimer Early Detection Study': ['Research Collaboration', ['Neurology']],
    'Asthma Adherence Program': ['Grant Application', ['Respiratory Health']],
    'Hepatitis C Elimination Initiative': ['Grant Application', ['Infectious Disease', 'Chronic Pain Support']]
};

// ------------------------------------------------------------------ requests

type RequestRow = [requestNumber: number, programName: string, requestStatus: string, region: string];

// REQ-0001 → REQ-0021: programs and statuses carried over from both Figma designs.
const DESIGN_REQUESTS: RequestRow[] = [
    [1, 'Cardiac Rehabilitation Program', 'Evaluating', 'Canada'],
    [2, 'Cardiac Rehabilitation Program', 'Implementing', 'Canada'],
    [3, 'Sleep Disorders Treatment Study', 'Complete', 'United States'],
    [4, 'Nutrition and Wellness Program', 'Awaiting', 'United States'],
    [5, 'Social Determinants of Health', 'Finalizing', 'India'],
    [6, 'Rural Health Accessibility Program', 'Queued', 'China'],
    [7, 'Palliative Care Best Practices', 'Submitted', 'Japan'],
    [8, 'Telehealth Effectiveness Study', 'Awaiting', 'Germany'],
    [9, 'Genomic Medicine Initiative', 'Assuring', 'Canada'],
    [10, 'Substance Abuse Recovery Program', 'Ready', 'United States'],
    [11, 'Chronic Kidney Disease Study', 'Checking', 'India'],
    [12, 'Kidney Health Evaluation Program', 'Confirmed', 'China'],
    [13, 'Hypertension Management Program', 'Completed', 'Japan'],
    [14, 'Neurological Disorders Study', 'Verifying', 'Germany'],
    [15, 'Blood Pressure Control Program', 'Completed', 'Germany'],
    [16, 'Neurological Health Assessment', 'Verifying', 'Canada'],
    [17, 'Pediatric Obesity Research', 'Processing', 'United States'],
    [18, 'Childhood Obesity Intervention', 'Awaiting', 'United States'],
    [19, 'Childhood Obesity Awareness', 'In progress', 'India'],
    [20, 'Childhood Obesity Prevention', 'Processing', 'China'],
    [21, 'Chronic Pain Relief Initiative', 'Evaluating', 'United States']
];

const TOTAL_REQUESTS = 100;

const GENERATED_PROGRAMS = [
    'Chronic Pain Management Program',
    'Diabetes Prevention Outreach',
    'Oncology Biomarker Registry',
    'Chronic Pain Research Initiative',
    'Maternal Health Initiative',
    'Respiratory Care Pathways',
    'Personalized Genomic Medicine',
    'Mental Health Access Program',
    'Rare Disease Natural History Study',
    'Health Equity and Social Factors',
    'Vaccine Uptake Analysis',
    'Diet and Health Monitoring Program',
    'Alzheimer Early Detection Study',
    'Sleep Health Improvement Study',
    'Asthma Adherence Program',
    'Cardiac Rehabilitation Effectiveness',
    'Hepatitis C Elimination Initiative'
];

const REQUEST_STATUSES = [
    'Evaluating', 'Gathering', 'Analyzing', 'Scheduled', 'Processing', 'In progress',
    'Awaiting', 'Verifying', 'Completed', 'Submitted', 'Queued', 'Finalizing'
];

const COUNTRIES = [
    'United States', 'Canada', 'Germany', 'Japan', 'China', 'India',
    'United Kingdom', 'France', 'Brazil', 'Australia'
];

function requestId(requestNumber: number): string {
    return `REQ-${String(requestNumber).padStart(4, '0')}`;
}

function generateRequestRows(): RequestRow[] {
    const rows: RequestRow[] = [];
    for (let number = DESIGN_REQUESTS.length + 1; number <= TOTAL_REQUESTS; number++) {
        const index = number - DESIGN_REQUESTS.length - 1;
        rows.push([
            number,
            GENERATED_PROGRAMS[index % GENERATED_PROGRAMS.length],
            REQUEST_STATUSES[(index * 5) % REQUEST_STATUSES.length],
            COUNTRIES[(index * 3) % COUNTRIES.length]
        ]);
    }
    return rows;
}

// Newest first, matching the design's default order.
export const SAMPLE_REQUESTS: RequestRecord[] = [...DESIGN_REQUESTS, ...generateRequestRows()]
    .map(([number, programName, requestStatus, region]): RequestRecord => {
        const [programType, products] = PROGRAM_CATALOG[programName];
        return {
            id: requestId(number),
            requestId: requestId(number),
            programName,
            programType,
            requestStatus,
            products,
            region
        };
    })
    .reverse();

const REQUESTS_BY_ID = new Map(SAMPLE_REQUESTS.map((request) => [request.requestId, request]));

// --------------------------------------------------------------------- roles

type RoleRow = [
    assignedUser: string,
    roleName: string,
    roleStatus: string,
    requestNumber: number,
    effectiveStartDate: string,
    effectiveEndDate: string | null
];

// Rows from the "Request User Roles" design. Role Type matches Role Name in every design row.
const DESIGN_ROLES: RoleRow[] = [
    ['Eli Thompson', 'Budget Reviewer', 'Active', 21, '2025-06-12', null],
    ['Sofia Kim', 'Budget Reviewer', 'Active', 21, '2025-07-23', null],
    ['Zara Chen', 'Budget Reviewer', 'Active', 21, '2025-05-30', null],
    ['Milo Johnson', 'Reviewer', 'Active', 21, '2025-04-15', null],
    ['Eli Thompson', 'Financial Analyst', 'Active', 17, '2025-03-08', null],
    ['Eli Thompson', 'Reviewer', 'Active', 17, '2025-01-27', null],
    ['Eli Thompson', 'Budget Reviewer', 'Active', 17, '2025-02-19', null],
    ['Eli Thompson', 'Financial Analyst', 'Active', 14, '2025-08-05', null],
    ['Isla Brown', 'Clinical Trial Manager', 'Active', 13, '2025-09-14', null],
    ['Finn Davis', 'Clinical Trial Manager', 'Active', 11, '2025-10-22', null],
    ['Maya Wilson', 'Administrative Assistant', 'Active', 11, '2025-11-30', null],
    ['Liam Taylor', 'Field Researcher', 'Active', 10, '2025-12-18', null],
    ['Eli Thompson', 'Financial Analyst', 'Active', 9, '2025-01-10', null],
    ['Noah Harris', 'Risk Manager', 'Active', 8, '2025-02-28', null],
    ['Noah Harris', 'Risk Manager', 'Active', 7, '2025-03-17', null],
    ['Ethan Lewis', 'Marketing Coordinator', 'Active', 6, '2025-04-06', null],
    ['Eli Thompson', 'Budget Reviewer', 'Active', 5, '2025-05-25', null],
    ['Eli Thompson', 'Budget Reviewer', 'Inactive', 4, '2025-06-30', '2026-08-17'],
    ['Eli Thompson', 'Budget Reviewer', 'Inactive', 3, '2025-07-11', '2026-08-17'],
    ['Eli Thompson', 'Budget Reviewer', 'Inactive', 2, '2025-08-20', '2026-08-17'],
    ['Sofia Kim', 'Financial Analyst', 'Active', 1, '2025-09-02', null],
    ['Zara Chen', 'Reviewer', 'Inactive', 1, '2025-01-15', '2025-12-31']
];

// 100 generated roles: three per request for REQ-0022 → REQ-0055. Requests after
// REQ-0055 intentionally have no roles yet (candidates for "Add Roles").
const GENERATED_ROLE_COUNT = 100;
const ROLES_PER_REQUEST = 3;
const FIRST_GENERATED_ROLE_REQUEST = 22;

const USERS = [
    'Ava Martinez', 'Lucas Nguyen', 'Chloe Patel', 'Mason Clark', 'Harper Lee',
    'Oliver Scott', 'Amelia Turner', 'James Walker', 'Mia Robinson', 'Benjamin Young',
    'Eli Thompson', 'Sofia Kim', 'Zara Chen', 'Noah Harris'
];

const ROLES = [
    'Budget Reviewer', 'Reviewer', 'Financial Analyst', 'Clinical Trial Manager',
    'Administrative Assistant', 'Field Researcher', 'Risk Manager', 'Marketing Coordinator',
    'Data Steward', 'Compliance Officer', 'Medical Advisor', 'Program Lead'
];

function isoDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function generateRoleRows(): RoleRow[] {
    return Array.from({ length: GENERATED_ROLE_COUNT }, (_, index): RoleRow => {
        const requestIndex = Math.floor(index / ROLES_PER_REQUEST);
        const isInactive = index % 7 === 3;
        return [
            USERS[(index * 5 + requestIndex) % USERS.length],
            ROLES[(index * 7 + 3) % ROLES.length],
            isInactive ? 'Inactive' : 'Active',
            FIRST_GENERATED_ROLE_REQUEST + requestIndex,
            isoDate(2025, (index % 12) + 1, ((index * 3) % 28) + 1),
            isInactive ? isoDate(2026, ((index + 4) % 12) + 1, ((index * 5) % 28) + 1) : null
        ];
    });
}

/*
 * Roles left behind by the seeded batch history (see SAMPLE_BATCHES), on
 * requests that otherwise have no roles:
 * - BAT-0102 replaced Milo Johnson with Priya Raman on REQ-0056 → REQ-0058.
 *   Priya's REQ-0058 role was ended by hand afterwards, so reversing that
 *   batch skips it ("Manual updates have been made since this batch").
 * - BAT-0103 added Reviewer roles for Jordan Mitchell and Gavin Harris on REQ-0059 and REQ-0060.
 */
const BATCH_ROLES: RoleRow[] = [
    ['Milo Johnson', 'Data Steward', 'Inactive', 56, '2025-11-03', '2026-09-10'],
    ['Priya Raman', 'Data Steward', 'Active', 56, '2026-09-10', null],
    ['Milo Johnson', 'Compliance Officer', 'Inactive', 57, '2025-12-15', '2026-09-10'],
    ['Priya Raman', 'Compliance Officer', 'Active', 57, '2026-09-10', null],
    ['Milo Johnson', 'Data Steward', 'Inactive', 58, '2026-01-20', '2026-09-10'],
    ['Priya Raman', 'Data Steward', 'Inactive', 58, '2026-09-10', '2026-09-24'],
    ['Jordan Mitchell', 'Reviewer', 'Active', 59, '2026-09-20', null],
    ['Gavin Harris', 'Reviewer', 'Active', 59, '2026-09-20', null],
    ['Jordan Mitchell', 'Reviewer', 'Active', 60, '2026-09-20', null],
    ['Gavin Harris', 'Reviewer', 'Active', 60, '2026-09-20', null]
];

const FIRST_BATCH_ROLE_INDEX = DESIGN_ROLES.length + GENERATED_ROLE_COUNT;

export const SAMPLE_REQUEST_USER_ROLES: RequestUserRole[] = [...DESIGN_ROLES, ...generateRoleRows(), ...BATCH_ROLES].map(
    ([assignedUser, roleName, roleStatus, requestNumber, effectiveStartDate, effectiveEndDate], index) => {
        // Request-level fields always come from the referenced request.
        const request = REQUESTS_BY_ID.get(requestId(requestNumber)) as RequestRecord;
        return {
            id: `sample-role-${index + 1}`,
            assignedUser,
            roleName,
            roleType: roleName,
            roleStatus,
            requestId: request.requestId,
            requestStatus: request.requestStatus,
            programName: request.programName,
            products: request.products,
            region: request.region,
            effectiveStartDate,
            effectiveEndDate
        };
    }
);

// ---------------------------------------------------------------- activities

/*
 * Open activities held by a role's user on that role's request. A role with at
 * least one activity shows "Pending Activities" in the Replace User flow, and
 * its activities must be resolved before the replacement can be reviewed.
 */

const ACTIVITY_NAMES = [
    'Budget Approval',
    'Compliance Review',
    'Data Validation',
    'Final Sign-off',
    'Medical Review',
    'Site Assessment',
    'Contract Review'
];

// Design activities: Reviewer on REQ-0017 and Financial Analyst on REQ-0014 (both Eli Thompson).
const DESIGN_ACTIVITIES: Array<[roleIndex: number, activityName: string]> = [
    [5, 'First Level Review and Recommendation'],
    [7, 'Due Diligence']
];

function generatedActivities(): Array<[roleIndex: number, activityName: string]> {
    // Every fifth generated active role holds one open activity.
    return SAMPLE_REQUEST_USER_ROLES.map((role, roleIndex) => ({ role, roleIndex }))
        .filter(
            ({ role, roleIndex }) =>
                roleIndex >= DESIGN_ROLES.length && roleIndex < FIRST_BATCH_ROLE_INDEX && role.roleStatus === 'Active'
        )
        .filter((_, index) => index % 5 === 0)
        .map(({ roleIndex }, index) => [roleIndex, ACTIVITY_NAMES[index % ACTIVITY_NAMES.length]]);
}

// BAT-0102 handed Milo Johnson's REQ-0056 activity to Priya Raman and left the REQ-0057 one with Milo.
const BATCH_ACTIVITIES: Array<[roleIndex: number, activityName: string, assignedUser: string]> = [
    [FIRST_BATCH_ROLE_INDEX, 'Budget Review', 'Priya Raman'],
    [FIRST_BATCH_ROLE_INDEX + 2, 'Compliance Review', 'Milo Johnson']
];

export const SAMPLE_ACTIVITIES: RequestActivity[] = [
    ...[...DESIGN_ACTIVITIES, ...generatedActivities()].map(
        ([roleIndex, activityName]): [number, string, string] => [
            roleIndex,
            activityName,
            SAMPLE_REQUEST_USER_ROLES[roleIndex].assignedUser
        ]
    ),
    ...BATCH_ACTIVITIES
].map(([roleIndex, activityName, assignedUser], index) => {
    const role = SAMPLE_REQUEST_USER_ROLES[roleIndex];
    return {
        id: `sample-activity-${index + 1}`,
        activityName,
        roleId: role.id,
        requestId: role.requestId,
        programName: role.programName,
        assignedUser
    };
});

// --------------------------------------------------------------------- users

/** Everyone who can be picked as a replacement: current role holders plus users without roles yet. */
export const SAMPLE_USERS: string[] = Array.from(
    new Set([
        ...SAMPLE_REQUEST_USER_ROLES.map((role) => role.assignedUser),
        'Gavin Harris',
        'Jordan Mitchell',
        'Priya Raman',
        'Daniel Okafor',
        'Grace Whitfield'
    ])
).sort((a, b) => a.localeCompare(b));

// ------------------------------------------------------------- permissions

/**
 * Role types that can't be added to requests of a program type (Add Role skips
 * those pairs with "Role not permitted on this request type").
 */
export const SAMPLE_RESTRICTED_ROLE_TYPES: Record<string, string[]> = {
    'Investigator Sponsored Study': ['Budget Reviewer', 'Marketing Coordinator'],
    'Research Collaboration': ['Marketing Coordinator']
};

// ------------------------------------------------------------------ batches

function roleAt(index: number): RequestUserRole {
    return SAMPLE_REQUEST_USER_ROLES[index];
}

function activityFor(roleIndex: number): RequestActivity {
    return SAMPLE_ACTIVITIES.find((activity) => activity.roleId === roleAt(roleIndex).id) as RequestActivity;
}

// Eli Thompson's three inactive Budget Reviewer roles (REQ-0004, REQ-0003, REQ-0002) in the design rows.
const DEACTIVATED_ROLE_INDEXES = [17, 18, 19];

/**
 * Batch history that produced the sample data above: every change points at
 * the role records it ended or created, so the history and the grid agree.
 */
export const SAMPLE_BATCHES: BatchRecord[] = [
    {
        batchId: 'BAT-0101',
        operation: 'deactivate',
        performedBy: 'Reggie Ryan',
        performedOn: '2026-08-17T14:10:00',
        reason: 'Role Change',
        note: 'Eli Thompson moved to the oncology portfolio.',
        roleChanges: DEACTIVATED_ROLE_INDEXES.map((roleIndex, index) => {
            const role = roleAt(roleIndex);
            return {
                id: `BAT-0101-${index + 1}`,
                roleType: role.roleType,
                requestId: role.requestId,
                programName: role.programName,
                previousUser: role.assignedUser,
                newUser: '',
                effectiveDate: role.effectiveEndDate as string,
                endedRoleId: role.id,
                status: 'Active' as const
            };
        }),
        activityChanges: []
    },
    {
        batchId: 'BAT-0102',
        operation: 'replace',
        performedBy: 'Dana Whitfield',
        performedOn: '2026-09-10T09:30:00',
        reason: 'Extended Leave',
        note: "Covering Milo Johnson's requests while on leave through Q4.",
        roleChanges: [0, 2, 4].map((offset, index) => {
            const previous = roleAt(FIRST_BATCH_ROLE_INDEX + offset);
            const next = roleAt(FIRST_BATCH_ROLE_INDEX + offset + 1);
            return {
                id: `BAT-0102-${index + 1}`,
                roleType: previous.roleType,
                requestId: previous.requestId,
                programName: previous.programName,
                previousUser: previous.assignedUser,
                newUser: next.assignedUser,
                effectiveDate: previous.effectiveEndDate as string,
                endedRoleId: previous.id,
                activeRoleId: next.id,
                status: 'Active' as const
            };
        }),
        activityChanges: [
            { offset: 0, newUser: 'Priya Raman', actionTaken: 'Assign to Replacing User' },
            { offset: 2, newUser: '', actionTaken: 'Do Nothing' }
        ].map(({ offset, newUser, actionTaken }, index) => {
            const activity = activityFor(FIRST_BATCH_ROLE_INDEX + offset);
            return {
                id: `BAT-0102-A${index + 1}`,
                activityId: activity.id,
                activityName: activity.activityName,
                requestId: activity.requestId,
                programName: activity.programName,
                previousUser: 'Milo Johnson',
                newUser,
                actionTaken
            };
        })
    },
    {
        batchId: 'BAT-0103',
        operation: 'addrole',
        performedBy: 'Priya Nair',
        performedOn: '2026-09-20T10:05:00',
        reason: '',
        note: '',
        roleChanges: [6, 7, 8, 9].map((offset, index) => {
            const role = roleAt(FIRST_BATCH_ROLE_INDEX + offset);
            return {
                id: `BAT-0103-${index + 1}`,
                roleType: role.roleType,
                requestId: role.requestId,
                programName: role.programName,
                previousUser: '',
                newUser: role.assignedUser,
                effectiveDate: role.effectiveStartDate,
                activeRoleId: role.id,
                status: 'Active' as const
            };
        }),
        activityChanges: []
    }
];
