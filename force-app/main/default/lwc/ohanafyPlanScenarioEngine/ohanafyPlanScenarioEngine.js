import { LightningElement, track } from 'lwc';
import invokeTool from '@salesforce/apex/OhfyPlanMcpGateway.invokeTool';

const SCENARIO_OPTIONS = [
    { label: 'Yellowhammer — 6mo base', value: 'yellowhammer-6mo' },
    { label: 'Yellowhammer — stress (hurricane + fuel)', value: 'yellowhammer-stress' },
    { label: 'Yellowhammer — upside (Iron Bowl + heat)', value: 'yellowhammer-upside' }
];

const DEMO_EVENTS = [
    { id: 'iron-bowl-2026', label: 'Iron Bowl weekend', month: '2026-10', revenueDeltaPct: 9.5, category: 'sports' },
    { id: 'heat-wave-july', label: 'July heat wave', month: '2026-07', revenueDeltaPct: 3.1, category: 'weather' },
    { id: 'gulf-hurricane-cat-3', label: 'Gulf hurricane (Mobile)', month: '2026-09', revenueDeltaPct: -7.5, category: 'weather' },
    { id: 'fuel-surcharge-q3', label: 'Diesel price surge', month: '2026-08', revenueDeltaPct: 0, category: 'macro' },
    { id: 'memorial-day-kickoff', label: 'Memorial Day grilling', month: '2026-05', revenueDeltaPct: 4.2, category: 'holiday' },
    { id: 'red-bull-new-flavor', label: 'Red Bull new flavor launch', month: '2026-06', revenueDeltaPct: 1.8, category: 'supplier' }
];

const CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'sports', label: 'Sports' },
    { id: 'weather', label: 'Weather' },
    { id: 'holiday', label: 'Holiday' },
    { id: 'macro', label: 'Macro' },
    { id: 'supplier', label: 'Supplier' }
];

const SORT_OPTIONS = [
    { label: 'Highest impact', value: 'impact' },
    { label: 'Month', value: 'month' },
    { label: 'Name (A→Z)', value: 'name' }
];

