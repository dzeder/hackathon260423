import { createElement } from 'lwc';
import OhanafyPlanScenarioEngine from 'c/ohanafyPlanScenarioEngine';

jest.mock(
    '@salesforce/apex/OhfyPlanMcpGateway.invokeTool',
    () => ({ default: jest.fn(() => Promise.resolve('{"ok":true}')) }),
    { virtual: true }
);

describe('c-ohanafy-plan-scenario-engine', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders the card heading with the default scenario name', () => {
        const el = createElement('c-ohanafy-plan-scenario-engine', {
            is: OhanafyPlanScenarioEngine,
        });
        document.body.appendChild(el);
        const heading = el.shadowRoot.querySelector('p');
        expect(heading.textContent).toContain('Yellowhammer Q3 Base');
    });
});
