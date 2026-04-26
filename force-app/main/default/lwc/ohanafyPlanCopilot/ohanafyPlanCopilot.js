import { LightningElement, track } from 'lwc';
import invokeCopilot from '@salesforce/apex/OhfyPlanMcpGateway.invokeCopilot';
import loadActiveThread from '@salesforce/apex/OhfyPlanMcpGateway.loadActiveThread';
import startNewThread from '@salesforce/apex/OhfyPlanMcpGateway.startNewThread';

const SCENARIO_OPTIONS = [
    { label: 'Yellowhammer — 6mo base', value: 'yellowhammer-6mo' },
    { label: 'Yellowhammer — stress (hurricane + fuel)', value: 'yellowhammer-stress' },
    { label: 'Yellowhammer — upside (Iron Bowl + heat)', value: 'yellowhammer-upside' }
];

const EVENT_OPTIONS = [
    { id: 'iron-bowl-2026', label: 'Iron Bowl weekend' },
    { id: 'heat-wave-july', label: 'July heat wave' },
    { id: 'gulf-hurricane-cat-3', label: 'Gulf hurricane (Mobile)' },
    { id: 'fuel-surcharge-q3', label: 'Diesel price surge' },
    { id: 'memorial-day-kickoff', label: 'Memorial Day grilling' },
    { id: 'red-bull-new-flavor', label: 'Red Bull new flavor launch' }
];

const SUGGESTIONS = [
    'What happens to EBITDA if Iron Bowl weekend lands?',
    'Walk me through revenue for this scenario',
    "What's the biggest downside risk?"
];

// Parses assistant messages whose text is a JSON envelope of the shape
// {text, bullets, citations}. Returns null when the message is plain prose.
function parseCopilotShape(text) {
    if (!text || typeof text !== 'string') return null;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (
            parsed &&
            typeof parsed.text === 'string' &&
            Array.isArray(parsed.bullets) &&
            Array.isArray(parsed.citations)
        ) {
            return {
                text: parsed.text,
                bullets: parsed.bullets.filter((b) => typeof b === 'string'),
                citations: parsed.citations.filter((c) => typeof c === 'string')
            };
        }
    } catch (e) {
        /* not JSON; fall through */
    }
    return null;
}

export default class OhanafyPlanCopilot extends LightningElement {
    scenarioOptions = SCENARIO_OPTIONS;
    suggestions = SUGGESTIONS;

    @track scenarioId = SCENARIO_OPTIONS[0].value;
    @track appliedIds = [];
    @track prompt = '';
    @track errorMessage = null;
    @track isLoading = false;
    @track isOpen = false;

    // Thread state — mirrors the web-app CopilotPanel for parity.
    @track conversationId = null;
    @track historyLoaded = false;
    @track messages = [];

    get eventOptions() {
        const applied = new Set(this.appliedIds);
        return EVENT_OPTIONS.map((e) => ({
            ...e,
            applied: applied.has(e.id),
            chipClass: applied.has(e.id)
                ? 'ohfy-copilot__chip ohfy-copilot__chip_on'
                : 'ohfy-copilot__chip'
        }));
    }

    get hasError() {
        return this.errorMessage !== null;
    }

    get submitDisabled() {
        return (
            this.isLoading ||
            !this.prompt ||
            this.prompt.trim().length === 0 ||
            !this.historyLoaded
        );
    }

    get submitLabel() {
        return this.isLoading ? 'Thinking…' : 'Ask copilot';
    }

    get fabVisible() {
        return !this.isOpen;
    }

    get showEmpty() {
        return (
            this.historyLoaded &&
            !this.messages.length &&
            !this.hasError &&
            !this.isLoading
        );
    }

    get eventCountLabel() {
        if (!this.appliedIds.length) return 'baseline only';
        const n = this.appliedIds.length;
        return `${n} applied event${n === 1 ? '' : 's'}`;
    }

    get promptPlaceholder() {
        return this.historyLoaded
            ? 'Ask about EBITDA, revenue, or specific events…'
            : 'Loading prior conversation…';
    }

    get threadCountLabel() {
        if (!this.messages.length) return '';
        const n = this.messages.length;
        return ` · ${n} message${n === 1 ? '' : 's'}`;
    }

