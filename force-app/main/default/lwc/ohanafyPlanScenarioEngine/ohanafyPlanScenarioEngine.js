import { LightningElement, track } from 'lwc';
import invokeTool from '@salesforce/apex/OhfyPlanMcpGateway.invokeTool';

const SCENARIO_OPTIONS = [
    { label: 'Yellowhammer — 6mo base', value: 'yellowhammer-6mo' },
    { label: 'Yellowhammer — stress (hurricane + fuel)', value: 'yellowhammer-stress' },
    { label: 'Yellowhammer — upside (Iron Bowl + heat)', value: 'yellowhammer-upside' }
];

const DEMO_EVENTS = [
    { id: 'iron-bowl-2026', label: 'Iron Bowl weekend', month: '2026-10', revenueDeltaPct: 9.5 },
    { id: 'heat-wave-july', label: 'July heat wave', month: '2026-07', revenueDeltaPct: 3.1 },
    { id: 'gulf-hurricane-cat-3', label: 'Gulf hurricane (Mobile)', month: '2026-09', revenueDeltaPct: -7.5 },
    { id: 'fuel-surcharge-q3', label: 'Diesel price surge', month: '2026-08', revenueDeltaPct: 0 },
    { id: 'memorial-day-kickoff', label: 'Memorial Day grilling', month: '2026-05', revenueDeltaPct: 4.2 },
    { id: 'red-bull-new-flavor', label: 'Red Bull new flavor launch', month: '2026-06', revenueDeltaPct: 1.8 }
];

export default class OhanafyPlanScenarioEngine extends LightningElement {
    scenarioOptions = SCENARIO_OPTIONS;
    @track scenarioId = SCENARIO_OPTIONS[0].value;
    @track appliedIds = [];
    @track snapshot = null;
    @track errorMessage = null;
    @track isLoading = false;

    get events() {
        const applied = new Set(this.appliedIds);
        return DEMO_EVENTS.map((event) => ({
            ...event,
            applied: applied.has(event.id),
            variant: applied.has(event.id) ? 'success' : 'neutral',
            buttonLabel: applied.has(event.id) ? 'Remove' : 'Apply'
        }));
    }

    get hasSnapshot() {
        return this.snapshot !== null;
    }

    get hasError() {
        return this.errorMessage !== null;
    }

    get canReset() {
        return this.appliedIds.length > 0 || this.snapshot !== null;
    }

    get ebitdaTotalLabel() {
        if (!this.snapshot || !this.snapshot.threeStatement) return '—';
        const ebitda = this.snapshot.threeStatement.income.totals.ebitda;
        return `$${Math.round(ebitda).toLocaleString()}k`;
    }

    get eventCountLabel() {
        return String(this.appliedIds.length);
    }

    handleScenarioChange(event) {
        this.scenarioId = event.detail.value;
        this.snapshot = null;
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

    handleReset() {
        this.appliedIds = [];
        this.snapshot = null;
        this.errorMessage = null;
    }

    async handleRunScenario() {
        this.isLoading = true;
        this.errorMessage = null;
        try {
            const events = this.appliedIds.map((id) => {
                const found = DEMO_EVENTS.find((e) => e.id === id);
                return { id, month: found ? found.month : '', revenueDeltaPct: found ? found.revenueDeltaPct : 0 };
            });
            const raw = await invokeTool({
                toolName: 'snapshot',
                payload: JSON.stringify({ scenarioId: this.scenarioId, events })
            });
            this.snapshot = JSON.parse(raw);
        } catch (err) {
            this.errorMessage = (err && err.body && err.body.message) || (err && err.message) || 'Unknown gateway error';
            this.snapshot = null;
        } finally {
            this.isLoading = false;
        }
    }
}
