import { createElement } from 'lwc';
import OhanafyPlanCopilot from 'c/ohanafyPlanCopilot';
import invokeCopilot from '@salesforce/apex/OhfyPlanMcpGateway.invokeCopilot';
import { createApexTestWireAdapter } from '@salesforce/sfdx-lwc-jest';
import listEventTemplates from '@salesforce/apex/OhfyPlanDataReader.listEventTemplates';
import listKnowledgeArticles from '@salesforce/apex/OhfyPlanDataReader.listKnowledgeArticles';

jest.mock(
    '@salesforce/apex/OhfyPlanMcpGateway.invokeCopilot',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/OhfyPlanDataReader.listEventTemplates',
    () => ({ default: createApexTestWireAdapter(jest.fn()) }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/OhfyPlanDataReader.listKnowledgeArticles',
    () => ({ default: createApexTestWireAdapter(jest.fn()) }),
    { virtual: true }
);

const MOCK_EVENTS = [
    { eventId: 'iron-bowl-2026', label: 'Iron Bowl weekend' },
    { eventId: 'heat-wave-july', label: 'July heat wave' }
];

const MOCK_ARTICLES = [
    {
        articleId: 'sec-football-weekend',
        title: 'SEC football home-game effect',
        body: 'Each home game in Tuscaloosa or Auburn drives +9-11% week-over-week revenue.',
        source: 'CFBD',
        tags: 'sports,football,sec,iron-bowl,alabama'
    },
    {
        articleId: 'hurricane-playbook',
        title: 'Hurricane impact playbook',
        body: 'A Cat 2+ hurricane crossing the Gulf-to-Alabama corridor pulls demand forward.',
        source: 'NOAA',
        tags: 'hurricane,weather,playbook,gulf'
    }
];

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
        listEventTemplates.emit(MOCK_EVENTS);
        listKnowledgeArticles.emit(MOCK_ARTICLES);
        await flush();

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
        listEventTemplates.emit(MOCK_EVENTS);
        listKnowledgeArticles.emit(MOCK_ARTICLES);
        await flush();

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
        listEventTemplates.emit(MOCK_EVENTS);
        listKnowledgeArticles.emit(MOCK_ARTICLES);
        await flush();

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

    it('surfaces grounding articles when the prompt overlaps tags', async () => {
        const el = createElement('c-ohanafy-plan-copilot', { is: OhanafyPlanCopilot });
        document.body.appendChild(el);
        listEventTemplates.emit(MOCK_EVENTS);
        listKnowledgeArticles.emit(MOCK_ARTICLES);
        await flush();

        openDrawer(el);
        await flush();

        const textarea = el.shadowRoot.querySelector('[data-testid="copilot-prompt"]');
        textarea.value = 'iron bowl tailgate weekend';
        textarea.dispatchEvent(new CustomEvent('change', { detail: { value: 'iron bowl tailgate weekend' } }));
        await flush();

        const grounding = el.shadowRoot.querySelector('[data-testid="copilot-grounding"]');
        expect(grounding).not.toBeNull();
        expect(grounding.textContent).toContain('SEC football home-game effect');
    });
});
