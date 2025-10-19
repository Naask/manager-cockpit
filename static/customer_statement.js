document.addEventListener('DOMContentLoaded', () => {
    const customerDataElement = document.getElementById('customer-data');
    const customerInfoContainer = document.getElementById('customer-info-container');
    const transactionsTableBody = document.querySelector('#transactions-table tbody');
    
    // Pega o ID do cliente injetado pelo Flask no template
    const customerId = JSON.parse(customerDataElement.textContent).customer_id;

    const transactionTypes = {
        'SALE': { text: 'Venda', class: 'debit' },
        'PAYMENT_RECEIVED': { text: 'Pagamento Recebido', class: 'credit' },
        'BONUS_ADDED': { text: 'Bônus Adicionado', class: 'credit' },
        'DISCOUNT_APPLIED': { text: 'Desconto Aplicado', class: 'debit' },
        'BALANCE_CORRECTION_CREDIT': { text: 'Ajuste (Crédito)', class: 'credit' },
        'BALANCE_CORRECTION_DEBIT': { text: 'Ajuste (Débito)', class: 'debit' }
    };
    
    function formatCurrency(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return 'R$ 0,00';
        const amount = amountInCents / 100;
        return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    async function fetchAndRenderStatement(customerId) {
        try {
            const response = await fetch(`/api/reports/customer-statement/${customerId}`);
            if (!response.ok) throw new Error('Falha ao buscar dados do cliente');
            const data = await response.json();

            // Renderiza o cabeçalho com nome e saldo
            const info = data.customer_info;
            customerInfoContainer.innerHTML = `
                <div class="customer-header">
                    <div>
                        <h1>${info.name}</h1>
                        <span>${info.phone || ''} | ${info.email || ''}</span>
                    </div>
                    <div class="customer-balance">
                        <span>Saldo Atual</span>
                        <strong>${formatCurrency(info.current_balance)}</strong>
                    </div>
                </div>
            `;

            // Renderiza a tabela de transações
            transactionsTableBody.innerHTML = '';
            data.transactions.forEach(tx => {
                const typeInfo = transactionTypes[tx.transaction_type] || { text: tx.transaction_type, class: '' };
                const sign = typeInfo.class === 'credit' ? '+' : '-';

                const row = transactionsTableBody.insertRow();
                row.innerHTML = `
                    <td>${formatDate(tx.timestamp)}</td>
                    <td>${typeInfo.text}</td>
                    <td>${tx.description}</td>
                    <td class="${typeInfo.class}">${sign} ${formatCurrency(tx.amount)}</td>
                `;
            });

        } catch (error) {
            console.error("Erro ao carregar extrato:", error);
            customerInfoContainer.innerHTML = `<p>Não foi possível carregar o extrato do cliente.</p>`;
        }
    }

    if (customerId) {
        fetchAndRenderStatement(customerId);
    }
});