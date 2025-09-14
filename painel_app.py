# painel_app.py
# Servidor Flask para os Cockpits de Operação e Gestão.
import sqlite3
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# O caminho para o banco de dados do seu PDV.
DATABASE_PATH = '../second-pdv/database/lavanderia_ledger.db'

def get_db_connection():
    """Estabelece uma conexão de leitura com o banco de dados."""
    db_uri = f'file:{DATABASE_PATH}?mode=ro'
    try:
        conn = sqlite3.connect(db_uri, uri=True)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.OperationalError as e:
        print(f"ERRO: Não foi possível conectar ao banco de dados em '{DATABASE_PATH}'.")
        print("Verifique se o caminho está correto e se o servidor do PDV já criou o arquivo .db.")
        raise e

# --- ROTAS DO COCKPIT OPERACIONAL ---
@app.route('/api/cockpit/active-orders')
def get_cockpit_data():
    conn = get_db_connection()
    in_progress_orders = conn.execute("SELECT o.order_id, o.pickup_datetime, c.name as customer_name FROM orders o JOIN customers c ON o.customer_id = c.customer_id WHERE o.execution_status = 'EM_EXECUCAO' ORDER BY o.pickup_datetime ASC;").fetchall()
    awaiting_delivery_orders = conn.execute("SELECT o.order_id, c.name as customer_name, o.completed_at FROM orders o JOIN customers c ON o.customer_id = c.customer_id WHERE o.execution_status = 'AGUARDANDO_ENTREGA' ORDER BY o.completed_at DESC;").fetchall()
    awaiting_pickup_orders = conn.execute("SELECT o.order_id, c.name as customer_name, o.completed_at FROM orders o JOIN customers c ON o.customer_id = c.customer_id WHERE o.execution_status = 'AGUARDANDO_RETIRADA' ORDER BY o.completed_at DESC;").fetchall()
    conn.close()
    return jsonify({ 'in_progress': [dict(row) for row in in_progress_orders], 'awaiting_delivery': [dict(row) for row in awaiting_delivery_orders], 'awaiting_pickup': [dict(row) for row in awaiting_pickup_orders] })

@app.route('/cockpit')
def cockpit_page():
    return render_template('cockpit.html')


# --- ROTAS DO COCKPIT DE GESTÃO ---
@app.route('/api/customers')
def get_customers():
    """API para buscar todos os clientes para o filtro."""
    conn = get_db_connection()
    customers = conn.execute("SELECT customer_id, name FROM customers ORDER BY name ASC").fetchall()
    conn.close()
    return jsonify([dict(row) for row in customers])

