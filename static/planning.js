document.addEventListener('DOMContentLoaded', () => {
    // Referências aos elementos de controle
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const filterButton = document.getElementById('filter-button');
    
    // Referências aos 3 contêineres de grades
    const deliveryScheduleGrid = document.getElementById('delivery-schedule-grid');
    const washScheduleGrid = document.getElementById('wash-schedule-grid');
    const passScheduleGrid = document.getElementById('pass-schedule-grid');

    // Referências para o botão de visibilidade
    const mainContainer = document.querySelector('main');
    const toggleVisibilityButton = document.getElementById('toggle-visibility-button');
    const eyeIconOpen = document.getElementById('eye-icon-open');
    const eyeIconClosed = document.getElementById('eye-icon-closed');

    // Define as datas padrão
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 7);
    startDateInput.value = today.toISOString().split('T')[0];
    endDateInput.value = futureDate.toISOString().split('T')[0];

    // Adiciona o evento de clique para o botão de visibilidade
    toggleVisibilityButton.addEventListener('click', () => {
        mainContainer.classList.toggle('values-hidden');
        const isHidden = mainContainer.classList.contains('values-hidden');
        eyeIconOpen.style.display = isHidden ? 'none' : 'block';
        eyeIconClosed.style.display = isHidden ? 'block' : 'none';
    });

    // Função para formatar valores monetários
    function formatCurrency(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return '0,00';
        const amount = amountInCents / 100;
        return amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    async function fetchAndRenderSchedules(startDate, endDate) {
        // Mostra mensagem de carregamento em todas as grades
        const loadingHTML = '<p style="padding: 1rem;">Carregando planejamento...</p>';
        deliveryScheduleGrid.innerHTML = loadingHTML;
        washScheduleGrid.innerHTML = loadingHTML;
        passScheduleGrid.innerHTML = loadingHTML;

        try {
            const url = `/api/planning/daily-orders?start_date=${startDate}&end_date=${endDate}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
            
            const ordersByDay = await response.json();
            renderGrids(ordersByDay, startDate, endDate);

        } catch (error) {
            console.error("Erro ao carregar dados de planejamento:", error);
            const errorHTML = '<p style="padding: 1rem;">Erro ao carregar dados. Tente novamente.</p>';
            deliveryScheduleGrid.innerHTML = errorHTML;
            washScheduleGrid.innerHTML = errorHTML;
            passScheduleGrid.innerHTML = errorHTML;
        }
    }

    function renderGrids(ordersByDay, startDate, endDate) {
        // Limpa todas as grades
        deliveryScheduleGrid.innerHTML = '';
        washScheduleGrid.innerHTML = '';
        passScheduleGrid.innerHTML = '';
        
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');

        // Itera por cada dia no intervalo para criar as colunas em todas as grades
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayData = ordersByDay.find(item => item.date === dateStr) || { orders: [], total_wash_kg: 0, total_pass_kg: 0, total_value: 0 };
            
            // Cria a coluna para cada uma das 3 grades
            deliveryScheduleGrid.appendChild(createDayColumn(d, dayData, true)); // Coluna com detalhes
            washScheduleGrid.appendChild(createDayColumn(d, dayData, false));   // Coluna simples
            passScheduleGrid.appendChild(createDayColumn(d, dayData, false));  // Coluna simples

            // Popula a grade de entrega com os cards dos pedidos
            if (dayData && dayData.orders.length > 0) {
                const deliveryOrdersContainer = deliveryScheduleGrid.querySelector(`[data-date="${dateStr}"] .orders-container`);
                dayData.orders.forEach(order => {
                    deliveryOrdersContainer.appendChild(createOrderCard(order));
                });
            }
        }
    }

    // Função auxiliar para criar uma coluna de dia
    function createDayColumn(date, dayData, showDetails) {
        const dateStr = date.toISOString().split('T')[0];
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        dayColumn.dataset.date = dateStr;
        
        let detailsHTML = '';
        if (showDetails) {
            detailsHTML = `
                <div class="day-load">
                    Lavar: <strong>${(dayData.total_wash_kg || 0).toFixed(2)} kg</strong> | 
                    Passar: <strong>${(dayData.total_pass_kg || 0).toFixed(2)} kg</strong>
                </div>
                <div class="day-financials">
                    Total: <strong class="financial-info"><span class="value-text">R$ ${formatCurrency(dayData.total_value)}</span></strong>
                </div>
            `;
        }

        dayColumn.innerHTML = `
            <div class="day-header">
                <h3 class="day-title">${date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</h3>
                ${detailsHTML}
            </div>
            <div class="orders-container"></div>
        `;
        return dayColumn;
    }

    // Função auxiliar para criar um card de pedido detalhado
    function createOrderCard(order) {
        const card = document.createElement('div');
        card.className = 'order-card';
        card.dataset.orderId = order.order_id;
        card.innerHTML = `
            <div class="order-card-header">
                <div>
                    <h4 class="order-card-title">${order.customer_name}</h4>
                    <span class="order-card-subtitle">#${order.order_id}</span>
                </div>
                <div class="order-card-value financial-info">
                    <span class="value-text">R$ ${formatCurrency(order.total_amount)}</span>
                </div>
            </div>
            <p>Entrega: ${new Date(order.pickup_datetime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
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
        
        // Adiciona evento de clique para atualizar o status
        card.querySelectorAll('.status-circle').forEach(circle => {
            circle.addEventListener('click', (e) => {
                e.stopPropagation();
                const statusType = e.currentTarget.dataset.status;
                const currentStatus = e.currentTarget.classList.contains('completed');
                updateOrderStatus(order.order_id, statusType, !currentStatus, e.currentTarget);
            });
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
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Falha ao atualizar o status.');
            }
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
            fetchAndRenderSchedules(startDate, endDate);
        }
    }

    filterButton.addEventListener('click', updateView);
    updateView(); // Carga inicial
});

