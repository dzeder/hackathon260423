import { LightningElement, track, wire } from 'lwc';
import invokeCopilot from '@salesforce/apex/OhfyPlanMcpGateway.invokeCopilot';
import listEventTemplates from '@salesforce/apex/OhfyPlanDataReader.listEventTemplates';
import listKnowledgeArticles from '@salesforce/apex/OhfyPlanDataReader.listKnowledgeArticles';

const SCENARIO_OPTIONS = [
    { label: 'Yellowhammer — 6mo base', value: 'yellowhammer-6mo' },
    { label: 'Yellowhammer — stress (hurricane + fuel)', value: 'yellowhammer-stress' },
    { label: 'Yellowhammer — upside (Iron Bowl + heat)', value: 'yellowhammer-upside' }
];

const SUGGESTIONS = [
    'What happens to EBITDA if Iron Bowl weekend lands?',
    'Walk me through revenue for this scenario',
    "What's the biggest downside risk?"
];

const SOURCE_PREVIEW_CHARS = 200;

export default class OhanafyPlanCopilot extends LightningElement {
    scenarioOptions = SCENARIO_OPTIONS;
    suggestions = SUGGESTIONS;
    @track scenarioId = SCENARIO_OPTIONS[0].value;
    @track appliedIds = [];
    @track prompt = '';
    @track response = null;
    @track errorMessage = null;
    @track isLoading = false;
    @track isOpen = false;
    @track eventCatalog = [];
    @track allArticles = [];

    @wire(listEventTemplates, { region: 'AL', category: null })
    wiredEvents({ data }) {
        if (data) {
            this.eventCatalog = data.map((row) => ({ id: row.eventId, label: row.label }));
        }
    }

    @wire(listKnowledgeArticles, { tag: null })
    wiredArticles({ data }) {
        if (data) this.allArticles = data;
    }

    get eventOptions() {
        const applied = new Set(this.appliedIds);
        return this.eventCatalog.map((e) => ({
            ...e,
            applied: applied.has(e.id),
            chipClass: applied.has(e.id)
                ? 'ohfy-copilot__chip ohfy-copilot__chip_on'
                : 'ohfy-copilot__chip'
        }));
    }

    get groundingArticles() {
        const tokens = (this.prompt || '').toLowerCase().split(/\W+/).filter(Boolean);
        if (!tokens.length || !this.allArticles.length) return [];
        return this.allArticles
            .map((a) => {
                const tags = (a.tags || '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
                const score = tags.filter((t) => tokens.some((tok) => t.includes(tok) || tok.includes(t))).length;
                return { article: a, score };
            })
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map((x) => ({
                id: x.article.articleId,
                title: x.article.title,
                preview: (x.article.body || '').slice(0, SOURCE_PREVIEW_CHARS) +
                    ((x.article.body || '').length > SOURCE_PREVIEW_CHARS ? '…' : ''),
                source: x.article.source || ''
            }));
    }

    get hasGroundingArticles() {
        return this.groundingArticles.length > 0;
    }

    get hasResponse() {
        return this.response !== null;
    }

    get hasError() {
        return this.errorMessage !== null;
    }

    get submitDisabled() {
        return this.isLoading || !this.prompt || this.prompt.trim().length === 0;
    }

    get sourceLabel() {
        if (!this.response) return '';
        return this.response.source === 'live' ? 'Claude live' : 'Demo response';
    }

    get sourceBadgeClass() {
        const base = 'ohfy-copilot__badge';
        return this.response && this.response.source === 'live'
            ? `${base} ohfy-copilot__badge_live`
            : `${base} ohfy-copilot__badge_canned`;
    }

    get submitLabel() {
        return this.isLoading ? 'Thinking…' : 'Ask copilot';
    }

    get fabVisible() {
        return !this.isOpen;
    }

    get showEmpty() {
        return !this.hasResponse && !this.hasError && !this.isLoading;
    }

    get eventCountLabel() {
        if (!this.appliedIds.length) return 'baseline only';
        const n = this.appliedIds.length;
        return `${n} applied event${n === 1 ? '' : 's'}`;
    }

    handleOpen() {
        this.isOpen = true;
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

    async submit(text) {
        this.isLoading = true;
        this.errorMessage = null;
        this.response = null;
        try {
            const raw = await invokeCopilot({
                prompt: text,
                scenarioId: this.scenarioId,
                appliedEventIds: this.appliedIds.join(',')
            });
            this.response = JSON.parse(raw);
        } catch (err) {
            this.errorMessage = (err && err.body && err.body.message) || (err && err.message) || 'Unknown copilot error';
        } finally {
            this.isLoading = false;
        }
    }
}