    // Templates can't call methods, so pre-compute derived per-message fields.
    get enrichedMessages() {
        return this.messages.map((m) => {
            const isUser = m.role === 'user';
            const bubbleClass = isUser
                ? 'ohfy-copilot__bubble ohfy-copilot__bubble_user'
                : 'ohfy-copilot__bubble ohfy-copilot__bubble_assistant';
            const sourceLabel =
                m.source === 'live'
                    ? 'Claude live'
                    : m.source === 'canned'
                      ? 'Demo response'
                      : '';
            const sourceBadgeClass =
                m.source === 'live'
                    ? 'ohfy-copilot__badge ohfy-copilot__badge_live'
                    : 'ohfy-copilot__badge ohfy-copilot__badge_canned';
            return {
                ...m,
                isUser,
                bubbleClass,
                sourceLabel,
                sourceBadgeClass,
                hasBullets: Array.isArray(m.bullets) && m.bullets.length > 0,
                hasCitations: Array.isArray(m.citations) && m.citations.length > 0
            };
        });
    }

    handleOpen() {
        this.isOpen = true;
        if (!this.historyLoaded) {
            this.loadHistory();
        }
    }

    handleClose() {
        this.isOpen = false;
    }

    handleScenarioChange(event) {
        this.scenarioId = event.detail.value;
    }

    handleEventToggle(event) {
        const id = event.currentTarget.dataset.id;
        if (!id) return;
        const idx = this.appliedIds.indexOf(id);
        if (idx === -1) {
            this.appliedIds = [...this.appliedIds, id];
        } else {
            this.appliedIds = this.appliedIds.filter((e) => e !== id);
        }
    }

    handlePromptChange(event) {
        this.prompt = event.target.value;
    }

    handleSuggestion(event) {
        const val = event.currentTarget.dataset.value;
        this.prompt = val;
        this.submit(val);
    }

    handleSubmit() {
        if (this.submitDisabled) return;
        this.submit(this.prompt);
    }

    async loadHistory() {
        try {
            const raw = await loadActiveThread();
            const body = JSON.parse(raw);
            this.conversationId = body.conversationId || null;
            const stored = Array.isArray(body.messages) ? body.messages : [];
            this.messages = stored.map((m) => {
                const base = {
                    id: m.id || `h-${m.createdAt || Date.now()}`,
                    role: m.role,
                    text: m.text || ''
                };
                if (m.role === 'assistant') {
                    const shape = parseCopilotShape(m.text);
                    if (shape) {
                        return { ...base, ...shape };
                    }
                }
                return base;
            });
        } catch (err) {
            // Don't block the UI — start fresh if history load fails.
            this.messages = [];
            // eslint-disable-next-line no-console
            console.warn('[ohanafyPlanCopilot] loadHistory failed', err);
        } finally {
            this.historyLoaded = true;
        }
    }

    async handleNewChat() {
        this.errorMessage = null;
        try {
            const raw = await startNewThread();
            const body = JSON.parse(raw);
            this.conversationId = body.conversationId || null;
            this.messages = [];
        } catch (err) {
            this.errorMessage =
                (err && err.body && err.body.message) ||
                (err && err.message) ||
                'Could not start new chat';
        }
    }

    async submit(text) {
        const finalPrompt = (text || '').trim();
        if (!finalPrompt) return;
        this.isLoading = true;
        this.errorMessage = null;
        const userMsgId = `u-${Date.now()}`;
        const pendingId = `a-pending-${Date.now()}`;
        this.messages = [
            ...this.messages,
            { id: userMsgId, role: 'user', text: finalPrompt },
            { id: pendingId, role: 'assistant', text: 'Thinking…', pending: true }
        ];
        this.prompt = '';
        try {
            const raw = await invokeCopilot({
                prompt: finalPrompt,
                scenarioId: this.scenarioId,
                appliedEventIds: this.appliedIds.join(','),
                conversationId: this.conversationId
            });
            const body = JSON.parse(raw);
            if (body.conversationId) this.conversationId = body.conversationId;
            const assistantMsg = {
                id: `a-${Date.now()}`,
                role: 'assistant',
                text: body.text,
                bullets: Array.isArray(body.bullets) ? body.bullets : [],
                citations: Array.isArray(body.citations) ? body.citations : [],
                source: body.source
            };
            this.messages = this.messages
                .filter((m) => m.id !== pendingId)
                .concat(assistantMsg);
        } catch (err) {
            this.errorMessage =
                (err && err.body && err.body.message) ||
                (err && err.message) ||
                'Unknown copilot error';
            this.messages = this.messages.filter((m) => m.id !== pendingId);
        } finally {
            this.isLoading = false;
        }
    }
}
