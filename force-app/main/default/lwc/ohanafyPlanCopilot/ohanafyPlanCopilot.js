import { LightningElement, track } from 'lwc';
import invokeCopilot from '@salesforce/apex/OhfyPlanMcpGateway.invokeCopilot';

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
