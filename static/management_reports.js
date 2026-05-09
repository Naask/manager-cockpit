document.addEventListener('DOMContentLoaded', () => {
    const periodSelector = document.getElementById('period-selector');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const bucketSizeInput = document.getElementById('bucket-size'); // Novo input
    const filterButton = document.getElementById('filter-button');
    const clearButton = document.getElementById('clear-filter-button');

    // Registra o plugin de rótulos globalmente para todos os gráficos
    Chart.register(ChartDataLabels);

    // Objeto para guardar as instâncias dos gráficos e poder atualizá-las
    const charts = {
        ordersCount: null,
        revenue: null,
        customersCount: null,
        ticket: null,
        revenuePerCustomer: null,
        customerType: null,
        orderValues: null,
        cashflow: null,
        stock: null
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

    async function fetchAndRenderReports(period, startDate, endDate, bucketSize) {
        // --- Lógica para os gráficos de tendência (agrupados por período) ---
        try {
            let summaryUrl = `/api/reports/summary?period=${period}`;
            if (startDate && endDate) {
                summaryUrl += `&start_date=${startDate}&end_date=${endDate}`;
            }

            const response = await fetch(summaryUrl);
            if (!response.ok) throw new Error(`Erro na API de resumo: ${response.statusText}`);
            const data = await response.json();

            // Prepara os dados para os gráficos
            const labels = data.map(item => item.period);
            const orderCounts = data.map(item => item.order_count);
            const revenues = data.map(item => (item.total_revenue / 100));
            const customerCounts = data.map(item => item.distinct_customer_count);
            const newCustomerCounts = data.map(item => item.new_customer_count);
            const returningCustomerCounts = data.map(item => item.returning_customer_count);

            const ticketAverages = data.map(item => (item.total_revenue > 0 && item.order_count > 0 ? (item.total_revenue / item.order_count) / 100 : 0));
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

            // Renderiza ou atualiza os gráficos de tendência
            renderBarChart('ordersCount', 'ordersCountChart', labels, 'Qtd. de Pedidos', orderCounts, '#007bff');
            renderBarChart('revenue', 'revenueChart', labels, 'Faturamento (R$)', revenues, '#20c997');
            renderBarChart('customersCount', 'customersCountChart', labels, 'Clientes Distintos', customerCounts, '#17a2b8');
            renderStackedBarChart('customerType', 'customerTypeChart', labels, newCustomerCounts, returningCustomerCounts);
            renderLineChart('ticket', 'ticketChart', 'Ticket Médio (R$)', 'Ticket Mediano (R$)', labels, ticketAverages, ticketMedians);
            renderLineChart('revenuePerCustomer', 'revenuePerCustomerChart', 'Faturamento Médio/Cliente (R$)', 'Faturamento Mediano/Cliente (R$)', labels, revenuePerCustomerAverages, revenuePerCustomerMedians);

        } catch (error) {
            console.error("Erro ao carregar dados dos relatórios de tendência:", error);
        }

        // --- Lógica para o histograma (apenas com filtro de data) ---
        try {
            let histogramUrl = '/api/reports/order-values';
            if (startDate && endDate) {
                histogramUrl += `?start_date=${startDate}&end_date=${endDate}`;
            }
            const response = await fetch(histogramUrl);
            if (!response.ok) throw new Error(`Erro na API do histograma: ${response.statusText}`);
            const rawValues = await response.json();
            renderHistogram('orderValues', 'orderValuesHistogram', rawValues, bucketSize);
        } catch (error) {
            console.error("Erro ao carregar dados do histograma:", error);
        }

        // --- Lógica para os gráficos de cashflow e estoque ---
        try {
            let cashflowUrl = `/api/reports/cashflow?period=${period}`;
            if (startDate && endDate) {
                cashflowUrl += `&start_date=${startDate}&end_date=${endDate}`;
            }
            const response = await fetch(cashflowUrl);
            if (!response.ok) throw new Error(`Erro na API de cashflow: ${response.statusText}`);
            const d = await response.json();

            const fmt = v => (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            document.getElementById('current-payment-balance').textContent = fmt(d.current_payment_balance);
            document.getElementById('current-bonus-balance').textContent   = fmt(d.current_bonus_balance);

            const cfLabels  = d.cashflow.map(r => r.period);
            const cfDirect  = d.cashflow.map(r => r.direct / 100);
            const cfCredit  = d.cashflow.map(r => r.credit_used / 100);
            const cfBonus   = d.cashflow.map(r => r.bonus_used / 100);
            renderCashflowChart(cfLabels, cfDirect, cfCredit, cfBonus);

            const stLabels  = d.stock.map(r => r.period);
            const stPayment = d.stock.map(r => r.payment_balance / 100);
            const stBonus   = d.stock.map(r => r.bonus_balance / 100);
            renderStockChart(stLabels, stPayment, stBonus);
        } catch (error) {
            console.error("Erro ao carregar dados de cashflow:", error);
        }
    }

    // --- Funções de Renderização de Gráficos ---

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
                        // Lógica de formatação atualizada
                        formatter: (value) => {
                            if (label.includes('Faturamento')) {
                                // Remove os centavos e adiciona ponto como separador de milhar
                                return Math.round(value).toLocaleString('pt-BR');
                            }
                            // Mantém o formato padrão para os outros gráficos
                            return value;
                        },
                        color: '#555'
                    }
                },
                scales: { 
                    y: { 
                        beginAtZero: true,
                        // Adiciona formatação ao eixo Y do gráfico de faturamento
                        ticks: {
                            callback: function(value) {
                                if (label.includes('Faturamento')) {
                                    return 'R$ ' + value.toLocaleString('pt-BR');
                                }
                                return value;
                            }
                        }
                    } 
                }
            }
        });
    }

    function renderLineChart(chartKey, canvasId, label1, label2, labels, data1, data2) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (charts[chartKey]) charts[chartKey].destroy();
        charts[chartKey] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: label1, data: data1, borderColor: '#FF6384', backgroundColor: '#FF6384' },
                    { label: label2, data: data2, borderColor: '#36A2EB', backgroundColor: '#36A2EB' }
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

    function renderStackedBarChart(chartKey, canvasId, labels, newData, returningData) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (charts[chartKey]) charts[chartKey].destroy();
        charts[chartKey] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Clientes Recorrentes', data: returningData, backgroundColor: '#007bff' },
                    { label: 'Clientes Novos', data: newData, backgroundColor: '#a4c1f4' }
                ]
            },
            options: {
                plugins: { 
                    datalabels: { 
                        color: (context) => context.dataset.backgroundColor === '#007bff' ? '#ffffff' : '#000000',
                        font: { weight: 'bold' } 
                    } 
                },
                responsive: true,
                scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
            }
        });
    }

    function renderHistogram(chartKey, canvasId, rawDataInCents, userBucketSize) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        if (charts[chartKey]) charts[chartKey].destroy();

        if (rawDataInCents.length === 0) return;

        const rawData = rawDataInCents.map(val => val / 100);
        const minVal = Math.floor(Math.min(...rawData));
        const maxVal = Math.ceil(Math.max(...rawData));
        
        let bucketSize;
        if (userBucketSize && userBucketSize > 0) {
            bucketSize = userBucketSize;
        } else {
            const range = maxVal - minVal;
            const numBucketsAuto = Math.min(10, Math.ceil(Math.sqrt(rawData.length)));
            bucketSize = range > 0 && numBucketsAuto > 0 ? Math.ceil(range / numBucketsAuto) : 10;
        }

        const numBuckets = bucketSize > 0 ? Math.ceil((maxVal - minVal) / bucketSize) : 0;

        if (numBuckets <= 0) return;

        const buckets = Array.from({ length: numBuckets }, (_, i) => {
            const bucketMin = minVal + (i * bucketSize);
            return {
                label: `R$ ${bucketMin.toFixed(0)} - R$ ${(bucketMin + bucketSize - 0.01).toFixed(0)}`,
                count: 0
            };
        });

        rawData.forEach(value => {
            const bucketIndex = Math.min(
                Math.floor((value - minVal) / bucketSize),
                numBuckets - 1
            );
            if (buckets[bucketIndex]) {
                 buckets[bucketIndex].count++;
            }
        });

        const labels = buckets.map(b => b.label);
        const counts = buckets.map(b => b.count);

        charts[chartKey] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Nº de Pedidos',
                    data: counts,
                    backgroundColor: '#6f42c1'
                }]
            },
            options: {
                plugins: {
                    datalabels: {
                        anchor: 'end', align: 'end',
                        color: '#555'
                    }
                },
                scales: { 
                    y: { beginAtZero: true },
                    x: { ticks: { maxRotation: 45, minRotation: 45, autoSkip: false } }
                }
            }
        });
    }

    function stackedCurrencyOptions(chartKey) {
        const fmt = v => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
        return {
            plugins: {
                datalabels: {
                    display: ctx => ctx.dataset.data[ctx.dataIndex] > 0,
                    anchor: 'center', align: 'center',
                    formatter: v => v > 0 ? fmt(v) : '',
                    color: 'white', font: { size: 10, weight: 'bold' }
                },
                tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } }
            },
            responsive: true,
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true, ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR') } }
            }
        };
    }

    function renderCashflowChart(labels, paymentData, creditData, bonusData) {
        const ctx = document.getElementById('cashflowChart').getContext('2d');
        if (charts.cashflow) charts.cashflow.destroy();
        charts.cashflow = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Pagamentos Diretos (Dinheiro/PIX/Cartão)', data: paymentData, backgroundColor: '#28a745', stack: 's' },
                    { label: 'Crédito Pré-pago Consumido',  data: creditData,  backgroundColor: '#007bff', stack: 's' },
                    { label: 'Bônus Consumido',             data: bonusData,   backgroundColor: '#fd7e14', stack: 's' }
                ]
            },
            options: stackedCurrencyOptions('cashflow')
        });
    }

    function renderStockChart(labels, paymentBalanceData, bonusBalanceData) {
        const ctx = document.getElementById('stockChart').getContext('2d');
        if (charts.stock) charts.stock.destroy();
        charts.stock = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Crédito Pré-pago Disponível', data: paymentBalanceData, backgroundColor: '#007bff', stack: 's' },
                    { label: 'Bônus Disponível',             data: bonusBalanceData,   backgroundColor: '#fd7e14', stack: 's' }
                ]
            },
            options: stackedCurrencyOptions('stock')
        });
    }

    // --- Lógica de Controle ---

    function updateView() {
        const period = periodSelector.value;
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const bucketSize = parseFloat(bucketSizeInput.value) || null;
        fetchAndRenderReports(period, startDate, endDate, bucketSize);
    }
    
    periodSelector.addEventListener('change', updateView);
    filterButton.addEventListener('click', updateView);
    clearButton.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        bucketSizeInput.value = '';
        updateView();
    });

    // Carga inicial dos dados
    updateView();
});