document.addEventListener('DOMContentLoaded', () => {
    const periodSelector = document.getElementById('period-selector');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const filterButton = document.getElementById('filter-button');
    const clearButton = document.getElementById('clear-filter-button');
    
    Chart.register(ChartDataLabels);

    const charts = {
        ordersCount: null,
        revenue: null,
        customersCount: null,
        ticket: null,
        revenuePerCustomer: null,
        customerType: null // Novo gráfico
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
    
    function calculateAverage(numbers) {
        if (!numbers || numbers.length === 0) return 0;
        const sum = numbers.reduce((acc, val) => acc + val, 0);
        return sum / numbers.length;
    }

    async function fetchAndRenderReports(period, startDate, endDate) {
        try {
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
            const revenues = data.map(item => (item.total_revenue / 100));
            const customerCounts = data.map(item => item.distinct_customer_count);
            const newCustomerCounts = data.map(item => item.new_customer_count);
            const returningCustomerCounts = data.map(item => item.returning_customer_count);
            
            const ticketAverages = data.map(item => (item.total_revenue / item.order_count) / 100);
            const ticketMedians = data.map(item => {
                const values = item.ticket_values ? item.ticket_values.split(',').map(Number) : [0];
                return calculateMedian(values) / 100;
            });
            const revenuePerCustomerAverages = data.map(item => {
                const values = item.revenue_per_customer_values ? item.revenue_per_customer_values.split(',').map(Number) : [0];
                return calculateAverage(values) / 100;
            });
            const revenuePerCustomerMedians = data.map(item => {
                const values = item.revenue_per_customer_values ? item.revenue_per_customer_values.split(',').map(Number) : [0];
                return calculateMedian(values) / 100;
            });
            
            // Renderiza ou atualiza os gráficos
            renderBarChart('ordersCount', 'ordersCountChart', labels, 'Qtd. de Pedidos', orderCounts, '#36A2EB');
            renderBarChart('revenue', 'revenueChart', labels, 'Faturamento (R$)', revenues, '#4BC0C0');
            renderBarChart('customersCount', 'customersCountChart', labels, 'Clientes Distintos', customerCounts, '#FF9F40');
            renderStackedBarChart('customerType', 'customerTypeChart', labels, newCustomerCounts, returningCustomerCounts);
            renderLineChart('ticket', 'ticketChart', 'Ticket Médio (R$)', 'Ticket Mediano (R$)', labels, ticketAverages, ticketMedians);
            renderLineChart('revenuePerCustomer', 'revenuePerCustomerChart', 'Faturamento Médio/Cliente (R$)', 'Faturamento Mediano/Cliente (R$)', labels, revenuePerCustomerAverages, revenuePerCustomerMedians);

        } catch (error) {
            console.error("Erro ao carregar dados dos relatórios:", error);
        }
    }

    function renderBarChart(chartKey, canvasId, labels, label, data, color) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (charts[chartKey]) charts[chartKey].destroy();
        charts[chartKey] = new Chart(ctx, {
            type: 'bar',
            data: { labels: labels, datasets: [{ label: label, data: data, backgroundColor: color }] },
            options: { plugins: { datalabels: { anchor: 'end', align: 'end', formatter: (value) => (label.includes('R$') ? value.toFixed(2) : value), color: '#555' } }, scales: { y: { beginAtZero: true } } }
        });
    }

    function renderLineChart(chartKey, canvasId, label1, label2, labels, data1, data2) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (charts[chartKey]) charts[chartKey].destroy();
        charts[chartKey] = new Chart(ctx, {
            type: 'line',
            data: { labels: labels, datasets: [ { label: label1, data: data1, borderColor: '#FF6384', backgroundColor: '#FF6384' }, { label: label2, data: data2, borderColor: '#36A2EB', backgroundColor: '#36A2EB' } ] },
            options: { plugins: { datalabels: { anchor: 'end', align: 'end', formatter: (value) => `R$ ${value.toFixed(2)}`, backgroundColor: (context) => context.dataset.backgroundColor, color: 'white', borderRadius: 4, padding: 4, font: { size: 10 } } }, scales: { y: { beginAtZero: true } } }
        });
    }

    // NOVA FUNÇÃO para o gráfico de barras empilhadas
    function renderStackedBarChart(chartKey, canvasId, labels, newData, returningData) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (charts[chartKey]) charts[chartKey].destroy();
        charts[chartKey] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Clientes Novos', data: newData, backgroundColor: '#FFB347' }, // Laranja
                    { label: 'Clientes Recorrentes', data: returningData, backgroundColor: '#8A9A5B' } // Verde Musgo
                ]
            },
            options: {
                plugins: { datalabels: { color: '#ffffff', font: { weight: 'bold' } } },
                responsive: true,
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
            }
        });
    }
    
    function updateCharts() {
        const period = periodSelector.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        fetchAndRenderReports(period, startDate, endDate);
    }

    periodSelector.addEventListener('change', updateCharts);
    filterButton.addEventListener('click', updateCharts);
    clearButton.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        updateCharts();
    });

    updateCharts();
});