@app.route('/api/gestao/financial-summary')
def get_financial_summary():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    customer_id = request.args.get('customer_id')

    conn = get_db_connection()
    params = []
    
    # --- Lógica de Filtro Unificada ---
    where_clauses_completed = ["o.execution_status = 'CONCLUIDO'"]
    if start_date and end_date:
        where_clauses_completed.append("o.completed_at BETWEEN ? AND ?")
        params.extend([start_date + 'T00:00', end_date + 'T23:59'])
    if customer_id:
        where_clauses_completed.append("o.customer_id = ?")
        params.append(customer_id)

    final_where_clause_completed = f"WHERE {' AND '.join(where_clauses_completed)}"

    kpi_query = f"""
        WITH FilteredOrders AS (SELECT order_id, total_amount FROM orders o {final_where_clause_completed})
        SELECT
            (SELECT COUNT(order_id) FROM FilteredOrders) as orders_count,
            (SELECT SUM(total_amount) FROM FilteredOrders) as gross_revenue,
            (SELECT SUM(p.amount) FROM order_payments p JOIN FilteredOrders fo ON p.order_id = fo.order_id) as total_received,
            (SELECT COUNT(DISTINCT p.order_id) FROM order_payments p JOIN FilteredOrders fo ON p.order_id = fo.order_id) as paid_orders_count;
    """
    completed_kpis = conn.execute(kpi_query, params).fetchone()

    pending_where_clause = f"{final_where_clause_completed} AND o.payment_status IN ('AGUARDANDO_PAGAMENTO', 'PAGO_PARCIALMENTE')"
    pending_orders_query = f"""
        SELECT
            o.order_id, c.name as customer_name, o.total_amount, o.payment_status, o.created_at, o.completed_at,
            COALESCE(p.total_paid, 0) as total_paid,
            (o.total_amount - COALESCE(p.total_paid, 0)) as remaining_balance
        FROM orders o JOIN customers c ON o.customer_id = c.customer_id
        LEFT JOIN (SELECT order_id, SUM(amount) as total_paid FROM order_payments GROUP BY order_id) p ON o.order_id = p.order_id
        {pending_where_clause} ORDER BY o.completed_at DESC;
    """
    pending_orders = conn.execute(pending_orders_query, params).fetchall()
    
    all_completed_query = f"""
        SELECT o.order_id, c.name as customer_name, o.created_at, o.completed_at, o.total_amount
        FROM orders o JOIN customers c ON o.customer_id = c.customer_id
        {final_where_clause_completed} ORDER BY o.completed_at DESC;
    """
    all_completed_orders = conn.execute(all_completed_query, params).fetchall()
    
    open_orders_kpis_query = f"""
        WITH OpenOrders AS (
            SELECT order_id, total_amount, payment_status, customer_id FROM orders WHERE execution_status != 'CONCLUIDO'
        )
        SELECT
            (SELECT COUNT(order_id) FROM OpenOrders {f"WHERE customer_id = '{customer_id}'" if customer_id else ""}) as total_open_count,
            (SELECT SUM(total_amount) FROM OpenOrders {f"WHERE customer_id = '{customer_id}'" if customer_id else ""}) as total_open_value,
            (SELECT COUNT(order_id) FROM OpenOrders WHERE payment_status = 'PAGO' {f"AND customer_id = '{customer_id}'" if customer_id else ""}) as open_and_paid_count,
            (SELECT SUM(total_amount) FROM OpenOrders WHERE payment_status = 'PAGO' {f"AND customer_id = '{customer_id}'" if customer_id else ""}) as open_and_paid_value,
            (SELECT COUNT(order_id) FROM OpenOrders WHERE payment_status IN ('AGUARDANDO_PAGAMENTO', 'PAGO_PARCIALMENTE') {f"AND customer_id = '{customer_id}'" if customer_id else ""}) as open_and_unpaid_count,
            (SELECT SUM(o.total_amount - COALESCE(p.total_paid, 0)) FROM OpenOrders o LEFT JOIN (SELECT order_id, SUM(amount) as total_paid FROM order_payments GROUP BY order_id) p ON o.order_id = p.order_id WHERE o.payment_status IN ('AGUARDANDO_PAGAMENTO', 'PAGO_PARCIALMENTE') {f"AND o.customer_id = '{customer_id}'" if customer_id else ""}) as open_and_unpaid_value
    """
    open_orders_kpis = conn.execute(open_orders_kpis_query).fetchone()

    in_progress_orders_query = f"""
        SELECT
            o.order_id, c.name as customer_name, o.execution_status,
            o.pickup_datetime, o.payment_status, o.total_amount
        FROM orders o JOIN customers c ON o.customer_id = c.customer_id
        WHERE o.execution_status != 'CONCLUIDO'
        {f"AND o.customer_id = '{customer_id}'" if customer_id else ""}
        ORDER BY o.pickup_datetime ASC, o.created_at ASC;
    """
    in_progress_orders = conn.execute(in_progress_orders_query).fetchall()

    conn.close()
    return jsonify({'completed_kpis': dict(completed_kpis) if completed_kpis else {}, 'pending_orders': [dict(row) for row in pending_orders], 'all_completed_orders': [dict(row) for row in all_completed_orders], 'open_orders_kpis': dict(open_orders_kpis) if open_orders_kpis else {}, 'in_progress_orders': [dict(row) for row in in_progress_orders]})

@app.route('/gestao')
def gestao_page():
    return render_template('gestao.html')


