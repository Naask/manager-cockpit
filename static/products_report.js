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
        revenueTableBody.innerHTML = '<tr><td colspan="3">Carregando...</td></tr>';
        quantityTableBody.innerHTML = '<tr><td colspan="3">Carregando...</td></tr>';
        
        try {
            let url = '/api/reports/product-performance';
            if (startDate && endDate) {
                url += `?start_date=${startDate}&end_date=${endDate}`;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
            
            const data = await response.json();

            // Limpa as tabelas
            revenueTableBody.innerHTML = '';
            quantityTableBody.innerHTML = '';

            if (data.length === 0) {
                revenueTableBody.innerHTML = '<tr><td colspan="3">Nenhum dado encontrado para o período.</td></tr>';
                quantityTableBody.innerHTML = '<tr><td colspan="3">Nenhum dado encontrado para o período.</td></tr>';
                return;
            }

            // Renderiza a tabela de Receita (já vem ordenada do backend)
            data.forEach(product => {
                const row = revenueTableBody.insertRow();
                row.innerHTML = `
                    <td>${product.product_name}</td>
                    <td>${product.product_category}</td>
                    <td><strong>${formatCurrency(product.total_revenue)}</strong></td>
                `;
            });

            // Reordena os dados por quantidade para a segunda tabela
            const sortedByQuantity = data.sort((a, b) => b.total_quantity - a.total_quantity);
            
            // Renderiza a tabela de Frequência
            sortedByQuantity.forEach(product => {
                const row = quantityTableBody.insertRow();
                row.innerHTML = `
                    <td>${product.product_name}</td>
                    <td>${product.product_category}</td>
                    <td><strong>${product.total_quantity.toFixed(1)}</strong></td>
                `;
            });

        } catch (error) {
            console.error("Erro ao carregar dados de produtos:", error);
            revenueTableBody.innerHTML = '<tr><td colspan="3">Erro ao carregar dados.</td></tr>';
            quantityTableBody.innerHTML = '<tr><td colspan="3">Erro ao carregar dados.</td></tr>';
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