function fmtUsd(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}M`;
    return `$${Math.round(n).toLocaleString()}k`;
}

function fmtPctDelta(scenario, baseline) {
    if (!baseline) return '—';
    const d = ((scenario - baseline) / baseline) * 100;
    const sign = d > 0 ? '+' : '';
    return `${sign}${d.toFixed(1)}%`;
}

function sumKey(months, key) {
    if (!Array.isArray(months)) return 0;
    return months.reduce((acc, m) => acc + (typeof m[key] === 'number' ? m[key] : 0), 0);
}

export default class OhanafyPlanScenarioEngine extends LightningElement {
    scenarioOptions = SCENARIO_OPTIONS;
    sortOptions = SORT_OPTIONS;
    @track scenarioId = SCENARIO_OPTIONS[0].value;
    @track appliedIds = [];
    @track snapshot = null;
    @track errorMessage = null;
    @track isLoading = false;
    @track searchQuery = '';
    @track categoryFilter = 'all';
    @track sortKey = 'impact';

    get categoryChips() {
        return CATEGORIES.map((c) => ({
            ...c,
            className:
                c.id === this.categoryFilter
                    ? 'ohfy-chip ohfy-chip_active'
                    : 'ohfy-chip'
        }));
    }

    get filteredEvents() {
        const q = (this.searchQuery || '').trim().toLowerCase();
        const filtered = DEMO_EVENTS.filter((e) => {
            if (this.categoryFilter !== 'all' && e.category !== this.categoryFilter) return false;
            if (q && !e.label.toLowerCase().includes(q)) return false;
            return true;
        });
        const sorted = [...filtered];
        if (this.sortKey === 'impact') {
            sorted.sort((a, b) => Math.abs(b.revenueDeltaPct) - Math.abs(a.revenueDeltaPct));
        } else if (this.sortKey === 'month') {
            sorted.sort((a, b) => a.month.localeCompare(b.month));
        } else {
            sorted.sort((a, b) => a.label.localeCompare(b.label));
        }
        return sorted;
    }

    get events() {
        const applied = new Set(this.appliedIds);
        return this.filteredEvents.map((event) => {
            const isOn = applied.has(event.id);
            const delta = event.revenueDeltaPct;
            const deltaClass =
                delta > 0
                    ? 'ohfy-event__delta ohfy-event__delta_up'
                    : delta < 0
                        ? 'ohfy-event__delta ohfy-event__delta_down'
                        : 'ohfy-event__delta';
            return {
                ...event,
                applied: isOn,
                variant: isOn ? 'success' : 'neutral',
                buttonLabel: isOn ? 'Remove' : 'Apply',
                deltaClass,
                deltaLabel: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}% rev`,
                rowClass: isOn
                    ? 'slds-item ohfy-event ohfy-event_on'
                    : 'slds-item ohfy-event',
                categoryClass: `ohfy-cat ohfy-cat_${event.category}`
            };
        });
    }

    get visibleLabel() {
        return `${this.filteredEvents.length} of ${DEMO_EVENTS.length} · ${this.appliedIds.length} applied`;
    }

    get hasSnapshot() {
        return this.snapshot !== null;
    }

    get showEmptyState() {
        return this.snapshot === null && !this.isLoading && !this.errorMessage;
    }

    get noEvents() {
        return this.filteredEvents.length === 0;
    }

    get hasError() {
        return this.errorMessage !== null;
    }

    get canReset() {
        return this.appliedIds.length === 0 && this.snapshot === null;
    }

    get eventCountLabel() {
        return String(this.appliedIds.length);
    }

    get baselineMonths() {
        return Array.isArray(this.snapshot?.baseline) ? this.snapshot.baseline : [];
    }

    get scenarioMonths() {
        return Array.isArray(this.snapshot?.scenario) ? this.snapshot.scenario : [];
    }

    get revenueKpi() {
        if (!this.snapshot) return { value: '—', delta: '—', positive: true };
        const s = sumKey(this.scenarioMonths, 'revenue');
        const b = sumKey(this.baselineMonths, 'revenue');
        return {
            value: fmtUsd(s),
            delta: fmtPctDelta(s, b),
            positive: s >= b
        };
    }

    get ebitdaKpi() {
        if (!this.snapshot) return { value: '—', delta: '—', positive: true };
        const s = sumKey(this.scenarioMonths, 'ebitda');
        const b = sumKey(this.baselineMonths, 'ebitda');
        return {
            value: fmtUsd(s),
            delta: fmtPctDelta(s, b),
            positive: s >= b
        };
    }

    get gmKpi() {
        if (!this.snapshot) return { value: '—', delta: '—', positive: true };
        const s = sumKey(this.scenarioMonths, 'gm');
        const b = sumKey(this.baselineMonths, 'gm');
        return {
            value: fmtUsd(s),
            delta: fmtPctDelta(s, b),
            positive: s >= b
        };
    }

    get ebitdaTotalLabel() {
        if (!this.snapshot || !this.snapshot.threeStatement) return '—';
        return fmtUsd(this.snapshot.threeStatement.income.totals.ebitda);
    }

    get revenueBars() {
        if (!this.snapshot) return [];
        const max = Math.max(
            ...this.baselineMonths.map((m) => m.revenue || 0),
            ...this.scenarioMonths.map((m) => m.revenue || 0),
            1
        );
        return this.baselineMonths.map((b, i) => {
            const s = this.scenarioMonths[i];
            const bPct = ((b.revenue || 0) / max) * 100;
            const sPct = ((s?.revenue || 0) / max) * 100;
            const up = (s?.revenue || 0) >= (b.revenue || 0);
            return {
                key: b.month,
                month: b.month.slice(5),
                baselineStyle: `height: ${bPct.toFixed(1)}%;`,
                scenarioStyle: `height: ${sPct.toFixed(1)}%;`,
                scenarioClass: up ? 'ohfy-bar ohfy-bar_up' : 'ohfy-bar ohfy-bar_down'
            };
        });
    }

    get ebitdaBars() {
        if (!this.snapshot) return [];
        const max = Math.max(
            ...this.baselineMonths.map((m) => Math.max(m.ebitda || 0, 0)),
            ...this.scenarioMonths.map((m) => Math.max(m.ebitda || 0, 0)),
            1
        );
        return this.baselineMonths.map((b, i) => {
            const s = this.scenarioMonths[i];
            const bPct = ((b.ebitda || 0) / max) * 100;
            const sPct = ((s?.ebitda || 0) / max) * 100;
            const up = (s?.ebitda || 0) >= (b.ebitda || 0);
            return {
                key: b.month,
                month: b.month.slice(5),
                baselineStyle: `height: ${bPct.toFixed(1)}%;`,
                scenarioStyle: `height: ${sPct.toFixed(1)}%;`,
                scenarioClass: up ? 'ohfy-bar ohfy-bar_up' : 'ohfy-bar ohfy-bar_down'
            };
        });
    }

    get incomeRows() {
        const t = this.snapshot?.threeStatement?.income?.totals;
        if (!t) return [];
        const baselineEbitda = sumKey(this.baselineMonths, 'ebitda');
        return [
            { key: 'rev', label: 'Revenue', value: fmtUsd(t.revenue) },
            { key: 'cogs', label: 'COGS', value: fmtUsd(t.cogs) },
            { key: 'gm', label: 'Gross margin', value: fmtUsd(t.gm) },
            { key: 'opex', label: 'Opex', value: fmtUsd(t.opex) },
            {
                key: 'ebitda',
                label: 'EBITDA',
                value: fmtUsd(t.ebitda),
                extra: baselineEbitda ? fmtPctDelta(t.ebitda, baselineEbitda) : '',
                emphasis: true
            }
        ].map((row) => ({
            ...row,
            rowClass: row.emphasis ? 'ohfy-dl__row ohfy-dl__row_emph' : 'ohfy-dl__row',
            hasExtra: Boolean(row.extra)
        }));
    }

    get balanceRows() {
        const b = this.snapshot?.threeStatement?.balance;
        if (!b) return [];
        return [
            { key: 'cash', label: 'Cash', value: fmtUsd(b.closingCashBalance) },
            { key: 'ar', label: 'Accounts receivable', value: fmtUsd(b.accountsReceivable) },
            { key: 'inv', label: 'Inventory', value: fmtUsd(b.inventory) },
            { key: 'ap', label: 'Accounts payable', value: fmtUsd(b.accountsPayable) },
            { key: 'equity', label: 'Equity', value: fmtUsd(b.equity), emphasis: true }
        ].map((row) => ({
            ...row,
            rowClass: row.emphasis ? 'ohfy-dl__row ohfy-dl__row_emph' : 'ohfy-dl__row'
        }));
    }

    get cashRows() {
        const c = this.snapshot?.threeStatement?.cash;
        if (!c) return [];
        return [
            { key: 'op', label: 'Operating', value: fmtUsd(c.operating) },
            { key: 'inv', label: 'Investing', value: fmtUsd(c.investing) },
            { key: 'fin', label: 'Financing', value: fmtUsd(c.financing) },
            { key: 'net', label: 'Net change', value: fmtUsd(c.netChange), emphasis: true }
        ].map((row) => ({
            ...row,
            rowClass: row.emphasis ? 'ohfy-dl__row ohfy-dl__row_emph' : 'ohfy-dl__row'
        }));
    }

    get revenueKpiClass() {
        return this.revenueKpi.positive ? 'ohfy-kpi__delta ohfy-kpi__delta_up' : 'ohfy-kpi__delta ohfy-kpi__delta_down';
    }
    get ebitdaKpiClass() {
        return this.ebitdaKpi.positive ? 'ohfy-kpi__delta ohfy-kpi__delta_up' : 'ohfy-kpi__delta ohfy-kpi__delta_down';
    }
    get gmKpiClass() {
        return this.gmKpi.positive ? 'ohfy-kpi__delta ohfy-kpi__delta_up' : 'ohfy-kpi__delta ohfy-kpi__delta_down';
    }

    handleScenarioChange(event) {
        this.scenarioId = event.detail.value;
        this.snapshot = null;
    }

    handleSearch(event) {
        this.searchQuery = event.target.value || '';
    }

    handleCategory(event) {
        this.categoryFilter = event.currentTarget.dataset.id;
    }

    handleSortChange(event) {
        this.sortKey = event.detail.value;
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
        this.searchQuery = '';
        this.categoryFilter = 'all';
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
