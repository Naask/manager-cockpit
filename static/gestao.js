document.addEventListener('DOMContentLoaded', () => {

    const filterButton = document.getElementById('filter-button');
    const clearButton = document.getElementById('clear-filter-button');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');

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

    async function fetchFinancialData(startDate, endDate) {
        try {
            let url = '/api/gestao/financial-summary';
            if (startDate && endDate) {
                url += `?start_date=${startDate}&end_date=${endDate}`;
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Erro na API: ${response.statusText}`);
            }
            const data = await response.json();

            // 1. Preenche os KPIs
            const kpis = data.kpis;
            const pendingBalance = (kpis.gross_revenue || 0) - (kpis.total_received || 0);
            
            document.getElementById('kpi-gross-revenue').textContent = formatCurrency(kpis.gross_revenue);
            document.getElementById('kpi-total-received').textContent = formatCurrency(kpis.total_received);
            document.getElementById('kpi-pending-balance').textContent = formatCurrency(pendingBalance);

            // 2. Preenche a tabela de Pedidos Pendentes
            const pendingTableBody = document.querySelector('#pending-orders-table tbody');
            pendingTableBody.innerHTML = ''; 
            data.pending_orders.forEach(order => {
                const row = pendingTableBody.insertRow();
                const status = order.payment_status.replace('_', ' ');
                row.innerHTML = `
                    <td>${order.order_id}</td>
                    <td>${order.customer_name}</td>
                    <td>${status}</td>
                    <td>${formatCurrency(order.total_amount)}</td>
                    <td>${formatCurrency(order.total_paid)}</td>
                    <td><strong>${formatCurrency(order.remaining_balance)}</strong></td>
                `;
            });

            // 3. NOVA LÓGICA: Preenche a tabela de Todos os Pedidos Concluídos
            const completedTableBody = document.querySelector('#all-completed-orders-table tbody');
            completedTableBody.innerHTML = '';
            data.all_completed_orders.forEach(order => {
                const row = completedTableBody.insertRow();
                row.innerHTML = `
                    <td>${formatDate(order.completed_at)}</td>
                    <td>${order.order_id}</td>
                    <td>${order.customer_name}</td>
                    <td>${formatCurrency(order.total_amount)}</td>
                `;
            });

        } catch (error) {
            console.error("Erro ao buscar dados financeiros:", error);
            alert("Não foi possível carregar os dados financeiros. Verifique o console para mais detalhes.");
        }
    }

    filterButton.addEventListener('click', () => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        fetchFinancialData(startDate, endDate);
    });

    clearButton.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        fetchFinancialData();
    });

    fetchFinancialData();
});