document.addEventListener('DOMContentLoaded', () => {

    // Função para formatar números para o padrão monetário brasileiro
    function formatCurrency(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return 'R$ 0,00';
        const amount = amountInCents / 100;
        return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    async function fetchFinancialData() {
        try {
            const response = await fetch('/api/gestao/financial-summary');
            const data = await response.json();

            // 1. Preenche os KPIs
            const kpis = data.kpis;
            const pendingBalance = kpis.gross_revenue - kpis.total_received;
            
            document.getElementById('kpi-gross-revenue').textContent = formatCurrency(kpis.gross_revenue);
            document.getElementById('kpi-total-received').textContent = formatCurrency(kpis.total_received);
            document.getElementById('kpi-pending-balance').textContent = formatCurrency(pendingBalance);

            // 2. Preenche a tabela de Pedidos Pendentes
            const tableBody = document.querySelector('#pending-orders-table tbody');
            tableBody.innerHTML = ''; // Limpa a tabela antes de preencher

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
        }
    }

    fetchFinancialData();
});