# --- ROTAS DE RELATÓRIOS GERENCIAIS (GRÁFICOS) ---
@app.route('/api/reports/summary')
def get_reports_summary():
    period = request.args.get('period', 'month')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    period_formats = {
        'daily': "strftime('%Y-%m-%d', created_at)",
        'week': "strftime('%Y-W%W', created_at)",
        'month': "strftime('%Y-%m', created_at)",
        'bimester': "strftime('%Y', created_at) || '-B' || ((strftime('%m', created_at) - 1) / 2 + 1)",
        'trimester': "strftime('%Y', created_at) || '-Q' || ((strftime('%m', created_at) - 1) / 3 + 1)",
        'semester': "strftime('%Y', created_at) || '-S' || ((strftime('%m', created_at) - 1) / 6 + 1)",
        'year': "strftime('%Y', created_at)"
    }
    period_format = period_formats.get(period, period_formats['month'])
    
    params = []
    where_clause = ""
    if start_date and end_date:
        where_clause = "WHERE created_at BETWEEN ? AND ?"
        params.extend([start_date + 'T00:00', end_date + 'T23:59'])
        
    # CORREÇÃO APLICADA AQUI
    query = f"""
        WITH CustomerFirstPeriod AS (
            -- 1. Calcula o período de aquisição de cada cliente
            SELECT
                customer_id,
                {period_format.replace('created_at', 'MIN(created_at)')} as first_period
            FROM orders
            GROUP BY customer_id
        ),
        PeriodData AS (
            -- 2. Junta os dados de cada pedido com o período de aquisição do seu cliente
            SELECT
                {period_format} as period,
                o.customer_id,
                o.order_id,
                o.total_amount,
                cfp.first_period
            FROM orders o
            JOIN CustomerFirstPeriod cfp ON o.customer_id = cfp.customer_id
            {where_clause}
        )
        -- 3. Agrega os resultados finais, comparando o período do pedido com o período de aquisição
        SELECT
            period,
            COUNT(DISTINCT order_id) as order_count,
            SUM(total_amount) as total_revenue,
            COUNT(DISTINCT customer_id) as distinct_customer_count,
            COUNT(DISTINCT CASE WHEN period = first_period THEN customer_id ELSE NULL END) as new_customer_count,
            COUNT(DISTINCT CASE WHEN period != first_period THEN customer_id ELSE NULL END) as returning_customer_count,
            GROUP_CONCAT(total_amount) as ticket_values
        FROM PeriodData
        GROUP BY period
        ORDER BY period ASC;
    """
    conn = get_db_connection()
    report_data = conn.execute(query, params).fetchall()
    conn.close()
    
    # A query de faturamento por cliente agora precisa ser separada
    processed_data = []
    for row in report_data:
        row_dict = dict(row)
        
        # Adapta os parâmetros para a subquery
        sub_params = list(params)
        sub_params.append(row_dict['period'])

        # Lógica para buscar faturamento por cliente para o período específico da linha
        customer_revenue_query = f"""
            SELECT SUM(total_amount) as customer_total
            FROM orders
            WHERE {period_format} = ?
            {where_clause.replace('WHERE', 'AND') if where_clause else ''}
            GROUP BY customer_id
        """
        
        conn = get_db_connection()
        customer_revenues = conn.execute(customer_revenue_query, sub_params).fetchall()
        conn.close()
        
        row_dict['revenue_per_customer_values'] = ",".join([str(r['customer_total']) for r in customer_revenues])
        processed_data.append(row_dict)

    return jsonify(processed_data)

@app.route('/reports')
def reports_page():
    return render_template('management_reports.html')


# --- ROTAS DE ANÁLISE DE PRODUTOS ---
@app.route('/api/reports/products-performance')
def get_product_performance_data():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    params = []
    where_clause = ""
    if start_date and end_date:
        where_clause = "WHERE o.created_at BETWEEN ? AND ?"
        params.extend([start_date + 'T00:00', end_date + 'T23:59'])
    query = f"SELECT p.name as product_name, p.category as product_category, SUM(oi.quantity) as total_quantity, SUM(oi.total_price) as total_revenue, COUNT(DISTINCT o.order_id) as order_appearence_count, COUNT(DISTINCT o.customer_id) as distinct_customer_count FROM order_items oi JOIN products p ON oi.product_id = p.product_id JOIN orders o ON oi.order_id = o.order_id {where_clause} GROUP BY p.product_id, p.name, p.category ORDER BY total_revenue DESC;"
    conn = get_db_connection()
    product_data = conn.execute(query, params).fetchall()
    total_revenue_query = f"SELECT SUM(oi.total_price) as grand_total FROM order_items oi JOIN orders o ON oi.order_id = o.order_id {where_clause};"
    total_orders_query = f"SELECT COUNT(DISTINCT order_id) as grand_total FROM orders o {where_clause};"
    total_customers_query = f"SELECT COUNT(DISTINCT customer_id) as grand_total FROM orders o {where_clause};"
    grand_total_revenue = (conn.execute(total_revenue_query, params).fetchone() or {'grand_total': 0})['grand_total']
    grand_total_orders = (conn.execute(total_orders_query, params).fetchone() or {'grand_total': 0})['grand_total']
    grand_total_customers = (conn.execute(total_customers_query, params).fetchone() or {'grand_total': 0})['grand_total']
    conn.close()
    return jsonify({'products': [dict(row) for row in product_data], 'grand_total_revenue': grand_total_revenue or 0, 'grand_total_orders': grand_total_orders or 0, 'grand_total_customers': grand_total_customers or 0})

