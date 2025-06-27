document.addEventListener('DOMContentLoaded', () => {

    const inProgressTbody = document.getElementById('in-progress-tbody');
    const awaitingDeliveryTbody = document.getElementById('awaiting-delivery-tbody');
    const awaitingPickupTbody = document.getElementById('awaiting-pickup-tbody');
    
    const inProgressCount = document.getElementById('in-progress-count');
    const awaitingDeliveryCount = document.getElementById('awaiting-delivery-count');
    const awaitingPickupCount = document.getElementById('awaiting-pickup-count');

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });
    }

    async function fetchAndRenderData() {
        try {
            const response = await fetch('/api/cockpit/active-orders');
            const data = await response.json();

            // Renderiza a coluna "Em Execução"
            inProgressTbody.innerHTML = '';
            inProgressCount.textContent = data.in_progress.length;
            data.in_progress.forEach(order => {
                const row = inProgressTbody.insertRow();
                row.innerHTML = `
                    <td>${formatDate(order.pickup_datetime)}</td>
                    <td>${order.order_id}</td>
                    <td>${order.customer_name}</td>
                `;
            });

            // Renderiza a coluna "Aguardando Entrega"
            awaitingDeliveryTbody.innerHTML = '';
            awaitingDeliveryCount.textContent = data.awaiting_delivery.length;
            data.awaiting_delivery.forEach(order => {
                const row = awaitingDeliveryTbody.insertRow();
                row.innerHTML = `
                    <td>${formatDate(order.completed_at)}</td>
                    <td>${order.order_id}</td>
                    <td>${order.customer_name}</td>
                `;
            });

            // Renderiza a coluna "Aguardando Retirada"
            awaitingPickupTbody.innerHTML = '';
            awaitingPickupCount.textContent = data.awaiting_pickup.length;
            data.awaiting_pickup.forEach(order => {
                const row = awaitingPickupTbody.insertRow();
                row.innerHTML = `
                    <td>${formatDate(order.completed_at)}</td>
                    <td>${order.order_id}</td>
                    <td>${order.customer_name}</td>
                `;
            });

        } catch (error) {
            console.error("Erro ao buscar dados para o cockpit:", error);
        }
    }

    fetchAndRenderData();
    setInterval(fetchAndRenderData, 60000); // Atualiza a cada 60 segundos
});