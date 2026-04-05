document.addEventListener('DOMContentLoaded', () => {

    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const periodSelector = document.getElementById('period-selector');
    const filterButton = document.getElementById('filter-button');
    const clearButton = document.getElementById('clear-filter-button');
    const productSelector = document.getElementById('product-selector');
    const resetSelectionButton = document.getElementById('reset-selection-button');

    const revenueTableBody = document.querySelector('#revenue-table tbody');
    const quantityTableBody = document.querySelector('#quantity-table tbody');
    const revenueChartCanvas = document.getElementById('product-metrics-chart');
    const quantityChartCanvas = document.getElementById('product-quantity-chart');
    const avgQuantityChartCanvas = document.getElementById('avg-quantity-chart');
    const avgPriceChartCanvas = document.getElementById('avg-price-chart');
    const avgTicketChartCanvas = document.getElementById('avg-ticket-chart');
    const totalTicketsChartCanvas = document.getElementById('total-tickets-chart');
    const totalCustomersChartCanvas = document.getElementById('total-customers-chart');

    let productsCache = [];
    let currentRows = [];
    let currentPeriodLabels = [];
    let productRevenueChart = null;
    let productQuantityChart = null;
    let avgQuantityChart = null;
    let avgPriceChart = null;
    let avgTicketChart = null;
    let totalTicketsChart = null;
    let totalCustomersChart = null;

    function formatCurrency(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return 'R$ 0,00';
        const amount = amountInCents / 100;
        return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatNumber(value) {
        if (value === null || value === undefined) return '0';
        return Number(value).toLocaleString('pt-BR');
    }

    function buildProductSelector(products) {
        productSelector.innerHTML = '';
        products.forEach((product, index) => {
            const option = document.createElement('option');
            option.value = product.product_id;
            option.textContent = `${product.product_name} (${formatCurrency(product.total_revenue)})`;
            if (index < 3) option.selected = true;
            productSelector.appendChild(option);
        });
    }

    function getSelectedProducts() {
        const selectedIds = Array.from(productSelector.selectedOptions).map(option => Number(option.value));
        return productsCache.filter(product => selectedIds.includes(product.product_id));
    }

    function getUniqueProducts(rows) {
        const productMap = {};
        rows.forEach(row => {
            const productId = Number(row.product_id);
            if (!productMap[productId]) {
                productMap[productId] = {
                    product_id: productId,
                    product_name: row.product_name,
                    product_category: row.product_category,
                    total_quantity: 0,
                    total_revenue: 0,
                    order_appearence_count: 0,
                    distinct_customer_count: 0
                };
            }
            productMap[productId].total_quantity += Number(row.total_quantity || 0);
            productMap[productId].total_revenue += Number(row.total_revenue || 0);
            productMap[productId].order_appearence_count += Number(row.order_appearence_count || 0);
            productMap[productId].distinct_customer_count += Number(row.distinct_customer_count || 0);
        });
        return Object.values(productMap).sort((a, b) => b.total_revenue - a.total_revenue);
    }

    function renderRevenueChart(rows, periodLabels) {
        revenueChartCanvas.style.height = '260px';
        revenueChartCanvas.style.maxHeight = '260px';
        const selectedProducts = getSelectedProducts();
        const activeProducts = selectedProducts.length ? selectedProducts : productsCache.slice(0, 5);

        const colors = ['#17a2b8', '#6610f2', '#20c997', '#fd7e14', '#6f42c1', '#e83e8c'];
        const datasets = [];
        let labels = [];

        if (periodLabels.length > 1) {
            labels = periodLabels;
            const rowMap = {};
            rows.forEach(row => {
                const productId = Number(row.product_id);
                rowMap[productId] = rowMap[productId] || {};
                rowMap[productId][row.period] = Number(row.total_revenue || 0);
            });

            activeProducts.forEach((product, index) => {
                datasets.push({
                    label: product.product_name,
                    data: labels.map(period => rowMap[product.product_id]?.[period] ?? 0),
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length],
                    fill: false,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 6
                });
            });
        } else {
            labels = activeProducts.map(product => product.product_name);
            const revenueData = activeProducts.map(product => product.total_revenue || 0);
            datasets.push({
                type: 'bar',
                label: 'Receita (R$)',
                data: revenueData,
                backgroundColor: '#17a2b8'
            });
        }

        if (productRevenueChart) {
            productRevenueChart.destroy();
        }

        productRevenueChart = new Chart(revenueChartCanvas.getContext('2d'), {
            type: periodLabels.length > 1 ? 'line' : 'bar',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Receita (R$)' },
                        ticks: {
                            callback: value => formatCurrency(value)
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                return `${label}: ${formatCurrency(value)}`;
                            }
                        }
                    },
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
    }

    function renderQuantityChart(rows, periodLabels) {
        quantityChartCanvas.style.height = '260px';
        quantityChartCanvas.style.maxHeight = '260px';
        const selectedProducts = getSelectedProducts();
        const activeProducts = selectedProducts.length ? selectedProducts : productsCache.slice(0, 5);

        const colors = ['#28a745', '#fd7e14', '#6610f2', '#20c997', '#dc3545', '#007bff'];
        const datasets = [];
        let labels = [];

        if (periodLabels.length > 1) {
            labels = periodLabels;
            const rowMap = {};
            rows.forEach(row => {
                const productId = Number(row.product_id);
                rowMap[productId] = rowMap[productId] || {};
                rowMap[productId][row.period] = Number(row.total_quantity || 0);
            });

            activeProducts.forEach((product, index) => {
                datasets.push({
                    label: product.product_name,
                    data: labels.map(period => rowMap[product.product_id]?.[period] ?? 0),
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length],
                    fill: false,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 6
                });
            });
        } else {
            labels = activeProducts.map(product => product.product_name);
            const quantityData = activeProducts.map(product => product.total_quantity || 0);
            datasets.push({
                type: 'bar',
                label: 'Quantidade Vendida',
                data: quantityData,
                backgroundColor: '#28a745'
            });
        }

        if (productQuantityChart) {
            productQuantityChart.destroy();
        }

        productQuantityChart = new Chart(quantityChartCanvas.getContext('2d'), {
            type: periodLabels.length > 1 ? 'line' : 'bar',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Quantidade Vendida' }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                return `${label}: ${formatNumber(value)}`;
                            }
                        }
                    },
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
    }

    function renderAvgQuantityChart(rows, periodLabels) {
        avgQuantityChartCanvas.style.height = '260px';
        avgQuantityChartCanvas.style.maxHeight = '260px';
        const selectedProducts = getSelectedProducts();
        const activeProducts = selectedProducts.length ? selectedProducts : productsCache.slice(0, 5);

        const colors = ['#ffc107', '#fd7e14', '#6610f2', '#20c997', '#dc3545', '#007bff'];
        const datasets = [];
        let labels = [];

        if (periodLabels.length > 1) {
            labels = periodLabels;
            const rowMap = {};
            rows.forEach(row => {
                const productId = Number(row.product_id);
                rowMap[productId] = rowMap[productId] || {};
                const avgQty = Number(row.order_appearence_count || 0) > 0 ? Number(row.total_quantity || 0) / Number(row.order_appearence_count) : 0;
                rowMap[productId][row.period] = avgQty;
            });

            activeProducts.forEach((product, index) => {
                datasets.push({
                    label: product.product_name,
                    data: labels.map(period => rowMap[product.product_id]?.[period] ?? 0),
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length],
                    fill: false,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 6
                });
            });
        } else {
            labels = activeProducts.map(product => product.product_name);
            const avgQuantityData = activeProducts.map(product => {
                return product.order_appearence_count > 0 ? product.total_quantity / product.order_appearence_count : 0;
            });
            datasets.push({
                type: 'bar',
                label: 'Quantidade Média por Venda',
                data: avgQuantityData,
                backgroundColor: '#ffc107'
            });
        }

        if (avgQuantityChart) {
            avgQuantityChart.destroy();
        }

        avgQuantityChart = new Chart(avgQuantityChartCanvas.getContext('2d'), {
            type: periodLabels.length > 1 ? 'line' : 'bar',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Quantidade Média' }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                return `${label}: ${formatNumber(value)}`;
                            }
                        }
                    },
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
    }

    function renderAvgPriceChart(rows, periodLabels) {
        avgPriceChartCanvas.style.height = '260px';
        avgPriceChartCanvas.style.maxHeight = '260px';
        const selectedProducts = getSelectedProducts();
        const activeProducts = selectedProducts.length ? selectedProducts : productsCache.slice(0, 5);

        const colors = ['#6f42c1', '#e83e8c', '#17a2b8', '#28a745', '#fd7e14', '#6610f2'];
        const datasets = [];
        let labels = [];

        if (periodLabels.length > 1) {
            labels = periodLabels;
            const rowMap = {};
            rows.forEach(row => {
                const productId = Number(row.product_id);
                rowMap[productId] = rowMap[productId] || {};
                const avgPrice = Number(row.total_quantity || 0) > 0 ? Number(row.total_revenue || 0) / Number(row.total_quantity) : 0;
                rowMap[productId][row.period] = avgPrice;
            });

            activeProducts.forEach((product, index) => {
                datasets.push({
                    label: product.product_name,
                    data: labels.map(period => rowMap[product.product_id]?.[period] ?? 0),
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length],
                    fill: false,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 6
                });
            });
        } else {
            labels = activeProducts.map(product => product.product_name);
            const avgPriceData = activeProducts.map(product => {
                return product.total_quantity > 0 ? product.total_revenue / product.total_quantity : 0;
            });
            datasets.push({
                type: 'bar',
                label: 'Preço Médio por Unidade',
                data: avgPriceData,
                backgroundColor: '#6f42c1'
            });
        }

        if (avgPriceChart) {
            avgPriceChart.destroy();
        }

        avgPriceChart = new Chart(avgPriceChartCanvas.getContext('2d'), {
            type: periodLabels.length > 1 ? 'line' : 'bar',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Preço Médio (R$)' },
                        ticks: {
                            callback: value => formatCurrency(value)
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                return `${label}: ${formatCurrency(value)}`;
                            }
                        }
                    },
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
    }

    function renderAvgTicketChart(rows, periodLabels) {
        avgTicketChartCanvas.style.height = '260px';
        avgTicketChartCanvas.style.maxHeight = '260px';
        const selectedProducts = getSelectedProducts();
        const activeProducts = selectedProducts.length ? selectedProducts : productsCache.slice(0, 5);

        const colors = ['#dc3545', '#007bff', '#ffc107', '#28a745', '#fd7e14', '#6610f2'];
        const datasets = [];
        let labels = [];

        if (periodLabels.length > 1) {
            labels = periodLabels;
            const rowMap = {};
            rows.forEach(row => {
                const productId = Number(row.product_id);
                rowMap[productId] = rowMap[productId] || {};
                const avgTicket = Number(row.order_appearence_count || 0) > 0 ? Number(row.total_revenue || 0) / Number(row.order_appearence_count) : 0;
                rowMap[productId][row.period] = avgTicket;
            });

            activeProducts.forEach((product, index) => {
                datasets.push({
                    label: product.product_name,
                    data: labels.map(period => rowMap[product.product_id]?.[period] ?? 0),
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length],
                    fill: false,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 6
                });
            });
        } else {
            labels = activeProducts.map(product => product.product_name);
            const avgTicketData = activeProducts.map(product => {
                return product.order_appearence_count > 0 ? product.total_revenue / product.order_appearence_count : 0;
            });
            datasets.push({
                type: 'bar',
                label: 'Ticket Médio',
                data: avgTicketData,
                backgroundColor: '#dc3545'
            });
        }

        if (avgTicketChart) {
            avgTicketChart.destroy();
        }

        avgTicketChart = new Chart(avgTicketChartCanvas.getContext('2d'), {
            type: periodLabels.length > 1 ? 'line' : 'bar',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Ticket Médio (R$)' },
                        ticks: {
                            callback: value => formatCurrency(value)
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                return `${label}: ${formatCurrency(value)}`;
                            }
                        }
                    },
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
    }

    function renderTotalTicketsChart(rows, periodLabels) {
        totalTicketsChartCanvas.style.height = '260px';
        totalTicketsChartCanvas.style.maxHeight = '260px';
        const selectedProducts = getSelectedProducts();
        const activeProducts = selectedProducts.length ? selectedProducts : productsCache.slice(0, 5);

        const colors = ['#17a2b8', '#6610f2', '#20c997', '#fd7e14', '#6f42c1', '#e83e8c'];
        const datasets = [];
        let labels = [];

        if (periodLabels.length > 1) {
            labels = periodLabels;
            const rowMap = {};
            rows.forEach(row => {
                const productId = Number(row.product_id);
                rowMap[productId] = rowMap[productId] || {};
                rowMap[productId][row.period] = Number(row.order_appearence_count || 0);
            });

            activeProducts.forEach((product, index) => {
                datasets.push({
                    label: product.product_name,
                    data: labels.map(period => rowMap[product.product_id]?.[period] ?? 0),
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length],
                    fill: false,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 6
                });
            });
        } else {
            labels = activeProducts.map(product => product.product_name);
            const ticketsData = activeProducts.map(product => product.order_appearence_count || 0);
            datasets.push({
                type: 'bar',
                label: 'Total de Pedidos',
                data: ticketsData,
                backgroundColor: '#17a2b8'
            });
        }

        if (totalTicketsChart) {
            totalTicketsChart.destroy();
        }

        totalTicketsChart = new Chart(totalTicketsChartCanvas.getContext('2d'), {
            type: periodLabels.length > 1 ? 'line' : 'bar',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Total de Pedidos' }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                return `${label}: ${formatNumber(value)}`;
                            }
                        }
                    },
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
    }

    function renderTotalCustomersChart(rows, periodLabels) {
        totalCustomersChartCanvas.style.height = '260px';
        totalCustomersChartCanvas.style.maxHeight = '260px';
        const selectedProducts = getSelectedProducts();
        const activeProducts = selectedProducts.length ? selectedProducts : productsCache.slice(0, 5);

        const colors = ['#28a745', '#fd7e14', '#6610f2', '#20c997', '#dc3545', '#007bff'];
        const datasets = [];
        let labels = [];

        if (periodLabels.length > 1) {
            labels = periodLabels;
            const rowMap = {};
            rows.forEach(row => {
                const productId = Number(row.product_id);
                rowMap[productId] = rowMap[productId] || {};
                rowMap[productId][row.period] = Number(row.distinct_customer_count || 0);
            });

            activeProducts.forEach((product, index) => {
                datasets.push({
                    label: product.product_name,
                    data: labels.map(period => rowMap[product.product_id]?.[period] ?? 0),
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length],
                    fill: false,
                    tension: 0.25,
                    pointRadius: 4,
                    pointHoverRadius: 6
                });
            });
        } else {
            labels = activeProducts.map(product => product.product_name);
            const customersData = activeProducts.map(product => product.distinct_customer_count || 0);
            datasets.push({
                type: 'bar',
                label: 'Total de Clientes',
                data: customersData,
                backgroundColor: '#28a745'
            });
        }

        if (totalCustomersChart) {
            totalCustomersChart.destroy();
        }

        totalCustomersChart = new Chart(totalCustomersChartCanvas.getContext('2d'), {
            type: periodLabels.length > 1 ? 'line' : 'bar',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Total de Clientes' }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                return `${label}: ${formatNumber(value)}`;
                            }
                        }
                    },
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
    }

    async function fetchAndRenderReports(startDate, endDate, period) {
        revenueTableBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
        quantityTableBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
        
        try {
            const params = [];
            if (startDate) params.push(`start_date=${startDate}`);
            if (endDate) params.push(`end_date=${endDate}`);
            if (period) params.push(`period=${period}`);
            let url = '/api/reports/products-performance';
            if (params.length) url += `?${params.join('&')}`;

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
            
            const responseData = await response.json();
            const rows = responseData.products;
            const products = getUniqueProducts(rows);
            const grandTotalRevenue = responseData.grand_total_revenue;
            const grandTotalOrders = responseData.grand_total_orders;
            const grandTotalCustomers = responseData.grand_total_customers;

            productsCache = products;
            currentRows = rows;
            currentPeriodLabels = [...new Set(rows.map(row => row.period).filter(Boolean))].sort();
            buildProductSelector(products);
            renderRevenueChart(rows, currentPeriodLabels);
            renderQuantityChart(rows, currentPeriodLabels);
            renderAvgQuantityChart(rows, currentPeriodLabels);
            renderAvgPriceChart(rows, currentPeriodLabels);
            renderAvgTicketChart(rows, currentPeriodLabels);
            renderTotalTicketsChart(rows, currentPeriodLabels);
            renderTotalCustomersChart(rows, currentPeriodLabels);

            // Limpa as tabelas
            revenueTableBody.innerHTML = '';
            quantityTableBody.innerHTML = '';

            if (products.length === 0) {
                revenueTableBody.innerHTML = '<tr><td colspan="5">Nenhum dado encontrado para o período.</td></tr>';
                quantityTableBody.innerHTML = '<tr><td colspan="5">Nenhum dado encontrado para o período.</td></tr>';
                return;
            }

            // --- Tabela de Receita (já ordenada do backend) ---
            let cumulativeRevenue = 0;
            products.forEach(product => {
                const row = revenueTableBody.insertRow();
                
                const averagePrice = product.total_quantity > 0 ? (product.total_revenue / product.total_quantity) : 0;
                cumulativeRevenue += product.total_revenue;
                const paretoPercentage = grandTotalRevenue > 0 ? (cumulativeRevenue / grandTotalRevenue) * 100 : 0;

                row.innerHTML = `
                    <td>${product.product_name}</td>
                    <td><strong>${formatCurrency(product.total_revenue)}</strong></td>
                    <td>${product.total_quantity.toFixed(1)}</td>
                    <td>${formatCurrency(averagePrice)}</td>
                    <td>${paretoPercentage.toFixed(2)}%</td>
                `;
            });

            // --- Tabela de Frequência ---
            const sortedByFrequency = [...products].sort((a, b) => b.order_appearence_count - a.order_appearence_count);
            
            let cumulativeOrders = 0;
            let cumulativeCustomers = 0;
            sortedByFrequency.forEach(product => {
                const row = quantityTableBody.insertRow();

                cumulativeOrders += product.order_appearence_count;
                cumulativeCustomers += product.distinct_customer_count;

                const orderPareto = grandTotalOrders > 0 ? (cumulativeOrders / grandTotalOrders) * 100 : 0;
                const customerPareto = grandTotalCustomers > 0 ? (cumulativeCustomers / grandTotalCustomers) * 100 : 0;

                row.innerHTML = `
                    <td>${product.product_name}</td>
                    <td><strong>${product.order_appearence_count}</strong></td>
                    <td>${orderPareto.toFixed(2)}%</td>
                    <td>${product.distinct_customer_count}</td>
                    <td>${customerPareto.toFixed(2)}%</td>
                `;
            });

        } catch (error) {
            console.error("Erro ao carregar dados de produtos:", error);
            revenueTableBody.innerHTML = '<tr><td colspan="5">Erro ao carregar dados.</td></tr>';
            quantityTableBody.innerHTML = '<tr><td colspan="5">Erro ao carregar dados.</td></tr>';
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

    productSelector.addEventListener('change', () => {
        renderRevenueChart(currentRows, currentPeriodLabels);
        renderQuantityChart(currentRows, currentPeriodLabels);
        renderAvgQuantityChart(currentRows, currentPeriodLabels);
        renderAvgPriceChart(currentRows, currentPeriodLabels);
        renderAvgTicketChart(currentRows, currentPeriodLabels);
        renderTotalTicketsChart(currentRows, currentPeriodLabels);
        renderTotalCustomersChart(currentRows, currentPeriodLabels);
    });

    resetSelectionButton.addEventListener('click', () => {
        Array.from(productSelector.options).forEach((option, index) => {
            option.selected = index < 3;
        });
        renderRevenueChart(currentRows, currentPeriodLabels);
        renderQuantityChart(currentRows, currentPeriodLabels);
        renderAvgQuantityChart(currentRows, currentPeriodLabels);
        renderAvgPriceChart(currentRows, currentPeriodLabels);
        renderAvgTicketChart(currentRows, currentPeriodLabels);
        renderTotalTicketsChart(currentRows, currentPeriodLabels);
        renderTotalCustomersChart(currentRows, currentPeriodLabels);
    });

    // Carga inicial (todos os períodos)
    updateView();
});