document.addEventListener('DOMContentLoaded', () => {
    const endDateInput = document.getElementById('end-date');
    const filterButton = document.getElementById('filter-button');
    const segmentsContainer = document.getElementById('segments-container');
    const loadingMessage = document.getElementById('loading-message');

    // Define os segmentos e suas descrições
    const segmentDefinitions = {
        'Campeões': { description: 'Compraram recentemente, compram com frequência e gastam muito. Seus melhores clientes!', color: '#28a745' },
        'Clientes Leais': { description: 'Compram com frequência e respondem bem a promoções. Base sólida de clientes.', color: '#20c997' },
        'Potenciais Legalistas': { description: 'Compradores recentes com frequência média. Podem se tornar leais com um empurrãozinho.', color: '#17a2b8' },
        'Novos Clientes': { description: 'Fizeram sua primeira compra recentemente. Precisam de atenção para voltarem.', color: '#007bff' },
        'Promissores': { description: 'Compradores recentes, mas que não gastaram muito. Potencial a ser desenvolvido.', color: '#6f42c1' },
        'Precisam de Atenção': { description: 'Recência e frequência abaixo da média. Podem ser reativados com ofertas.', color: '#ffc107' },
        'Em Risco': { description: 'Compraram com frequência e gastaram bem, mas não voltam há algum tempo.', color: '#fd7e14' },
        'Hibernando': { description: 'Última compra foi há muito tempo. Baixa frequência e valor. Podem ser perdidos.', color: '#dc3545' },
        'Clientes Perdidos': { description: 'Seus piores clientes. Não compram há muito, muito tempo.', color: '#6c757d' }
    };

    function formatCurrency(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return 'R$ 0,00';
        const amount = amountInCents / 100;
        return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    async function fetchAndRenderRFM(endDate) {
        loadingMessage.style.display = 'block';
        segmentsContainer.innerHTML = '';

        try {
            let url = '/api/reports/rfm-analysis';
            if (endDate) {
                url += `?end_date=${endDate}`;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
            
            const segments = await response.json();

            // Limpa o container e renderiza os novos cards
            segmentsContainer.innerHTML = '';
            
            for (const segmentName in segmentDefinitions) {
                const customers = segments[segmentName] || [];
                const definition = segmentDefinitions[segmentName];

                let tableRows = '<tr><th>Cliente</th><th>Recência (dias)</th><th>Frequência</th><th>Valor</th></tr>';
                if (customers.length > 0) {
                    customers.forEach(c => {
                        tableRows += `
                            <tr>
                                <td>${c.customer_name}</td>
                                <td>${c.recency}</td>
                                <td>${c.frequency}</td>
                                <td>${formatCurrency(c.monetary)}</td>
                            </tr>
                        `;
                    });
                } else {
                    tableRows = '<tr><td colspan="4">Nenhum cliente neste segmento.</td></tr>';
                }

                const cardHTML = `
                    <div class="segment-card" style="border-top-color: ${definition.color};">
                        <div class="segment-header">
                            <h3>${segmentName} (${customers.length})</h3>
                            <p>${definition.description}</p>
                        </div>
                        <div class="segment-body">
                            <table class="customer-table">
                                <tbody>${tableRows}</tbody>
                            </table>
                        </div>
                    </div>
                `;
                segmentsContainer.innerHTML += cardHTML;
            }

        } catch (error) {
            console.error("Erro ao carregar análise RFM:", error);
            loadingMessage.innerHTML = '<p>Erro ao carregar os dados. Tente novamente.</p>';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    // Define a data de hoje como padrão no input
    endDateInput.value = new Date().toISOString().split('T')[0];

    filterButton.addEventListener('click', () => {
        fetchAndRenderRFM(endDateInput.value);
    });

    // Carga inicial
    fetchAndRenderRFM(endDateInput.value);
});