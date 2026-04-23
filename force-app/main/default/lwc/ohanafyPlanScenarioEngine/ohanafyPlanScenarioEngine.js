import { LightningElement, track } from 'lwc';
import invokeTool from '@salesforce/apex/OhfyPlanMcpGateway.invokeTool';

export default class OhanafyPlanScenarioEngine extends LightningElement {
    @track scenarioName = 'Yellowhammer Q3 Base';
    @track lastResponse = null;
    @track isLoading = false;

    async handleApplyEvent() {
        this.isLoading = true;
        try {
            const raw = await invokeTool({
                toolName: 'apply_event',
                payload: JSON.stringify({ scenarioId: 'demo', eventId: 'iron-bowl-2026' }),
            });
            this.lastResponse = raw;
        } catch (err) {
            this.lastResponse = `error: ${err?.body?.message ?? err?.message ?? 'unknown'}`;
        } finally {
            this.isLoading = false;
        }
    }
}
