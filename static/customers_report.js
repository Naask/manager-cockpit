document.addEventListener('DOMContentLoaded', () => {

    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const filterButton = document.getElementById('filter-button');
    const clearButton = document.getElementById('clear-filter-button');
    const periodSelector = document.getElementById('period-selector');
    const customersTableBody = document.querySelector('#customers-table tbody');

    Chart.register(ChartDataLabels);
    let concentrationChart = null; 

    function formatCurrency(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return 'R$ 0,00';
        const amount = amountInCents / 100;
        return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    async function fetchAndRenderReports(startDate, endDate, period) {
        // --- Renderiza a Tabela de Ranking (lógica existente, mas agora com API separada) ---
        customersTableBody.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
        try {
            let rankingUrl = '/api/reports/customer-performance';
            if (startDate && endDate) {
                rankingUrl += `?start_date=${startDate}&end_date=${endDate}`;
            }
            const rankingResponse = await fetch(rankingUrl);
            if (!rankingResponse.ok) throw new Error(`Erro na API de ranking: ${rankingResponse.statusText}`);
            const rankingData = await rankingResponse.json();
            
            customersTableBody.innerHTML = '';
            if (rankingData.customers.length === 0) {
                customersTableBody.innerHTML = '<tr><td colspan="6">Nenhum dado encontrado para o período.</td></tr>';
            } else {
                let cumulativeRevenue = 0;
                rankingData.customers.forEach(customer => {
                    const row = customersTableBody.insertRow();
                    const percentageOfTotal = rankingData.grand_total_revenue > 0 ? (customer.total_revenue / rankingData.grand_total_revenue) * 100 : 0;
                    cumulativeRevenue += customer.total_revenue;
                    const paretoPercentage = rankingData.grand_total_revenue > 0 ? (cumulativeRevenue / rankingData.grand_total_revenue) * 100 : 0;
                    const averageTicket = customer.order_count > 0 ? (customer.total_revenue / customer.order_count) : 0;
                    row.innerHTML = `<td>${customer.customer_name}</td><td><strong>${formatCurrency(customer.total_revenue)}</strong></td><td>${percentageOfTotal.toFixed(2)}%</td><td>${paretoPercentage.toFixed(2)}%</td><td>${customer.order_count}</td><td>${formatCurrency(averageTicket)}</td>`;
                });
            }
        } catch (error) {
            console.error("Erro ao carregar dados de ranking de clientes:", error);
            customersTableBody.innerHTML = '<tr><td colspan="6">Erro ao carregar dados.</td></tr>';
        }

        // --- Renderiza o Gráfico de Concentração ABC (NOVA LÓGICA) ---
        try {
            let trendUrl = `/api/reports/customer-concentration-trend?period=${period}`;
            if (startDate && endDate) {
                trendUrl += `&start_date=${startDate}&end_date=${endDate}`;
            }
            const trendResponse = await fetch(trendUrl);
            if (!trendResponse.ok) throw new Error(`Erro na API de tendência: ${trendResponse.statusText}`);
            const trendData = await trendResponse.json();

            const labels = trendData.map(d => d.period);
            const clientsA = []; // Clientes que somam 50% do faturamento
            const clientsB = []; // Clientes que somam os próximos 30% (até 80%)

            trendData.forEach(periodData => {
                const revenues = periodData.customer_revenues.sort((a, b) => b - a);
                const totalRevenue = periodData.total_revenue_in_period;
                let cumulativeRevenue = 0;
                let countA = 0;
                let countB = 0;

                for (const revenue of revenues) {
                    cumulativeRevenue += revenue;
                    const percentage = (cumulativeRevenue / totalRevenue);
                    if (percentage <= 0.50) {
                        countA++;
                    } else if (percentage <= 0.80) {
                        countB++;
                    }
                }
                clientsA.push(countA);
                clientsB.push(countB);
            });
            
            const ctx = document.getElementById('concentration-chart').getContext('2d');
            if (concentrationChart) {
                concentrationChart.destroy();
            }
            concentrationChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'Qtd. Clientes (Top 50% Faturamento)', data: clientsA, backgroundColor: '#20c997' }, // Verde
                        { label: 'Qtd. Clientes (Próximos 30% Faturamento)', data: clientsB, backgroundColor: '#ffc107' } // Amarelo
                    ]
                },
                options: {
                    plugins: {
                        datalabels: { color: '#fff', font: { weight: 'bold' } },
                        title: { display: true, text: 'Nº de Clientes Responsáveis por 80% do Faturamento' }
                    },
                    responsive: true,
                    scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
                }
            });

        } catch (error) {
            console.error("Erro ao carregar dados de tendência:", error);
        }
    }

    function updateView() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const period = periodSelector.value;
        fetchAndRenderReports(startDate, endDate, period);
    }

    filterButton.addEventListener('click', updateView);
    clearButton.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        updateView();
    });
    periodSelector.addEventListener('change', updateView);

    // Carga inicial
    updateView();
});