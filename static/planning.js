document.addEventListener('DOMContentLoaded', () => {
    // --- REFERÊNCIAS AOS ELEMENTOS DO DOM ---
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const filterButton = document.getElementById('filter-button');
    const deliveryScheduleGrid = document.getElementById('delivery-schedule-grid');
    const washScheduleGrid = document.getElementById('wash-schedule-grid');
    const passScheduleGrid = document.getElementById('pass-schedule-grid');
    const mainContainer = document.querySelector('main');
    const toggleVisibilityButton = document.getElementById('toggle-visibility-button');
    const eyeIconOpen = document.getElementById('eye-icon-open');
    const eyeIconClosed = document.getElementById('eye-icon-closed');

    // --- ESTADO DA APLICAÇÃO ---
    let allOrdersData = []; // Armazena todos os pedidos carregados
    let draggedCardInfo = null; // Armazena informações sobre o card a ser arrastado
    let scrollInterval = null; // Para controlar o auto-scroll

    // --- INICIALIZAÇÃO ---
    function initialize() {
        setDefaultDates();
        addEventListeners();
        updateView();
    }

    function setDefaultDates() {
        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + 7);
        startDateInput.value = today.toISOString().split('T')[0];
        endDateInput.value = futureDate.toISOString().split('T')[0];
    }

    function addEventListeners() {
        filterButton.addEventListener('click', updateView);
        toggleVisibilityButton.addEventListener('click', toggleValuesVisibility);
    }

    // --- LÓGICA DE DADOS E RENDERIZAÇÃO ---
    async function fetchAndRenderSchedules(startDate, endDate) {
        const loadingHTML = '<p style="padding: 1rem;">A carregar planeamento...</p>';
        [deliveryScheduleGrid, washScheduleGrid, passScheduleGrid].forEach(grid => grid.innerHTML = loadingHTML);
        try {
            const url = `/api/planning/daily-orders?start_date=${startDate}&end_date=${endDate}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Erro na API: ${response.statusText}`);
            const ordersByDay = await response.json();
            
            allOrdersData = ordersByDay.flatMap(day => day.orders);
            
            renderGrids(ordersByDay, startDate, endDate);
        } catch (error) {
            console.error("Erro ao carregar dados de planeamento:", error);
            const errorHTML = '<p style="padding: 1rem;">Erro ao carregar dados. Tente novamente.</p>';
            [deliveryScheduleGrid, washScheduleGrid, passScheduleGrid].forEach(grid => grid.innerHTML = errorHTML);
        }
    }

    function renderGrids(ordersByDay, startDate, endDate) {
        [deliveryScheduleGrid, washScheduleGrid, passScheduleGrid].forEach(grid => grid.innerHTML = '');
        
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T23:59:59');

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayData = ordersByDay.find(item => item.date === dateStr) || { orders: [], total_wash_kg: 0, total_pass_kg: 0, total_value: 0 };
            
            deliveryScheduleGrid.appendChild(createDayColumn(d, dayData, true));
            washScheduleGrid.appendChild(createDayColumn(d, dayData, false, 'wash'));
            passScheduleGrid.appendChild(createDayColumn(d, dayData, false, 'pass'));

            if (dayData && dayData.orders.length > 0) {
                const deliveryOrdersContainer = deliveryScheduleGrid.querySelector(`[data-date="${dateStr}"] .orders-container`);
                dayData.orders.forEach(order => {
                    deliveryOrdersContainer.appendChild(createOrderCard(order));
                });
            }
        }
    }

    function createDayColumn(date, dayData, isDelivery, taskType = null) {
        const dateStr = date.toISOString().split('T')[0];
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        dayColumn.dataset.date = dateStr;

        let detailsHTML = '';
        if (isDelivery) {
            detailsHTML = `
                <div class="day-load">
                    Lavar: <strong>${(dayData.total_wash_kg || 0).toFixed(2)} kg</strong> | 
                    Passar: <strong>${(dayData.total_pass_kg || 0).toFixed(2)} kg</strong>
                </div>
                <div class="day-financials financial-info">
                    Total: <span class="value-text">R$ ${formatCurrency(dayData.total_value)}</span>
                </div>
            `;
        } else {
            detailsHTML = `
                <div class="day-scheduled-financials financial-info" data-total-container="true">
                    Total Agendado: <span class="value-text">R$ 0,00</span>
                </div>
            `;
        }

        dayColumn.innerHTML = `
            <div class="day-header">
                <h3 class="day-title">${date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</h3>
                ${detailsHTML}
            </div>
            <div class="orders-container" data-task-type="${taskType || ''}"></div>
        `;

        if (taskType) {
            const container = dayColumn.querySelector('.orders-container');
            container.addEventListener('dragover', handleDragOver);
            container.addEventListener('dragleave', handleDragLeave);
            container.addEventListener('drop', handleDrop);
        }
        return dayColumn;
    }

    function createOrderCard(order, isScheduled = false) {
        const card = document.createElement('div');
        card.className = 'order-card';
        card.dataset.orderId = order.order_id;
        card.dataset.orderValue = order.total_amount; // Armazena o valor do pedido no card
        card.draggable = true; 

        const cancelButtonHTML = isScheduled ? '<button class="cancel-schedule-btn">×</button>' : '';

        card.innerHTML = `
            ${cancelButtonHTML}
            <div class="order-card-header">
                <div>
                    <h4 class="order-card-title">${order.customer_name}</h4>
                    <div class="order-card-subtitle">${order.order_id}</div>
                </div>
                <div class="order-card-value financial-info">
                    <span class="value-text">R$ ${formatCurrency(order.total_amount)}</span>
                </div>
            </div>
            <div class="order-card-footer">
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
            </div>
        `;
        
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);

        if (isScheduled) {
            card.querySelector('.cancel-schedule-btn').addEventListener('click', handleCancelSchedule);
        }

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

    // --- LÓGICA DE DRAG-AND-DROP E AUTO-SCROLL ---
    function handleDragStart(e) {
        const card = e.currentTarget;
        draggedCardInfo = {
            orderId: card.dataset.orderId,
            element: card,
            sourceTaskType: card.closest('.orders-container').dataset.taskType || 'delivery'
        };
        setTimeout(() => card.classList.add('dragging'), 0);
        // Ativa o listener de scroll ao iniciar o arrasto
        document.addEventListener('dragover', handleDragScrolling);
    }

    function handleDragEnd() {
        if (draggedCardInfo && draggedCardInfo.element) {
            draggedCardInfo.element.classList.remove('dragging');
        }
        draggedCardInfo = null;
        // Desativa o listener de scroll e para qualquer scroll em andamento
        document.removeEventListener('dragover', handleDragScrolling);
        if (scrollInterval) {
            clearInterval(scrollInterval);
            scrollInterval = null;
        }
    }

    function handleDragScrolling(e) {
        if (!draggedCardInfo) return;

        const y = e.clientY;
        const windowHeight = window.innerHeight;
        const scrollZone = 80; // Zona de ativação do scroll (80px da borda)
        const scrollSpeed = 15; // Velocidade do scroll

        // Se o mouse está perto da borda de baixo
        if (y > windowHeight - scrollZone) {
            if (!scrollInterval) { // Inicia o scroll apenas se não estiver a rolar
                scrollInterval = setInterval(() => { window.scrollBy(0, scrollSpeed); }, 15);
            }
        }
        // Se o mouse está perto da borda de cima
        else if (y < scrollZone) {
            if (!scrollInterval) { // Inicia o scroll apenas se não estiver a rolar
                scrollInterval = setInterval(() => { window.scrollBy(0, -scrollSpeed); }, 15);
            }
        }
        // Se o mouse está no meio da tela
        else {
            if (scrollInterval) { // Para o scroll se estiver a rolar
                clearInterval(scrollInterval);
                scrollInterval = null;
            }
        }
    }
    
    function handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    async function handleDrop(e) {
        e.preventDefault();
        const dropContainer = e.currentTarget;
        dropContainer.classList.remove('drag-over');

        if (!draggedCardInfo) return;

        const { orderId, element: originalCard, sourceTaskType } = draggedCardInfo;
        const targetTaskType = dropContainer.dataset.taskType;
        const targetColumn = dropContainer.closest('.day-column');
        const targetDate = targetColumn.dataset.date;

        if (targetTaskType) {
            try {
                await scheduleTask(orderId, targetTaskType, targetDate);
                const originalCardData = allOrdersData.find(o => o.order_id == orderId);

                if (originalCardData) {
                    const newCard = createOrderCard(originalCardData, true);
                    dropContainer.appendChild(newCard);
                    updateColumnTotals(targetColumn);
                }
                
                if (sourceTaskType === targetTaskType && sourceTaskType !== 'delivery') {
                    const sourceColumn = originalCard.closest('.day-column');
                    originalCard.remove();
                    updateColumnTotals(sourceColumn);
                }

            } catch (error) {
                console.error("Erro no processo de drop:", error);
                alert("Ocorreu um erro ao mover a tarefa. A página será atualizada para garantir a consistência.");
                window.location.reload();
            }
        }
    }
    
    // --- FUNÇÕES DE API E EVENTOS ---
    async function scheduleTask(orderId, taskType, scheduleDate) {
        const response = await fetch('/api/order/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, task_type: taskType, schedule_date: scheduleDate })
        });
        if (!response.ok) throw new Error('Falha ao agendar tarefa no backend.');
    }

    async function handleCancelSchedule(e) {
        e.stopPropagation();
        const card = e.currentTarget.closest('.order-card');
        const column = card.closest('.day-column');
        const orderId = card.dataset.orderId;
        const taskType = card.closest('.orders-container').dataset.taskType;

        try {
            const response = await fetch('/api/order/cancel-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId, task_type: taskType })
            });
            if (!response.ok) throw new Error('Falha ao cancelar agendamento.');
            card.remove();
            updateColumnTotals(column);
        } catch (error) {
            console.error("Erro ao cancelar:", error);
            alert('Não foi possível cancelar o agendamento.');
        }
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
    
    // --- UTILITÁRIOS ---
    function updateColumnTotals(column) {
        if (!column) return;
        const totalContainer = column.querySelector('[data-total-container]');
        if (!totalContainer) return;

        const cards = column.querySelectorAll('.order-card');
        let totalValue = 0;
        cards.forEach(card => {
            totalValue += parseFloat(card.dataset.orderValue) || 0;
        });
        
        const valueTextElement = totalContainer.querySelector('.value-text');
        if (valueTextElement) {
            valueTextElement.textContent = `R$ ${formatCurrency(totalValue)}`;
        }
    }

    function formatCurrency(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return '0,00';
        const amount = amountInCents / 100;
        return amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function toggleValuesVisibility() {
        mainContainer.classList.toggle('values-hidden');
        const isHidden = mainContainer.classList.contains('values-hidden');
        eyeIconOpen.style.display = isHidden ? 'none' : 'block';
        eyeIconClosed.style.display = isHidden ? 'block' : 'none';
    }

    function updateView() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        if (startDate && endDate) {
            fetchAndRenderSchedules(startDate, endDate);
        }
    }

    // --- EXECUÇÃO INICIAL ---
    initialize();
});

