import { createElement } from 'lwc';
import OhanafyPlanCopilot from 'c/ohanafyPlanCopilot';
import invokeCopilot from '@salesforce/apex/OhfyPlanMcpGateway.invokeCopilot';
import loadActiveThread from '@salesforce/apex/OhfyPlanMcpGateway.loadActiveThread';
import startNewThread from '@salesforce/apex/OhfyPlanMcpGateway.startNewThread';
import { createApexTestWireAdapter } from '@salesforce/sfdx-lwc-jest';
import listEventTemplates from '@salesforce/apex/OhfyPlanDataReader.listEventTemplates';
import listKnowledgeArticles from '@salesforce/apex/OhfyPlanDataReader.listKnowledgeArticles';

jest.mock(
    '@salesforce/apex/OhfyPlanMcpGateway.invokeCopilot',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/OhfyPlanMcpGateway.loadActiveThread',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/OhfyPlanMcpGateway.startNewThread',
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

async function openAndWaitForHistory(el) {
    openDrawer(el);
    // Loading + microtask drain for loadActiveThread response
    await flush();
    await flush();
    await flush();
}

describe('c-ohanafy-plan-copilot', () => {
    beforeEach(() => {
        // Default: empty history on open.
        loadActiveThread.mockResolvedValue(
            JSON.stringify({ conversationId: 'c-initial', messages: [], threads: [] })
        );
        startNewThread.mockResolvedValue(
            JSON.stringify({ conversationId: 'c-fresh', messages: [], threads: [] })
        );
    });

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

        await openAndWaitForHistory(el);

        const textarea = el.shadowRoot.querySelector('[data-testid="copilot-prompt"]');
        const suggestions = el.shadowRoot.querySelector('[data-testid="copilot-suggestions"]');
        expect(textarea).not.toBeNull();
        expect(suggestions).not.toBeNull();
    });

    it('loads active thread on open', async () => {
        const el = createElement('c-ohanafy-plan-copilot', { is: OhanafyPlanCopilot });
        document.body.appendChild(el);

        await openAndWaitForHistory(el);

        expect(loadActiveThread).toHaveBeenCalled();
    });

    it('submit is disabled when prompt is empty', async () => {
        const el = createElement('c-ohanafy-plan-copilot', { is: OhanafyPlanCopilot });
        document.body.appendChild(el);
        listEventTemplates.emit(MOCK_EVENTS);
        listKnowledgeArticles.emit(MOCK_ARTICLES);
        await flush();

        await openAndWaitForHistory(el);

        const submit = el.shadowRoot.querySelector('[data-testid="copilot-submit"]');
        expect(submit.disabled).toBe(true);
    });

    it('calls apex invokeCopilot with the typed prompt and threads conversationId', async () => {
        invokeCopilot.mockResolvedValue(
            JSON.stringify({
                text: 'EBITDA lift of 3.9%',
                bullets: ['Baseline $4,920k'],
                citations: ['three-statement'],
                source: 'canned',
                conversationId: 'c-initial'
            })
        );

        const el = createElement('c-ohanafy-plan-copilot', { is: OhanafyPlanCopilot });
        document.body.appendChild(el);
        listEventTemplates.emit(MOCK_EVENTS);
        listKnowledgeArticles.emit(MOCK_ARTICLES);
        await flush();

        await openAndWaitForHistory(el);

        const textarea = el.shadowRoot.querySelector('[data-testid="copilot-prompt"]');
        textarea.value = 'what happens to ebitda';
        textarea.dispatchEvent(
            new CustomEvent('change', { detail: { value: 'what happens to ebitda' } })
        );

        await flush();
        const submit = el.shadowRoot.querySelector('[data-testid="copilot-submit"]');
        submit.click();
        await flush();
        await flush();

        expect(invokeCopilot).toHaveBeenCalledWith(
            expect.objectContaining({
                prompt: 'what happens to ebitda',
                scenarioId: 'yellowhammer-6mo',
                conversationId: 'c-initial'
            })
        );
    });

    it('surfaces grounding articles when the prompt overlaps tags', async () => {
        const el = createElement('c-ohanafy-plan-copilot', { is: OhanafyPlanCopilot });
        document.body.appendChild(el);
        listEventTemplates.emit(MOCK_EVENTS);
        listKnowledgeArticles.emit(MOCK_ARTICLES);
        await flush();

        await openAndWaitForHistory(el);

        const textarea = el.shadowRoot.querySelector('[data-testid="copilot-prompt"]');
        textarea.value = 'iron bowl tailgate weekend';
        textarea.dispatchEvent(new CustomEvent('change', { detail: { value: 'iron bowl tailgate weekend' } }));
        await flush();

        const grounding = el.shadowRoot.querySelector('[data-testid="copilot-grounding"]');
        expect(grounding).not.toBeNull();
        expect(grounding.textContent).toContain('SEC football home-game effect');
    });

    it('rehydrates prior messages from history', async () => {
        loadActiveThread.mockResolvedValue(
            JSON.stringify({
                conversationId: 'c-old',
                messages: [
                    { id: 'h1', role: 'user', text: 'what happens to ebitda', createdAt: 1 },
                    {
                        id: 'h2',
                        role: 'assistant',
                        text: JSON.stringify({
                            text: 'EBITDA up 3.9%',
                            bullets: ['$4,920k baseline'],
                            citations: ['three-statement']
                        }),
                        createdAt: 2
                    }
                ],
                threads: []
            })
        );

        const el = createElement('c-ohanafy-plan-copilot', { is: OhanafyPlanCopilot });
        document.body.appendChild(el);

        await openAndWaitForHistory(el);

        const bubbles = el.shadowRoot.querySelectorAll('[data-testid="copilot-message"]');
        expect(bubbles.length).toBe(2);
    });

    it('resets messages when New chat is clicked', async () => {
        loadActiveThread.mockResolvedValue(
            JSON.stringify({
                conversationId: 'c-old',
                messages: [
                    { id: 'h1', role: 'user', text: 'q', createdAt: 1 },
                    { id: 'h2', role: 'assistant', text: 'a', createdAt: 2 }
                ],
                threads: []
            })
        );

        const el = createElement('c-ohanafy-plan-copilot', { is: OhanafyPlanCopilot });
        document.body.appendChild(el);

        await openAndWaitForHistory(el);

        const newChat = el.shadowRoot.querySelector('[data-testid="copilot-new-chat"]');
        newChat.click();
        await flush();
        await flush();

        expect(startNewThread).toHaveBeenCalled();
        const bubbles = el.shadowRoot.querySelectorAll('[data-testid="copilot-message"]');
        expect(bubbles.length).toBe(0);
    });
});
