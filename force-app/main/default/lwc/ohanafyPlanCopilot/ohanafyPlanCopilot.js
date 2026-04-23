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

    get eventOptions() {
        const applied = new Set(this.appliedIds);
        return EVENT_OPTIONS.map((e) => ({
            ...e,
            applied: applied.has(e.id),
            variant: applied.has(e.id) ? 'success' : 'neutral',
            buttonLabel: applied.has(e.id) ? 'Applied' : 'Apply'
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
        const base = 'slds-badge slds-m-left_x-small';
        return this.response && this.response.source === 'live'
            ? `${base} slds-theme_success`
            : `${base} slds-badge_lightest`;
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
        this.prompt = event.currentTarget.dataset.value;
    }

    async handleSubmit() {
        if (this.submitDisabled) return;
        this.isLoading = true;
        this.errorMessage = null;
        this.response = null;
        try {
            const raw = await invokeCopilot({
                prompt: this.prompt,
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
