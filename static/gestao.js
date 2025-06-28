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

    async function fetchFinancialData(startDate, endDate) {
        try {
            // Constrói a URL com os parâmetros de data, apenas se eles forem fornecidos
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
            const tableBody = document.querySelector('#pending-orders-table tbody');
            tableBody.innerHTML = ''; 

            data.pending_orders.forEach(order => {
                const row = tableBody.insertRow();
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

        } catch (error) {
            console.error("Erro ao buscar dados financeiros:", error);
            alert("Não foi possível carregar os dados financeiros. Verifique o console para mais detalhes.");
        }
    }

    // Listener para o botão de filtro
    filterButton.addEventListener('click', () => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        // Permite a busca mesmo com as datas em branco
        fetchFinancialData(startDate, endDate);
    });

    // Listener para o novo botão de limpar
    clearButton.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        // Chama a função sem parâmetros para carregar todos os períodos
        fetchFinancialData();
    });

    // Carrega os dados de todos os tempos ao iniciar a página
    fetchFinancialData();
});