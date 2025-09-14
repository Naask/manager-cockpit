document.addEventListener('DOMContentLoaded', () => {
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const filterButton = document.getElementById('filter-button');
    const planningGrid = document.getElementById('planning-grid');
    const mainContainer = document.querySelector('main');
    const toggleVisibilityButton = document.getElementById('toggle-visibility-button');
    const eyeIconOpen = document.getElementById('eye-icon-open');
    const eyeIconClosed = document.getElementById('eye-icon-closed');

    // Define as datas padrão (hoje até 7 dias para frente)
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 7);
    startDateInput.value = today.toISOString().split('T')[0];
    endDateInput.value = futureDate.toISOString().split('T')[0];

    function formatCurrency(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return '0,00';
        const amount = amountInCents / 100;
        return amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Adiciona a lógica para o botão de visibilidade
    if (toggleVisibilityButton) {
        toggleVisibilityButton.addEventListener('click', () => {
            mainContainer.classList.toggle('values-hidden');
            const isHidden = mainContainer.classList.contains('values-hidden');
            if (eyeIconOpen && eyeIconClosed) {
                eyeIconOpen.style.display = isHidden ? 'none' : 'block';
                eyeIconClosed.style.display = isHidden ? 'block' : 'none';
            }
        });
    }

    async function fetchPlanningData(startDate, endDate) {
        planningGrid.innerHTML = '<p>Carregando planejamento...</p>';
        try {
            const url = `/api/planning/daily-orders?start_date=${startDate}&end_date=${endDate}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
            
            const data = await response.json();
            renderPlanningGrid(data, startDate, endDate);

        } catch (error) {
            console.error("Erro ao carregar dados de planejamento:", error);
            planningGrid.innerHTML = '<p>Erro ao carregar dados. Tente novamente.</p>';
        }
    }

    function renderPlanningGrid(data, startDate, endDate) {
        planningGrid.innerHTML = ''; // Limpa a grade
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');

        // Cria uma coluna para cada dia no intervalo
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayData = data.find(item => item.date === dateStr) || { orders: [], total_wash_kg: 0, total_pass_kg: 0, total_value: 0 };

            const dayColumn = document.createElement('div');
            dayColumn.className = 'day-column';
            dayColumn.innerHTML = `
                <div class="day-header">
                    <h3 class="day-title">${d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}</h3>
                    <div class="day-load">
                        Lavar: <strong>${(dayData.total_wash_kg || 0).toFixed(2)} kg</strong> | 
                        Passar: <strong>${(dayData.total_pass_kg || 0).toFixed(2)} kg</strong>
                    </div>
                    <div class="day-financials financial-info">
                        Total: <strong>R$ <span class="value-text">${formatCurrency(dayData.total_value)}</span></strong>
                    </div>
                </div>
                <div class="orders-container" id="orders-${dateStr}"></div>
            `;
            planningGrid.appendChild(dayColumn);
            
            const ordersContainer = dayColumn.querySelector(`#orders-${dateStr}`);
            if (dayData.orders.length > 0) {
                dayData.orders.forEach(order => {
                    ordersContainer.appendChild(createOrderCard(order));
                });
            } else {
                ordersContainer.innerHTML = '<p style="text-align: center; color: #6c757d; margin-top: 2rem;">Nenhum pedido para este dia.</p>';
            }
        }
    }

    function createOrderCard(order) {
        const card = document.createElement('div');
        card.className = 'order-card';
        card.dataset.orderId = order.order_id;

        card.innerHTML = `
            <div class="order-card-header">
                <h4 class="order-card-title">${order.customer_name}</h4>
                <span class="order-card-id">#${order.order_id}</span>
            </div>
            <p class="order-delivery"><strong>Entrega:</strong> ${new Date(order.pickup_datetime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
            <p class="order-value financial-info"><strong>Total:</strong> R$ <span class="value-text">${formatCurrency(order.total_amount)}</span></p>
            <div class="status-indicators">
                <div class="status-item">
                    <div class="status-circle ${order.is_washed ? 'completed' : ''}" data-status="is_washed"></div>
                    <span class="status-label">L</span>
                </div>
                <div class="status-item">
                    <div class="status-circle ${order.is_passed ? 'completed' : ''}" data-status="is_passed"></div>
                    <span class="status-label">P</span>
                </div>
                <div class="status-item">
                    <div class="status-circle ${order.is_packed ? 'completed' : ''}" data-status="is_packed"></div>
                    <span class="status-label">E</span>
                </div>
            </div>
        `;
        
        card.querySelectorAll('.status-circle').forEach(circle => {
            circle.addEventListener('click', (e) => {
                e.stopPropagation();
                const statusType = e.currentTarget.dataset.status;
                const currentStatus = e.currentTarget.classList.contains('completed');
                updateOrderStatus(order.order_id, statusType, !currentStatus, e.currentTarget);
            });
        });

        card.addEventListener('click', () => {
             alert(`Detalhes do Pedido #${order.order_id}:\nCliente: ${order.customer_name}\nValor: R$ ${formatCurrency(order.total_amount)}`);
        });

        return card;
    }

    async function updateOrderStatus(orderId, statusType, newValue, circleElement) {
        try {
            const response = await fetch('/api/order/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: orderId,
                    status_field: statusType,
                    status_value: newValue
                })
            });
            if (!response.ok) throw new Error('Falha ao atualizar o status.');
            
            circleElement.classList.toggle('completed', newValue);

        } catch (error) {
            console.error("Erro ao atualizar status:", error);
            alert('Não foi possível atualizar o status. Verifique o console.');
        }
    }

    function updateView() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        if (startDate && endDate) {
            fetchPlanningData(startDate, endDate);
        }
    }

    filterButton.addEventListener('click', updateView);
    
    updateView();
});

