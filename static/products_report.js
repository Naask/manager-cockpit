document.addEventListener('DOMContentLoaded', () => {

    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const filterButton = document.getElementById('filter-button');
    const clearButton = document.getElementById('clear-filter-button');

    const revenueTableBody = document.querySelector('#revenue-table tbody');
    const quantityTableBody = document.querySelector('#quantity-table tbody');

    function formatCurrency(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return 'R$ 0,00';
        const amount = amountInCents / 100;
        return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    async function fetchAndRenderReports(startDate, endDate) {
        revenueTableBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
        quantityTableBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
        
        try {
            let url = '/api/reports/products-performance';
            if (startDate && endDate) {
                url += `?start_date=${startDate}&end_date=${endDate}`;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
            
            const responseData = await response.json();
            const products = responseData.products;
            const grandTotalRevenue = responseData.grand_total_revenue;
            const grandTotalOrders = responseData.grand_total_orders;
            const grandTotalCustomers = responseData.grand_total_customers;

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
        fetchAndRenderReports(startDate, endDate);
    }

    filterButton.addEventListener('click', updateView);
    clearButton.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        updateView();
    });

    // Carga inicial (todos os períodos)
    updateView();
});