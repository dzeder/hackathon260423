import { createElement } from 'lwc';
import OhanafyPlanCopilot from 'c/ohanafyPlanCopilot';
import invokeCopilot from '@salesforce/apex/OhfyPlanMcpGateway.invokeCopilot';

jest.mock(
    '@salesforce/apex/OhfyPlanMcpGateway.invokeCopilot',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

function flush() {
    return Promise.resolve();
}

function openDrawer(el) {
    const fab = el.shadowRoot.querySelector('[data-testid="copilot-open"]');
    fab.click();
}

describe('c-ohanafy-plan-copilot', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('renders a launcher FAB and opens the drawer on click', async () => {
        const el = createElement('c-ohanafy-plan-copilot', { is: OhanafyPlanCopilot });
        document.body.appendChild(el);

        const fab = el.shadowRoot.querySelector('[data-testid="copilot-open"]');
        expect(fab).not.toBeNull();

        openDrawer(el);
        await flush();

        const textarea = el.shadowRoot.querySelector('[data-testid="copilot-prompt"]');
        const suggestions = el.shadowRoot.querySelector('[data-testid="copilot-suggestions"]');
        expect(textarea).not.toBeNull();
        expect(suggestions).not.toBeNull();
    });

    it('submit is disabled when prompt is empty', async () => {
        const el = createElement('c-ohanafy-plan-copilot', { is: OhanafyPlanCopilot });
        document.body.appendChild(el);

        openDrawer(el);
        await flush();

        const submit = el.shadowRoot.querySelector('[data-testid="copilot-submit"]');
        expect(submit.disabled).toBe(true);
    });

    it('calls apex invokeCopilot with the typed prompt', async () => {
        invokeCopilot.mockResolvedValue(
            JSON.stringify({
                text: 'EBITDA lift of 3.9%',
                bullets: ['Baseline $4,920k'],
                citations: ['three-statement'],
                source: 'canned'
            })
        );

        const el = createElement('c-ohanafy-plan-copilot', { is: OhanafyPlanCopilot });
        document.body.appendChild(el);

        openDrawer(el);
        await flush();

        const textarea = el.shadowRoot.querySelector('[data-testid="copilot-prompt"]');
        textarea.value = 'what happens to ebitda';
        textarea.dispatchEvent(new CustomEvent('change', { detail: { value: 'what happens to ebitda' } }));

        await flush();
        const submit = el.shadowRoot.querySelector('[data-testid="copilot-submit"]');
        submit.click();
        await flush();
        await flush();

        expect(invokeCopilot).toHaveBeenCalledWith(
            expect.objectContaining({ prompt: 'what happens to ebitda', scenarioId: 'yellowhammer-6mo' })
        );
    });
});
