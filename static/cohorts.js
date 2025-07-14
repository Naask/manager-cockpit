document.addEventListener('DOMContentLoaded', () => {

    const chartContainer = document.getElementById('cohort-chart-container');
    const loadingMessage = document.getElementById('loading-message');
    const periodSelector = document.getElementById('period-selector');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const filterButton = document.getElementById('filter-button');
    const clearButton = document.getElementById('clear-filter-button');

    function getColor(value) {
        if (value === null) return '#ffffff'; // Células vazias
        const intensity = Math.min(100, value * 2.5);
        // Interpolação de cor de cinza claro para verde escuro
        const green = Math.round(100 + (100 * (intensity / 100)));
        const redBlue = Math.round(240 - (100 * (intensity / 100)));
        return `rgb(${redBlue}, ${green}, ${redBlue})`;
    }

    async function fetchAndRenderCohort(period, startDate, endDate) {
        chartContainer.innerHTML = '<p id="loading-message">Carregando dados da análise...</p>';
        try {
            let url = `/api/reports/cohort-retention?period=${period}`;
            if (startDate && endDate) {
                url += `&start_date=${startDate}&end_date=${endDate}`;
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Erro na API: ${response.statusText}`);
            }
            const data = await response.json();

            // 1. Processar dados brutos
            const cohorts = {};
            const totalActiveByPeriod = {}; // Novo: para guardar o total de clientes por período

            data.forEach(row => {
                const { cohort_period, activity_period, active_customers } = row;
                
                if (!cohorts[cohort_period]) {
                    cohorts[cohort_period] = {
                        cohortSize: 0,
                        activities: {}
                    };
                }
                
                cohorts[cohort_period].activities[activity_period] = active_customers;

                // Novo: Soma o total de clientes ativos para cada período de atividade
                if (!totalActiveByPeriod[activity_period]) {
                    totalActiveByPeriod[activity_period] = 0;
                }
                totalActiveByPeriod[activity_period] += active_customers;
            });
            
            // Define o tamanho da coorte
            for (const cohortPeriod in cohorts) {
                cohorts[cohortPeriod].cohortSize = cohorts[cohortPeriod].activities[cohortPeriod] || 0;
            }

            const cohortPeriods = Object.keys(cohorts).sort();
            if (cohortPeriods.length === 0) {
                 chartContainer.innerHTML = '<p id="loading-message">Não há dados para o filtro selecionado.</p>';
                 return;
            }

            const allActivityPeriods = [...new Set(data.map(d => d.activity_period))].sort();

            // 2. Lógica de construção da tabela atualizada
            let tableHTML = '<table class="cohort-table"><thead>';
            
            // Linha 1 do Cabeçalho: Nome do Período
            tableHTML += '<tr><th>Coorte</th>';
            allActivityPeriods.forEach(p => {
                tableHTML += `<th>${p}</th>`;
            });
            tableHTML += '</tr>';

            // Linha 2 do Cabeçalho (NOVA): Total de Clientes Ativos
            tableHTML += '<tr><th>Total de Clientes</th>';
            allActivityPeriods.forEach(p => {
                const total = totalActiveByPeriod[p] || 0;
                tableHTML += `<th>${total}</th>`;
            });
            tableHTML += '</tr></thead><tbody>';

            // Corpo da tabela (lógica existente)
            cohortPeriods.forEach(cohortPeriod => {
                const cohort = cohorts[cohortPeriod];
                tableHTML += `<tr><td class="cohort-label">${cohortPeriod}<br>(${cohort.cohortSize} clientes)</td>`;
                
                allActivityPeriods.forEach(activityPeriod => {
                    if (activityPeriod < cohortPeriod) {
                        tableHTML += `<td style="background-color: #e9ecef;"></td>`;
                        return;
                    }
                    
                    const activeCustomers = cohort.activities[activityPeriod];
                    if (activeCustomers !== undefined) {
                        const retention = cohort.cohortSize > 0 ? (activeCustomers / cohort.cohortSize) * 100 : 0;
                        tableHTML += `<td class="heatmap-cell" style="background-color: ${getColor(retention)};">
                                        ${retention.toFixed(1)}%<br>
                                        <small>(${activeCustomers})</small>
                                     </td>`;
                    } else {
                        tableHTML += `<td style="background-color: ${getColor(null)};"></td>`;
                    }
                });
                tableHTML += '</tr>';
            });

            tableHTML += '</tbody></table>';
            chartContainer.innerHTML = tableHTML;

        } catch (error) {
            console.error("Erro ao carregar dados da análise de coortes:", error);
            chartContainer.innerHTML = '<p id="loading-message">Erro ao carregar os dados. Tente novamente mais tarde.</p>';
        }
    }

    function updateView() {
        const period = periodSelector.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        fetchAndRenderCohort(period, startDate, endDate);
    }
    
    filterButton.addEventListener('click', updateView);
    clearButton.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        updateView();
    });

    // Carga inicial
    updateView();
});