@app.route('/products_report')
def product_reports_page():
    return render_template('products_report.html')


# --- ROTAS DE ANÁLISE DE CLIENTES ---
@app.route('/api/reports/customer-performance')
def get_customer_performance_data():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    params = []
    where_clause = ""
    if start_date and end_date:
        where_clause = "WHERE o.created_at BETWEEN ? AND ?"
        params.extend([start_date + 'T00:00', end_date + 'T23:59'])
    query = f"SELECT c.name as customer_name, SUM(o.total_amount) as total_revenue, COUNT(o.order_id) as order_count FROM orders o JOIN customers c ON o.customer_id = c.customer_id {where_clause} GROUP BY c.customer_id, c.name ORDER BY total_revenue DESC;"
    conn = get_db_connection()
    customer_data = conn.execute(query, params).fetchall()
    grand_total_revenue = sum(row['total_revenue'] for row in customer_data)
    conn.close()
    return jsonify({'customers': [dict(row) for row in customer_data], 'grand_total_revenue': grand_total_revenue or 0})

@app.route('/api/reports/customer-concentration-trend')
def get_customer_concentration_trend():
    period = request.args.get('period', 'month')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    period_formats = {'month': "strftime('%Y-%m', created_at)",'bimester': "strftime('%Y', created_at) || '-B' || ((strftime('%m', created_at) - 1) / 2 + 1)",'trimester': "strftime('%Y', created_at) || '-Q' || ((strftime('%m', created_at) - 1) / 3 + 1)",'semester': "strftime('%Y', created_at) || '-S' || ((strftime('%m', created_at) - 1) / 6 + 1)",'year': "strftime('%Y', created_at)"}
    period_format = period_formats.get(period, period_formats['month'])
    params = []
    where_clause = ""
    if start_date and end_date:
        where_clause = "WHERE created_at BETWEEN ? AND ?"
        params.extend([start_date + 'T00:00', end_date + 'T23:59'])
    query = f"SELECT {period_format} as period, customer_id, SUM(total_amount) as revenue FROM orders {where_clause} GROUP BY period, customer_id;"
    conn = get_db_connection()
    customer_revenues_raw = conn.execute(query, params).fetchall()
    conn.close()
    data_by_period = {}
    for row in customer_revenues_raw:
        period_key = row['period']
        if period_key not in data_by_period:
            data_by_period[period_key] = []
        data_by_period[period_key].append(row['revenue'])
    response_data = []
    for period, revenues in sorted(data_by_period.items()):
        response_data.append({'period': period, 'total_revenue_in_period': sum(revenues), 'customer_revenues': revenues})
    return jsonify(response_data)

@app.route('/customers_report')
def customer_reports_page():
    return render_template('customers_report.html')


# --- ROTAS DE ANÁLISE DE COORTES ---
@app.route('/api/reports/cohort-retention')
def get_cohort_retention_data():
    period = request.args.get('period', 'month')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    period_formats = { 'month': "strftime('%Y-%m', created_at)", 'bimester': "strftime('%Y', created_at) || '-B' || ((strftime('%m', created_at) - 1) / 2 + 1)", 'trimester': "strftime('%Y', created_at) || '-Q' || ((strftime('%m', created_at) - 1) / 3 + 1)", 'semester': "strftime('%Y', created_at) || '-S' || ((strftime('%m', created_at) - 1) / 6 + 1)", 'year': "strftime('%Y', created_at)" }
    period_format = period_formats.get(period, period_formats['month'])
    params = []
    where_clause = ""
    if start_date and end_date:
        where_clause = "WHERE created_at BETWEEN ? AND ?"
        params.extend([start_date + 'T00:00', end_date + 'T23:59'])
    query = f"WITH CustomerFirstOrder AS (SELECT customer_id, strftime({period_format.replace('created_at', 'MIN(created_at)')}) as cohort_period FROM orders GROUP BY customer_id), OrderActivity AS (SELECT o.customer_id, cfo.cohort_period, strftime({period_format}) as activity_period FROM orders o JOIN CustomerFirstOrder cfo ON o.customer_id = cfo.customer_id {where_clause}) SELECT cohort_period, activity_period, COUNT(DISTINCT customer_id) as active_customers FROM OrderActivity GROUP BY cohort_period, activity_period ORDER BY cohort_period, activity_period;"
    conn = get_db_connection()
    cohort_data = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(row) for row in cohort_data])

