document.addEventListener('DOMContentLoaded', () => {
    const periodSelector = document.getElementById('period-selector');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const filterButton = document.getElementById('filter-button');
    const clearButton = document.getElementById('clear-filter-button');
    
    // Registra o plugin de rótulos globalmente para todos os gráficos
    Chart.register(ChartDataLabels);

    const charts = {
        ordersCount: null,
        revenue: null,
        customersCount: null,
        ticket: null
    };

    function calculateMedian(numbers) {
        if (!numbers || numbers.length === 0) return 0;
        const sorted = numbers.slice().sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) {
            return (sorted[middle - 1] + sorted[middle]) / 2;
        }
        return sorted[middle];
    }

    async function fetchAndRenderReports(period, startDate, endDate) {
        try {
            // Constrói a URL com todos os parâmetros
            let url = `/api/reports/summary?period=${period}`;
            if (startDate && endDate) {
                url += `&start_date=${startDate}&end_date=${endDate}`;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
            const data = await response.json();

            // Prepara os dados
            const labels = data.map(item => item.period);
            const orderCounts = data.map(item => item.order_count);
            const revenues = data.map(item => (item.total_revenue / 100)); // Converte para Reais
            const customerCounts = data.map(item => item.distinct_customer_count);
            const ticketAverages = data.map(item => (item.total_revenue / item.order_count) / 100);
            const ticketMedians = data.map(item => {
                const values = item.ticket_values ? item.ticket_values.split(',').map(Number) : [0];
                return calculateMedian(values) / 100;
            });
            
            // Renderiza ou atualiza os gráficos
            renderBarChart('ordersCount', 'ordersCountChart', labels, 'Qtd. de Pedidos', orderCounts, '#36A2EB');
            renderBarChart('revenue', 'revenueChart', labels, 'Faturamento (R$)', revenues, '#4BC0C0');
            renderBarChart('customersCount', 'customersCountChart', labels, 'Clientes Distintos', customerCounts, '#FF9F40');
            renderLineChart('ticket', 'ticketChart', labels, ticketAverages, ticketMedians);

        } catch (error) {
            console.error("Erro ao carregar dados dos relatórios:", error);
        }
    }

    // Função genérica para gráficos de barra
    function renderBarChart(chartKey, canvasId, labels, label, data, color) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (charts[chartKey]) charts[chartKey].destroy();
        charts[chartKey] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{ label: label, data: data, backgroundColor: color }]
            },
            options: {
                plugins: {
                    datalabels: {
                        anchor: 'end', align: 'end',
                        formatter: (value) => (label.includes('R$') ? value.toFixed(2) : value),
                        color: '#555'
                    }
                },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // Função para o gráfico de linhas
    function renderLineChart(chartKey, canvasId, labels, avgData, medianData) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (charts[chartKey]) charts[chartKey].destroy();
        charts[chartKey] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Ticket Médio (R$)', data: avgData, borderColor: '#FF6384', backgroundColor: '#FF6384' },
                    { label: 'Ticket Mediano (R$)', data: medianData, borderColor: '#36A2EB', backgroundColor: '#36A2EB' }
                ]
            },
            options: {
                plugins: {
                    datalabels: {
                        anchor: 'end', align: 'end',
                        formatter: (value) => `R$ ${value.toFixed(2)}`,
                        backgroundColor: (context) => context.dataset.backgroundColor,
                        color: 'white', borderRadius: 4, padding: 4, font: { size: 10 }
                    }
                },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
    
    // Função para unificar a chamada de atualização
    function updateCharts() {
        const period = periodSelector.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        fetchAndRenderReports(period, startDate, endDate);
    }

    // Listeners para os controles
    periodSelector.addEventListener('change', updateCharts);
    filterButton.addEventListener('click', updateCharts);
    clearButton.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        updateCharts(); // Chama a atualização com as datas limpas
    });

    // Carga inicial
    updateCharts();
});