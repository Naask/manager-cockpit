document.addEventListener('DOMContentLoaded', () => {

    const filterButton = document.getElementById('filter-button');
    const clearButton = document.getElementById('clear-filter-button');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const customerFilter = document.getElementById('customer-filter');

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

    // --- Lógica de Checkboxes e PDF ---

    function updateSelectedCount() {
        const checked = document.querySelectorAll('#all-completed-orders-table tbody .order-checkbox:checked');
        const countEl = document.getElementById('selected-orders-count');
        const btn = document.getElementById('generate-pdf-button');
        countEl.textContent = `${checked.length} selecionado${checked.length !== 1 ? 's' : ''}`;
        btn.disabled = checked.length === 0;
    }

    document.getElementById('select-all-completed').addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('#all-completed-orders-table tbody .order-checkbox');
        checkboxes.forEach(cb => cb.checked = this.checked);
        updateSelectedCount();
    });

    document.querySelector('#all-completed-orders-table tbody').addEventListener('change', function(e) {
        if (!e.target.classList.contains('order-checkbox')) return;
        const all = document.querySelectorAll('#all-completed-orders-table tbody .order-checkbox');
        const checked = document.querySelectorAll('#all-completed-orders-table tbody .order-checkbox:checked');
        const selectAll = document.getElementById('select-all-completed');
        selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
        selectAll.checked = all.length > 0 && checked.length === all.length;
        updateSelectedCount();
    });

    document.getElementById('generate-pdf-button').addEventListener('click', async function() {
        const checkboxes = document.querySelectorAll('#all-completed-orders-table tbody .order-checkbox:checked');
        if (checkboxes.length === 0) return;

        const selectedIds = Array.from(checkboxes).map(cb => cb.value);

        this.disabled = true;
        this.textContent = 'Gerando...';

        try {
            const response = await fetch(`/api/gestao/orders-detail?order_ids=${selectedIds.join(',')}`);
            if (!response.ok) throw new Error('Erro ao buscar detalhes dos pedidos');
            const orders = await response.json();
            generateOrdersPDF(orders);
        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            alert('Não foi possível gerar o relatório PDF. Verifique o console para detalhes.');
        } finally {
            this.textContent = '📄 Gerar Relatório PDF';
            updateSelectedCount();
        }
    });

    function generateOrdersPDF(orders) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 14;
        let y = 20;

        // Cabeçalho do relatório
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Relatório de Pedidos Concluídos', pageWidth / 2, y, { align: 'center' });
        y += 7;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120);
        const startVal = startDateInput.value;
        const endVal = endDateInput.value;
        const customerVal = customerFilter.options[customerFilter.selectedIndex]?.text || '';
        const periodoText = startVal && endVal ? `Período: ${startVal} a ${endVal}  |  ` : '';
        const clienteText = customerFilter.value ? `Cliente: ${customerVal}  |  ` : '';
        doc.text(`${periodoText}${clienteText}Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, y, { align: 'center' });
        doc.text(`${orders.length} pedido${orders.length !== 1 ? 's' : ''} selecionado${orders.length !== 1 ? 's' : ''}`, pageWidth / 2, y + 5, { align: 'center' });
        doc.setTextColor(0);
        y += 14;

        let grandTotal = 0;

        orders.forEach(order => {
            if (y > 245) {
                doc.addPage();
                y = 20;
            }

            // Faixa do cabeçalho do pedido
            doc.setFillColor(0, 123, 255);
            doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255);
            doc.text(`Pedido #${order.order_id}`, margin + 2, y + 5);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`Cliente: ${order.customer_name}`, margin + 55, y + 5);
            doc.setTextColor(0);
            y += 10;

            // Linha de datas
            doc.setFontSize(8.5);
            doc.setTextColor(80);
            const completedDate = order.completed_at ? new Date(order.completed_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
            doc.text(`Concluído em: ${completedDate}`, margin + 2, y);
            doc.setTextColor(0);
            y += 5;

            // Tabela de itens
            if (order.items && order.items.length > 0) {
                const tableRows = order.items.map(item => [
                    item.product_name,
                    String(item.quantity).replace('.', ','),
                    formatCurrency(item.unit_price),
                    formatCurrency(item.total_price)
                ]);

                doc.autoTable({
                    startY: y,
                    head: [['Produto', 'Qtd.', 'Preço Unit.', 'Total']],
                    body: tableRows,
                    foot: [['', '', 'TOTAL DO PEDIDO', formatCurrency(order.total_amount)]],
                    styles: { fontSize: 8.5, cellPadding: 2 },
                    headStyles: { fillColor: [52, 58, 64], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
                    footStyles: { fillColor: [233, 236, 239], textColor: [33, 37, 41], fontStyle: 'bold' },
                    columnStyles: {
                        0: { cellWidth: 97 },
                        1: { cellWidth: 14, halign: 'center' },
                        2: { cellWidth: 32, halign: 'right' },
                        3: { cellWidth: 32, halign: 'right' }
                    },
                    margin: { left: margin, right: margin },
                    tableLineColor: [222, 226, 230],
                    tableLineWidth: 0.1
                });
                y = doc.lastAutoTable.finalY + 8;
            } else {
                doc.setFontSize(8.5);
                doc.setTextColor(150);
                doc.text('(sem itens detalhados)', margin + 2, y + 3);
                doc.setTextColor(0);

                // Linha de total mesmo sem itens
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.text(`Total do pedido: ${formatCurrency(order.total_amount)}`, pageWidth - margin, y + 3, { align: 'right' });
                doc.setFont('helvetica', 'normal');
                y += 12;
            }

            grandTotal += order.total_amount;
        });

        // Rodapé totalizador
        if (y > 265) {
            doc.addPage();
            y = 20;
        }
        doc.setFillColor(0, 123, 255);
        doc.rect(margin, y, pageWidth - margin * 2, 9, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255);
        doc.text('TOTAL GERAL', margin + 2, y + 6.5);
        doc.text(formatCurrency(grandTotal), pageWidth - margin, y + 6.5, { align: 'right' });
        doc.setTextColor(0);

        const fileName = `relatorio-pedidos-${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(fileName);
    }

    // --- Fim da lógica de PDF ---

    async function populateCustomerFilter() {
        try {
            const response = await fetch('/api/customers');
            if (!response.ok) throw new Error('Falha ao buscar clientes');
            const customers = await response.json();

            customers.forEach(customer => {
                const option = document.createElement('option');
                option.value = customer.customer_id;
                option.textContent = customer.name;
                customerFilter.appendChild(option);
            });
        } catch (error) {
            console.error("Erro ao popular filtro de clientes:", error);
        }
    }

    async function fetchFinancialData(startDate, endDate, customerId) {
        try {
            let url = '/api/gestao/financial-summary';
            const params = new URLSearchParams();
            if (startDate && endDate) {
                params.append('start_date', startDate);
                params.append('end_date', endDate);
            }
            if (customerId) {
                params.append('customer_id', customerId);
            }
            url += `?${params.toString()}`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Erro na API: ${response.statusText}`);
            }
            const data = await response.json();

            // 1. Preenche os KPIs de pedidos CONCLUÍDOS e Saldo de Clientes
            const completedKpis = data.completed_kpis;
            const pendingBalance = (completedKpis.gross_revenue || 0) - (completedKpis.total_received || 0);

            document.getElementById('kpi-gross-revenue').textContent = formatCurrency(completedKpis.gross_revenue);
            document.getElementById('kpi-total-received').textContent = formatCurrency(completedKpis.total_received);
            document.getElementById('kpi-pending-balance').textContent = formatCurrency(pendingBalance);
            document.getElementById('kpi-customer-balance').textContent = formatCurrency(data.customer_total_balance);

            document.getElementById('kpi-orders-count').textContent = completedKpis.orders_count || 0;
            document.getElementById('kpi-paid-orders-count').textContent = completedKpis.paid_orders_count || 0;
            document.getElementById('pending-orders-count').textContent = data.pending_orders.length;

            // 2. Preenche a Visão Operacional (Estoque)
            const stock = data.stock_summary;
            const inProgress = stock.EM_EXECUCAO;
            const awaitingDelivery = stock.AGUARDANDO_ENTREGA;
            const awaitingPickup = stock.AGUARDANDO_RETIRADA;

            document.getElementById('stock-inprogress-total-value').textContent = formatCurrency(inProgress.total_value);
            document.getElementById('stock-inprogress-total-count').textContent = inProgress.total_count || 0;
            document.getElementById('stock-inprogress-paid-value').textContent = formatCurrency(inProgress.paid_value);
            document.getElementById('stock-inprogress-paid-count').textContent = inProgress.paid_count || 0;
            document.getElementById('stock-inprogress-unpaid-value').textContent = formatCurrency(inProgress.unpaid_value);
            document.getElementById('stock-inprogress-unpaid-count').textContent = inProgress.unpaid_count || 0;

            document.getElementById('stock-delivery-total-value').textContent = formatCurrency(awaitingDelivery.total_value);
            document.getElementById('stock-delivery-total-count').textContent = awaitingDelivery.total_count || 0;
            document.getElementById('stock-delivery-paid-value').textContent = formatCurrency(awaitingDelivery.paid_value);
            document.getElementById('stock-delivery-paid-count').textContent = awaitingDelivery.paid_count || 0;
            document.getElementById('stock-delivery-unpaid-value').textContent = formatCurrency(awaitingDelivery.unpaid_value);
            document.getElementById('stock-delivery-unpaid-count').textContent = awaitingDelivery.unpaid_count || 0;

            document.getElementById('stock-pickup-total-value').textContent = formatCurrency(awaitingPickup.total_value);
            document.getElementById('stock-pickup-total-count').textContent = awaitingPickup.total_count || 0;
            document.getElementById('stock-pickup-paid-value').textContent = formatCurrency(awaitingPickup.paid_value);
            document.getElementById('stock-pickup-paid-count').textContent = awaitingPickup.paid_count || 0;
            document.getElementById('stock-pickup-unpaid-value').textContent = formatCurrency(awaitingPickup.unpaid_value);
            document.getElementById('stock-pickup-unpaid-count').textContent = awaitingPickup.unpaid_count || 0;

            const totalStockCount = inProgress.total_count + awaitingDelivery.total_count + awaitingPickup.total_count;
            const totalStockValue = inProgress.total_value + awaitingDelivery.total_value + awaitingPickup.total_value;
            const totalPaidCount = inProgress.paid_count + awaitingDelivery.paid_count + awaitingPickup.paid_count;
            const totalPaidValue = inProgress.paid_value + awaitingDelivery.paid_value + awaitingPickup.paid_value;
            const totalUnpaidCount = inProgress.unpaid_count + awaitingDelivery.unpaid_count + awaitingPickup.unpaid_count;
            const totalUnpaidValue = inProgress.unpaid_value + awaitingDelivery.unpaid_value + awaitingPickup.unpaid_value;

            document.getElementById('stock-total-value').textContent = formatCurrency(totalStockValue);
            document.getElementById('stock-total-count').textContent = totalStockCount;
            document.getElementById('stock-total-paid-value').textContent = formatCurrency(totalPaidValue);
            document.getElementById('stock-total-paid-count').textContent = totalPaidCount;
            document.getElementById('stock-total-unpaid-value').textContent = formatCurrency(totalUnpaidValue);
            document.getElementById('stock-total-unpaid-count').textContent = totalUnpaidCount;

            // 3. Preenche a tabela de Pedidos Pendentes com totalizadores
            const pendingTableBody = document.querySelector('#pending-orders-table tbody');
            pendingTableBody.innerHTML = '';
            document.getElementById('pending-orders-count2').textContent = data.pending_orders.length;
            let pendingTotalAmount = 0;
            let pendingTotalPaid = 0;
            let pendingRemainingBalance = 0;
            data.pending_orders.forEach(order => {
                const row = pendingTableBody.insertRow();
                const status = order.payment_status.replace('_', ' ');
                row.innerHTML = `
                    <td>${formatDate(order.created_at)}</td>
                    <td>${formatDate(order.completed_at)}</td>
                    <td>${order.order_id}</td>
                    <td>${order.customer_name}</td>
                    <td>${status}</td>
                    <td>${formatCurrency(order.total_amount)}</td>
                    <td>${formatCurrency(order.total_paid)}</td>
                    <td><strong>${formatCurrency(order.remaining_balance)}</strong></td>
                `;
                pendingTotalAmount += order.total_amount;
                pendingTotalPaid += order.total_paid;
                pendingRemainingBalance += order.remaining_balance;
            });
            document.getElementById('pending-total-amount').textContent = formatCurrency(pendingTotalAmount);
            document.getElementById('pending-total-paid').textContent = formatCurrency(pendingTotalPaid);
            document.getElementById('pending-remaining-balance').textContent = formatCurrency(pendingRemainingBalance);

            // 4. Preenche a tabela de Todos os Pedidos Concluídos com checkboxes
            const completedTableBody = document.querySelector('#all-completed-orders-table tbody');
            completedTableBody.innerHTML = '';

            // Reseta o select-all ao recarregar
            const selectAll = document.getElementById('select-all-completed');
            selectAll.checked = false;
            selectAll.indeterminate = false;

            document.getElementById('all-completed-orders-count').textContent = data.all_completed_orders.length;
            let completedTotalAmount = 0;
            data.all_completed_orders.forEach(order => {
                const row = completedTableBody.insertRow();
                row.innerHTML = `
                    <td><input type="checkbox" class="order-checkbox" value="${order.order_id}"></td>
                    <td>${formatDate(order.created_at)}</td>
                    <td>${formatDate(order.completed_at)}</td>
                    <td>${order.order_id}</td>
                    <td>${order.customer_name}</td>
                    <td>${formatCurrency(order.total_amount)}</td>
                `;
                completedTotalAmount += order.total_amount;
            });
            document.getElementById('completed-total-amount').textContent = formatCurrency(completedTotalAmount);
            updateSelectedCount();

            // 5. Preenche a tabela de Todos os Pedidos em Andamento
            const inProgressTableBody = document.querySelector('#in-progress-orders-table tbody');
            inProgressTableBody.innerHTML = '';
            document.getElementById('in-progress-orders-count').textContent = data.in_progress_orders.length;
            data.in_progress_orders.forEach(order => {
                const row = inProgressTableBody.insertRow();
                const executionStatus = order.execution_status.replace(/_/g, ' ');
                const paymentStatus = order.payment_status.replace(/_/g, ' ');
                row.innerHTML = `<td>${order.order_id}</td><td>${order.customer_name}</td><td>${executionStatus}</td><td>${formatDate(order.pickup_datetime)}</td><td>${paymentStatus}</td><td>${formatCurrency(order.total_amount)}</td>`;
            });

        } catch (error) {
            console.error("Erro ao buscar dados financeiros:", error);
            alert("Não foi possível carregar os dados financeiros. Verifique o console para mais detalhes.");
        }
    }

    function updateView() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        const customerId = customerFilter.value;
        fetchFinancialData(startDate, endDate, customerId);
    }

    filterButton.addEventListener('click', updateView);

    clearButton.addEventListener('click', () => {
        startDateInput.value = '';
        endDateInput.value = '';
        customerFilter.value = '';
        updateView();
    });

    // Carga inicial
    populateCustomerFilter();
    updateView();
});
