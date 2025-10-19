document.addEventListener('DOMContentLoaded', () => {
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const filterButton = document.getElementById('filter-button');
    const segmentsContainer = document.getElementById('segments-container');
    const loadingMessage = document.getElementById('loading-message');
    const legendContainer = document.getElementById('score-legend-container');

    function formatCurrency(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return 'R$ 0,00';
        const amount = amountInCents / 100;
        return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function renderScoreLegend(boundaries) {
        // --- FUNÇÃO AUXILIAR ATUALIZADA ---
        const getRange = (metric, score) => {
            const boundary = boundaries?.[metric]?.[score];
            if (!boundary) {
                return 'N/A';
            }
            
            // Constrói a string do intervalo
            let rangeStr;
            if (metric === 'monetary') {
                rangeStr = `${formatCurrency(boundary.min)} - ${formatCurrency(boundary.max)}`;
            } else {
                rangeStr = `${boundary.min} - ${boundary.max}`;
            }
            
            // Adiciona a contagem de clientes
            return `${rangeStr} <br><small>(${boundary.count} clientes)</small>`;
        };

        if (!boundaries || Object.keys(boundaries.recency).length === 0) {
            legendContainer.innerHTML = '';
            return;
        }

        legendContainer.innerHTML = `
            <h2>Critérios de Pontuação (Baseado na Amostra)</h2>
            <table class="legend-table">
                <thead>
                    <tr>
                        <th>Métrica</th>
                        <th>Score 1 (Pior)</th>
                        <th>Score 2</th>
                        <th>Score 3</th>
                        <th>Score 4</th>
                        <th>Score 5 (Melhor)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td class="metric-col">Recência (dias)</td><td>${getRange('recency', 1)}</td><td>${getRange('recency', 2)}</td><td>${getRange('recency', 3)}</td><td>${getRange('recency', 4)}</td><td>${getRange('recency', 5)}</td></tr>
                    <tr><td class="metric-col">Frequência (pedidos)</td><td>${getRange('frequency', 1)}</td><td>${getRange('frequency', 2)}</td><td>${getRange('frequency', 3)}</td><td>${getRange('frequency', 4)}</td><td>${getRange('frequency', 5)}</td></tr>
                    <tr><td class="metric-col">Valor (R$)</td><td>${getRange('monetary', 1)}</td><td>${getRange('monetary', 2)}</td><td>${getRange('monetary', 3)}</td><td>${getRange('monetary', 4)}</td><td>${getRange('monetary', 5)}</td></tr>
                </tbody>
            </table>`;
    }

    async function fetchAndRenderRFM(startDate, endDate) {
        loadingMessage.style.display = 'block';
        segmentsContainer.innerHTML = '';
        legendContainer.innerHTML = '';

        try {
            const params = new URLSearchParams();
            if (endDate) params.append('end_date', endDate);
            if (startDate) params.append('start_date', startDate);

            const url = `/api/reports/rfm-analysis?${params.toString()}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
            
            const data = await response.json();
            const segments = data.segments;
            const segmentDefinitions = data.segment_definitions;

            renderScoreLegend(data.score_boundaries);
            
            segmentsContainer.innerHTML = '';
            for (const segmentName in segmentDefinitions) {
                const customers = segments[segmentName] || [];
                const definition = segmentDefinitions[segmentName];

                let tableRows = '<tr><th>Cliente</th><th>Score</th><th>Recência (d)</th><th>Frequência</th><th>Valor</th></tr>';
                if (customers.length > 0) {
                    customers.forEach(c => {
                        tableRows += `<tr><td>${c.customer_name}</td><td>${c.rfm_score}</td><td>${c.recency}</td><td>${c.frequency}</td><td>${formatCurrency(c.monetary)}</td></tr>`;
                    });
                } else {
                    tableRows = '<tr><td colspan="5">Nenhum cliente neste segmento.</td></tr>';
                }

                const cardHTML = `
                    <div class="segment-card" style="border-top-color: ${definition.color};">
                        <div class="segment-header">
                            <h3>${segmentName} (${customers.length})</h3>
                            <p>${definition.description}</p>
                            <div class="score-list">
                                <b>Scores:</b> ${definition.scores.join(', ')}
                            </div>
                        </div>
                        <div class="segment-body">
                            <table class="customer-table">
                                <tbody>${tableRows}</tbody>
                            </table>
                        </div>
                    </div>
                `;
                segmentsContainer.innerHTML += cardHTML;
            }

        } catch (error) {
            console.error("Erro ao carregar análise RFM:", error);
            loadingMessage.innerHTML = '<p>Erro ao carregar os dados. Tente novamente.</p>';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    const today = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(today.getDate() - 90);

    endDateInput.value = today.toISOString().split('T')[0];
    startDateInput.value = ninetyDaysAgo.toISOString().split('T')[0];

    filterButton.addEventListener('click', () => {
        fetchAndRenderRFM(startDateInput.value, endDateInput.value);
    });

    fetchAndRenderRFM(startDateInput.value, endDateInput.value);
});