@app.route('/cohorts')
def cohorts_page():
    return render_template('cohorts.html')


# --- ROTA PARA DADOS DO HISTOGRAMA ---
@app.route('/api/reports/order-values')
def get_order_values_data():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    params = []
    where_clause = ""
    if start_date and end_date:
        where_clause = "WHERE created_at BETWEEN ? AND ?"
        params.extend([start_date + 'T00:00', end_date + 'T23:59'])
    query = f"SELECT total_amount FROM orders {where_clause};"
    conn = get_db_connection()
    order_values = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify([row['total_amount'] for row in order_values])


# --- ROTAS DE PLANEJAMENTO DE PRODUÇÃO (NOVAS) ---
@app.route('/planning')
def planning_page():
    return render_template('production_planning.html')

@app.route('/api/planning/daily-orders')
def get_daily_orders():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    params = [start_date, end_date]
    where_clause = "WHERE o.execution_status != 'CONCLUIDO' AND DATE(o.pickup_datetime) BETWEEN ? AND ?"

    # --- CORREÇÃO APLICADA AQUI ---
    # A query foi simplificada para evitar a junção com 'products' que causava o erro
    # e agora busca o total_amount diretamente da tabela 'orders'.
    query = f"""
        SELECT
            o.order_id,
            c.name as customer_name,
            o.pickup_datetime,
            o.total_amount,
            DATE(o.pickup_datetime) as delivery_date,
            0 as is_washed,
            0 as is_passed,
            0 as is_packed,
            (SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = o.order_id) * 0.5 as wash_kg,
            0 as pass_kg
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        {where_clause}
        GROUP BY o.order_id
        ORDER BY o.pickup_datetime ASC;
    """
    conn = get_db_connection()
    orders = conn.execute(query, params).fetchall()
    conn.close()

    data_by_day = {}
    for order in orders:
        order_dict = dict(order)
        date = order_dict['delivery_date']
        if date not in data_by_day:
            data_by_day[date] = { 'date': date, 'orders': [], 'total_wash_kg': 0, 'total_pass_kg': 0, 'total_value': 0 }
        data_by_day[date]['orders'].append(order_dict)
        data_by_day[date]['total_wash_kg'] += order_dict.get('wash_kg', 0)
        data_by_day[date]['total_pass_kg'] += order_dict.get('pass_kg', 0)
        data_by_day[date]['total_value'] += order_dict.get('total_amount', 0)

    return jsonify(list(data_by_day.values()))

@app.route('/api/order/details/<int:order_id>')
def get_order_details(order_id):
    query = """
        SELECT p.name as product_name, oi.quantity
        FROM order_items oi
        JOIN products p ON oi.product_id = p.product_id
        WHERE oi.order_id = ?;
    """
    conn = get_db_connection()
    items = conn.execute(query, (order_id,)).fetchall()
    conn.close()
    return jsonify({'items': [dict(row) for row in items]})

@app.route('/api/order/update-status', methods=['POST'])
def update_order_status():
    data = request.get_json()
    order_id = data.get('order_id')
    status_field = data.get('status_field') # ex: "is_washed"
    status_value = data.get('status_value') # ex: true/false

    allowed_fields = ['is_washed', 'is_passed', 'is_packed']
    if not order_id or status_field not in allowed_fields or status_value is None:
        return jsonify({'error': 'Parâmetros inválidos'}), 400
    
    # MODO SOMENTE LEITURA: A operação é simulada no console, mas não salva no banco.
    print(f"[MODO LEITURA] Simulação de atualização para o pedido {order_id}: {status_field} = {status_value}")
    
    # Retorna uma resposta de sucesso para que a interface do usuário continue funcionando visualmente.
    # A alteração não será persistida e será perdida ao recarregar a página.
    return jsonify({
        'success': True, 
        'message': 'Operação em modo de somente leitura. A alteração não foi salva.'
    }), 200

# --- INICIALIZAÇÃO DO SERVIDOR ---
if __name__ == '__main__':
    app.run(port=3001, debug=True)

