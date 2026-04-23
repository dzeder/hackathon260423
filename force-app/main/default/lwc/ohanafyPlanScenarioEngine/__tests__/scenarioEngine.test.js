import { createElement } from 'lwc';
import OhanafyPlanScenarioEngine from 'c/ohanafyPlanScenarioEngine';

const mockInvokeTool = jest.fn();

jest.mock(
    '@salesforce/apex/OhfyPlanMcpGateway.invokeTool',
    () => ({ default: (...args) => mockInvokeTool(...args) }),
    { virtual: true }
);

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('c-ohanafy-plan-scenario-engine', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        mockInvokeTool.mockReset();
    });

    it('renders the scenario card and the demo events', () => {
        const el = createElement('c-ohanafy-plan-scenario-engine', {
            is: OhanafyPlanScenarioEngine
        });
        document.body.appendChild(el);

        const combobox = el.shadowRoot.querySelector('lightning-combobox');
        expect(combobox.label).toBe('Scenario');

        const items = el.shadowRoot.querySelectorAll('li');
        expect(items.length).toBeGreaterThanOrEqual(5);
    });

    it('toggling an event flips its Apply/Remove button label', async () => {
        const el = createElement('c-ohanafy-plan-scenario-engine', {
            is: OhanafyPlanScenarioEngine
        });
        document.body.appendChild(el);

        const ironBowlBtn = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find(
            (b) => b.dataset && b.dataset.id === 'iron-bowl-2026'
        );
        expect(ironBowlBtn).toBeTruthy();
        expect(ironBowlBtn.label).toBe('Apply');

        ironBowlBtn.dispatchEvent(new CustomEvent('click'));
        await flush();

        const afterToggle = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find(
            (b) => b.dataset && b.dataset.id === 'iron-bowl-2026'
        );
        expect(afterToggle.label).toBe('Remove');
    });

    it('runs a scenario and renders the EBITDA summary on success', async () => {
        mockInvokeTool.mockResolvedValueOnce(
            JSON.stringify({
                eventCount: 1,
                forecast: [],
                threeStatement: {
                    income: { totals: { revenue: 0, cogs: 0, opex: 0, gm: 0, ebitda: 1234 } },
                    balance: {
                        closingCashBalance: 0,
                        accountsReceivable: 0,
                        inventory: 0,
                        accountsPayable: 0,
                        equity: 0
                    },
                    cash: { operating: 0, investing: 0, financing: 0, netChange: 0 }
                }
            })
        );

        const el = createElement('c-ohanafy-plan-scenario-engine', {
            is: OhanafyPlanScenarioEngine
        });
        document.body.appendChild(el);

        const runButton = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find(
            (b) => b.label === 'Run scenario'
        );
        runButton.dispatchEvent(new CustomEvent('click'));
        await flush();
        await flush();

        expect(mockInvokeTool).toHaveBeenCalledWith({
            toolName: 'snapshot',
            payload: expect.any(String)
        });

        const summary = el.shadowRoot.querySelector('[data-testid="snapshot-summary"]');
        expect(summary).toBeTruthy();
        expect(summary.textContent).toContain('1,234');
    });

    it('renders a gateway error banner when invokeTool rejects', async () => {
        mockInvokeTool.mockRejectedValueOnce({ body: { message: 'gateway down' } });

        const el = createElement('c-ohanafy-plan-scenario-engine', {
            is: OhanafyPlanScenarioEngine
        });
        document.body.appendChild(el);

        const runButton = Array.from(el.shadowRoot.querySelectorAll('lightning-button')).find(
            (b) => b.label === 'Run scenario'
        );
        runButton.dispatchEvent(new CustomEvent('click'));
        await flush();
        await flush();

        const banner = el.shadowRoot.querySelector('[data-testid="gateway-error"]');
        expect(banner).toBeTruthy();
        expect(banner.textContent).toContain('gateway down');
    });
});
