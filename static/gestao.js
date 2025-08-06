document.addEventListener('DOMContentLoaded', () => {

    const filterButton = document.getElementById('filter-button');
    const clearButton = document.getElementById('clear-filter-button');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const customerFilter = document.getElementById('customer-filter');

    function formatCurrency(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return 'R$ 0,00';
        const amount = amountInCents / 100;
        return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year:'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    async function populateCustomerFilter() {
        try {
            const response = await fetch('/api/customers');
            if (!response.ok) throw new Error('Falha ao buscar clientes');
            const customers = await response.json();
            
            customers.forEach(customer => {
                const option = document.createElement('option');
                option.value = customer.customer_id;
                option.textContent = customer.name;
                customerFilter.appendChild(option);
            });
        } catch (error) {
            console.error("Erro ao popular filtro de clientes:", error);
        }
    }

    async function fetchFinancialData(startDate, endDate, customerId) {
        try {
            let url = '/api/gestao/financial-summary';
            const params = new URLSearchParams();
            if (startDate && endDate) {
                params.append('start_date', startDate);
                params.append('end_date', endDate);
            }
            if (customerId) {
                params.append('customer_id', customerId);
            }
            url += `?${params.toString()}`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Erro na API: ${response.statusText}`);
            }
            const data = await response.json();

            // 1. Preenche os KPIs de pedidos CONCLUÍDOS
            const completedKpis = data.completed_kpis;
            const pendingBalance = (completedKpis.gross_revenue || 0) - (completedKpis.total_received || 0);
            
            document.getElementById('kpi-gross-revenue').textContent = formatCurrency(completedKpis.gross_revenue);
            document.getElementById('kpi-total-received').textContent = formatCurrency(completedKpis.total_received);
            document.getElementById('kpi-pending-balance').textContent = formatCurrency(pendingBalance);
            
            document.getElementById('kpi-orders-count').textContent = completedKpis.orders_count || 0;
            document.getElementById('kpi-paid-orders-count').textContent = completedKpis.paid_orders_count || 0;
            document.getElementById('pending-orders-count').textContent = data.pending_orders.length;

            // 2. Preenche os KPIs de pedidos em ABERTO
            const openKpis = data.open_orders_kpis;
            document.getElementById('kpi-total-open-count').textContent = openKpis.total_open_count || 0;
            document.getElementById('kpi-total-open-value').textContent = formatCurrency(openKpis.total_open_value);
            document.getElementById('kpi-open-unpaid-count').textContent = openKpis.open_and_unpaid_count || 0;
            document.getElementById('kpi-open-unpaid-value').textContent = formatCurrency(openKpis.open_and_unpaid_value);
            document.getElementById('kpi-open-paid-count').textContent = openKpis.open_and_paid_count || 0;
            document.getElementById('kpi-open-paid-value').textContent = formatCurrency(openKpis.open_and_paid_value);

            // 3. Preenche a tabela de Pedidos Pendentes com totalizadores
            const pendingTableBody = document.querySelector('#pending-orders-table tbody');
            pendingTableBody.innerHTML = '';
            document.getElementById('pending-orders-count2').textContent = data.pending_orders.length;
            let pendingTotalAmount = 0;
            let pendingTotalPaid = 0;
            let pendingRemainingBalance = 0;
            data.pending_orders.forEach(order => {
                const row = pendingTableBody.insertRow();
                const status = order.payment_status.replace('_', ' ');
                row.innerHTML = `
                    <td>${formatDate(order.created_at)}</td>
                    <td>${formatDate(order.completed_at)}</td>
                    <td>${order.order_id}</td>
                    <td>${order.customer_name}</td>
                    <td>${status}</td>
                    <td>${formatCurrency(order.total_amount)}</td>
                    <td>${formatCurrency(order.total_paid)}</td>
                    <td><strong>${formatCurrency(order.remaining_balance)}</strong></td>
                `;
                pendingTotalAmount += order.total_amount;
                pendingTotalPaid += order.total_paid;
                pendingRemainingBalance += order.remaining_balance;
            });
            document.getElementById('pending-total-amount').textContent = formatCurrency(pendingTotalAmount);
            document.getElementById('pending-total-paid').textContent = formatCurrency(pendingTotalPaid);
            document.getElementById('pending-remaining-balance').textContent = formatCurrency(pendingRemainingBalance);

            // 4. Preenche a tabela de Todos os Pedidos Concluídos com totalizadores
            const completedTableBody = document.querySelector('#all-completed-orders-table tbody');
            completedTableBody.innerHTML = '';
            document.getElementById('all-completed-orders-count').textContent = data.all_completed_orders.length;
            let completedTotalAmount = 0;
            data.all_completed_orders.forEach(order => {
                const row = completedTableBody.insertRow();
                row.innerHTML = `
                    <td>${formatDate(order.created_at)}</td>
                    <td>${formatDate(order.completed_at)}</td>
                    <td>${order.order_id}</td>
                    <td>${order.customer_name}</td>
                    <td>${formatCurrency(order.total_amount)}</td>
                `;
                completedTotalAmount += order.total_amount;
            });
            document.getElementById('completed-total-amount').textContent = formatCurrency(completedTotalAmount);

            // 5. Preenche a tabela de Todos os Pedidos em Andamento
            const inProgressTableBody = document.querySelector('#in-progress-orders-table tbody');
            inProgressTableBody.innerHTML = '';
            document.getElementById('in-progress-orders-count').textContent = data.in_progress_orders.length;
            data.in_progress_orders.forEach(order => {
                const row = inProgressTableBody.insertRow();
                const executionStatus = order.execution_status.replace(/_/g, ' ');
                const paymentStatus = order.payment_status.replace(/_/g, ' ');
                row.innerHTML = `<td>${order.order_id}</td><td>${order.customer_name}</td><td>${executionStatus}</td><td>${formatDate(order.pickup_datetime)}</td><td>${paymentStatus}</td><td>${formatCurrency(order.total_amount)}</td>`;
            });

        } catch (error) {
            console.error("Erro ao buscar dados financeiros:", error);
            alert("Não foi possível carregar os dados financeiros. Verifique o console para mais detalhes.");
        }
    }

    function updateView() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const customerId = customerFilter.value; // Pega o valor do novo filtro
        fetchFinancialData(startDate, endDate, customerId);
    }
    
    filterButton.addEventListener('click', updateView);

    clearButton.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        customerFilter.value = ''; // Limpa também o filtro de cliente
        updateView();
    });

    // Carga inicial
    populateCustomerFilter(); // Popula o select de clientes
    updateView(); // Faz a primeira busca de dados
});