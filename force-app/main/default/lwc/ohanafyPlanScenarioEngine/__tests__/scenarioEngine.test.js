import { createElement } from 'lwc';
import OhanafyPlanScenarioEngine from 'c/ohanafyPlanScenarioEngine';
import { createApexTestWireAdapter } from '@salesforce/sfdx-lwc-jest';
import listEventTemplates from '@salesforce/apex/OhfyPlanDataReader.listEventTemplates';

const mockInvokeTool = jest.fn();
const mockRecordDecision = jest.fn();

jest.mock(
    '@salesforce/apex/OhfyPlanMcpGateway.invokeTool',
    () => ({ default: (...args) => mockInvokeTool(...args) }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/OhfyPlanDataReader.listEventTemplates',
    () => ({ default: createApexTestWireAdapter(jest.fn()) }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/OhfyPlanDataReader.recordDecision',
    () => ({ default: (...args) => mockRecordDecision(...args) }),
    { virtual: true }
);

const MOCK_EVENT_TEMPLATES = [
    { eventId: 'iron-bowl-2026', label: 'Iron Bowl weekend', month: '2026-10', revenueDeltaPct: 9.5, category: 'sports' },
    { eventId: 'heat-wave-july', label: 'July heat wave', month: '2026-07', revenueDeltaPct: 3.1, category: 'weather' },
    { eventId: 'gulf-hurricane-cat-3', label: 'Gulf hurricane', month: '2026-09', revenueDeltaPct: -7.5, category: 'weather' },
    { eventId: 'fuel-surcharge-q3', label: 'Diesel price surge', month: '2026-08', revenueDeltaPct: 0, category: 'macro' },
    { eventId: 'memorial-day-kickoff', label: 'Memorial Day grilling', month: '2026-05', revenueDeltaPct: 4.2, category: 'holiday' },
    { eventId: 'red-bull-new-flavor', label: 'Red Bull new flavor', month: '2026-06', revenueDeltaPct: 1.8, category: 'supplier' }
];

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function runSnapshot() {
    return {
        eventCount: 1,
        baseline: [
            { month: '2026-05', revenue: 4820, cogs: 3180, opex: 920, gm: 1640, ebitda: 720 },
            { month: '2026-06', revenue: 5210, cogs: 3420, opex: 940, gm: 1790, ebitda: 850 },
            { month: '2026-07', revenue: 5480, cogs: 3590, opex: 960, gm: 1890, ebitda: 930 },
            { month: '2026-08', revenue: 5310, cogs: 3480, opex: 945, gm: 1830, ebitda: 885 },
            { month: '2026-09', revenue: 5050, cogs: 3310, opex: 935, gm: 1740, ebitda: 805 },
            { month: '2026-10', revenue: 4780, cogs: 3130, opex: 920, gm: 1650, ebitda: 730 }
        ],
        scenario: [
            { month: '2026-05', revenue: 4820, cogs: 3180, opex: 920, gm: 1640, ebitda: 720 },
            { month: '2026-06', revenue: 5210, cogs: 3420, opex: 940, gm: 1790, ebitda: 850 },
            { month: '2026-07', revenue: 5480, cogs: 3590, opex: 960, gm: 1890, ebitda: 930 },
            { month: '2026-08', revenue: 5310, cogs: 3480, opex: 945, gm: 1830, ebitda: 885 },
            { month: '2026-09', revenue: 5050, cogs: 3310, opex: 935, gm: 1740, ebitda: 805 },
            { month: '2026-10', revenue: 4780, cogs: 3130, opex: 920, gm: 1650, ebitda: 730 }
        ],
        threeStatement: {
            income: { totals: { revenue: 30650, cogs: 20110, opex: 5620, gm: 10540, ebitda: 4920 } },
            balance: {
                closingCashBalance: 1400,
                accountsReceivable: 2100,
                inventory: 1800,
                accountsPayable: 1500,
                equity: 8500
            },
            cash: { operating: 4900, investing: -250, financing: -1200, netChange: 3450 }
        }
    };
}

function findEventButton(el, id) {
    return Array.from(el.shadowRoot.querySelectorAll('button')).find(
        (b) => b.dataset && b.dataset.id === id
    );
}

function findLightningButton(el, label) {
    return Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find(
        (b) => b.label === label
    );
}

describe('c-ohanafy-plan-scenario-engine', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        mockInvokeTool.mockReset();
        mockRecordDecision.mockReset();
    });

    it('renders the scenario picker and the event library', async () => {
        const el = createElement('c-ohanafy-plan-scenario-engine', {
            is: OhanafyPlanScenarioEngine
        });
        document.body.appendChild(el);
        listEventTemplates.emit(MOCK_EVENT_TEMPLATES);
        await flush();

        const scenario = Array.from(el.shadowRoot.querySelectorAll('lightning-combobox')).find(
            (c) => c.label === 'Scenario'
        );
        expect(scenario).toBeTruthy();

        const items = el.shadowRoot.querySelectorAll('.ohfy-event');
        expect(items.length).toBeGreaterThanOrEqual(5);
    });

    it('toggling an event applies a selected visual state', async () => {
        const el = createElement('c-ohanafy-plan-scenario-engine', {
            is: OhanafyPlanScenarioEngine
        });
        document.body.appendChild(el);
        listEventTemplates.emit(MOCK_EVENT_TEMPLATES);
        await flush();

        const before = findEventButton(el, 'iron-bowl-2026');
        expect(before).toBeTruthy();
        const beforeRow = before.closest('li');
        expect(beforeRow.classList.contains('ohfy-event_on')).toBe(false);

        before.dispatchEvent(new CustomEvent('click'));
        await flush();

        const after = findEventButton(el, 'iron-bowl-2026');
        const afterRow = after.closest('li');
        expect(afterRow.classList.contains('ohfy-event_on')).toBe(true);
    });

    it('category chip filters the event list', async () => {
        const el = createElement('c-ohanafy-plan-scenario-engine', {
            is: OhanafyPlanScenarioEngine
        });
        document.body.appendChild(el);
        listEventTemplates.emit(MOCK_EVENT_TEMPLATES);
        await flush();

        const weatherChip = Array.from(el.shadowRoot.querySelectorAll('.ohfy-chip')).find(
            (b) => b.dataset.id === 'weather'
        );
        weatherChip.dispatchEvent(new CustomEvent('click'));
        await flush();

        const rows = el.shadowRoot.querySelectorAll('.ohfy-event');
        expect(rows.length).toBe(2);
    });

    it('runs a scenario and renders the snapshot summary on success', async () => {
        mockInvokeTool.mockResolvedValueOnce(JSON.stringify(runSnapshot()));

        const el = createElement('c-ohanafy-plan-scenario-engine', {
            is: OhanafyPlanScenarioEngine
        });
        document.body.appendChild(el);
        listEventTemplates.emit(MOCK_EVENT_TEMPLATES);
        await flush();

        const runButton = findLightningButton(el, 'Run scenario');
        runButton.dispatchEvent(new CustomEvent('click'));
        await flush();
        await flush();

        expect(mockInvokeTool).toHaveBeenCalledWith({
            toolName: 'snapshot',
            payload: expect.any(String)
        });

        const summary = el.shadowRoot.querySelector('[data-testid="snapshot-summary"]');
        expect(summary).toBeTruthy();
        expect(summary.textContent).toContain('$4.9M');
    });

    it('renders a gateway error banner when invokeTool rejects', async () => {
        mockInvokeTool.mockRejectedValueOnce({ body: { message: 'gateway down' } });

        const el = createElement('c-ohanafy-plan-scenario-engine', {
            is: OhanafyPlanScenarioEngine
        });
        document.body.appendChild(el);
        listEventTemplates.emit(MOCK_EVENT_TEMPLATES);
        await flush();

        const runButton = findLightningButton(el, 'Run scenario');
        runButton.dispatchEvent(new CustomEvent('click'));
        await flush();
        await flush();

        const banner = el.shadowRoot.querySelector('[data-testid="gateway-error"]');
        expect(banner).toBeTruthy();
        expect(banner.textContent).toContain('gateway down');
    });

    it('records a decision via Apex when Accept scenario is clicked', async () => {
        mockInvokeTool.mockResolvedValueOnce(JSON.stringify(runSnapshot()));
        mockRecordDecision.mockResolvedValueOnce('11111111-2222-3333-4444-555555555555');

        const el = createElement('c-ohanafy-plan-scenario-engine', {
            is: OhanafyPlanScenarioEngine
        });
        document.body.appendChild(el);
        listEventTemplates.emit(MOCK_EVENT_TEMPLATES);
        await flush();

        findLightningButton(el, 'Run scenario').dispatchEvent(new CustomEvent('click'));
        await flush();
        await flush();

        const acceptButton = el.shadowRoot.querySelector('[data-testid="accept-scenario"]');
        expect(acceptButton).toBeTruthy();
        expect(acceptButton.disabled).toBe(false);
        acceptButton.dispatchEvent(new CustomEvent('click'));
        await flush();
        await flush();

        expect(mockRecordDecision).toHaveBeenCalledWith(
            expect.objectContaining({
                scenarioId: 'yellowhammer-6mo',
                decisionType: 'accept'
            })
        );
    });
});
