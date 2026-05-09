# painel_app.py
# Servidor Flask para os Cockpits de Operação e Gestão.
import sqlite3
from flask import Flask, jsonify, render_template, request
from datetime import date

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

# painel_app.py

# painel_app.py

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
    
    stock_summary_query = f"""
        WITH OrderBalance AS (
            SELECT
                order_id,
                total_amount,
                COALESCE((SELECT SUM(amount) FROM order_payments WHERE order_id = o.order_id), 0) as total_paid
            FROM orders o
            WHERE execution_status != 'CONCLUIDO'
            {f"AND customer_id = '{customer_id}'" if customer_id else ""}
        )
        SELECT
            o.execution_status,
            CASE WHEN o.payment_status = 'PAGO' THEN 'paid' ELSE 'unpaid' END as payment_group,
            COUNT(o.order_id) as order_count,
            SUM(o.total_amount) as total_value,
            SUM(o.total_amount - ob.total_paid) as pending_value
        FROM orders o
        JOIN OrderBalance ob ON o.order_id = ob.order_id
        WHERE o.execution_status != 'CONCLUIDO'
        {f"AND o.customer_id = '{customer_id}'" if customer_id else ""}
        GROUP BY o.execution_status, payment_group;
    """
    stock_summary_raw = conn.execute(stock_summary_query).fetchall()
    
    stock_summary = {
        'EM_EXECUCAO': {'total_count': 0, 'total_value': 0, 'paid_count': 0, 'paid_value': 0, 'unpaid_count': 0, 'unpaid_value': 0},
        'AGUARDANDO_ENTREGA': {'total_count': 0, 'total_value': 0, 'paid_count': 0, 'paid_value': 0, 'unpaid_count': 0, 'unpaid_value': 0},
        'AGUARDANDO_RETIRADA': {'total_count': 0, 'total_value': 0, 'paid_count': 0, 'paid_value': 0, 'unpaid_count': 0, 'unpaid_value': 0}
    }

    for row in stock_summary_raw:
        status = row['execution_status']
        if status in stock_summary:
            stock_summary[status]['total_count'] += row['order_count']
            stock_summary[status]['total_value'] += row['total_value']
            if row['payment_group'] == 'paid':
                stock_summary[status]['paid_count'] = row['order_count']
                stock_summary[status]['paid_value'] = row['total_value']
            else:
                stock_summary[status]['unpaid_count'] = row['order_count']
                stock_summary[status]['unpaid_value'] = row['pending_value']

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

    # --- CORREÇÃO APLICADA AQUI ---
    # A query foi alterada para calcular o saldo a partir da tabela ledger_transactions
    # e agora também filtra pelo cliente, se um for selecionado no painel.
    customer_balance_params = []
    customer_balance_where_clause = ""
    if customer_id:
        customer_balance_where_clause = "WHERE customer_id = ?"
        customer_balance_params.append(customer_id)

    customer_balance_query = f"""
        SELECT SUM(
            CASE 
                WHEN transaction_type IN ('PAYMENT_RECEIVED', 'BONUS_ADDED', 'BALANCE_CORRECTION_CREDIT') THEN amount
                WHEN transaction_type IN ('SALE', 'DISCOUNT_APPLIED', 'BALANCE_CORRECTION_DEBIT') THEN -amount
                ELSE 0 
            END
        ) as total_balance 
        FROM ledger_transactions
        {customer_balance_where_clause}
    """
    customer_balance_data = conn.execute(customer_balance_query, customer_balance_params).fetchone()
    customer_total_balance = customer_balance_data['total_balance'] if customer_balance_data and customer_balance_data['total_balance'] is not None else 0

    conn.close()
    return jsonify({
        'completed_kpis': dict(completed_kpis) if completed_kpis else {},
        'pending_orders': [dict(row) for row in pending_orders],
        'all_completed_orders': [dict(row) for row in all_completed_orders],
        'stock_summary': stock_summary,
        'in_progress_orders': [dict(row) for row in in_progress_orders],
        'customer_total_balance': customer_total_balance
    })

@app.route('/api/gestao/orders-detail')
def get_orders_detail():
    order_ids_str = request.args.get('order_ids', '')
    order_ids = [oid.strip() for oid in order_ids_str.split(',') if oid.strip()]
    if not order_ids:
        return jsonify({'error': 'Nenhum pedido selecionado'}), 400

    conn = get_db_connection()
    placeholders = ','.join(['?' for _ in order_ids])

    orders = conn.execute(f"""
        SELECT o.order_id, c.name as customer_name, o.created_at, o.completed_at,
               o.total_amount, o.payment_status
        FROM orders o JOIN customers c ON o.customer_id = c.customer_id
        WHERE o.order_id IN ({placeholders})
        ORDER BY o.completed_at DESC
    """, order_ids).fetchall()

    items = conn.execute(f"""
        SELECT oi.order_id, p.name as product_name, p.category,
               oi.quantity, oi.unit_price, oi.total_price
        FROM order_items oi JOIN products p ON oi.product_id = p.product_id
        WHERE oi.order_id IN ({placeholders})
        ORDER BY oi.order_item_id
    """, order_ids).fetchall()
    conn.close()

    items_by_order = {}
    for item in items:
        oid = item['order_id']
        if oid not in items_by_order:
            items_by_order[oid] = []
        items_by_order[oid].append(dict(item))

    result = []
    for order in orders:
        order_dict = dict(order)
        order_dict['items'] = items_by_order.get(order_dict['order_id'], [])
        result.append(order_dict)

    return jsonify(result)

@app.route('/gestao')
def gestao_page():
    return render_template('gestao.html')


# --- ROTAS DE RELATÓRIOS GERENCIAIS (GRÁFICOS) ---
# painel_app.py

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

    # --- CORREÇÃO APLICADA AQUI ---
    # A query foi reestruturada para calcular todos os dados necessários de uma só vez,
    # eliminando o loop e a consulta secundária (problema N+1).
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
        ),
        CustomerRevenuePerPeriod AS (
            -- 3. (NOVO) Pré-calcula o faturamento total por cliente em cada período
            SELECT
                period,
                SUM(total_amount) as customer_revenue
            FROM PeriodData
            GROUP BY period, customer_id
        )
        -- 4. Agrega os resultados finais para a resposta da API
        SELECT
            pd.period,
            COUNT(DISTINCT pd.order_id) as order_count,
            SUM(pd.total_amount) as total_revenue,
            COUNT(DISTINCT pd.customer_id) as distinct_customer_count,
            COUNT(DISTINCT CASE WHEN pd.period = pd.first_period THEN pd.customer_id ELSE NULL END) as new_customer_count,
            COUNT(DISTINCT CASE WHEN pd.period != pd.first_period THEN pd.customer_id ELSE NULL END) as returning_customer_count,
            GROUP_CONCAT(pd.total_amount) as ticket_values,
            -- Usa a CTE pré-calculada para agregar os faturamentos por cliente
            (SELECT GROUP_CONCAT(crp.customer_revenue)
             FROM CustomerRevenuePerPeriod crp
             WHERE crp.period = pd.period) as revenue_per_customer_values
        FROM PeriodData pd
        GROUP BY pd.period
        ORDER BY pd.period ASC;
    """
    conn = get_db_connection()
    report_data = conn.execute(query, params).fetchall()
    conn.close()

    # Com a nova query, o processamento em Python não é mais necessário.
    # A resposta já vem pronta do banco de dados.
    return jsonify([dict(row) for row in report_data])
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
    period = request.args.get('period')
    params = []
    where_clause = ""
    if start_date and end_date:
        where_clause = "WHERE o.created_at BETWEEN ? AND ?"
        params.extend([start_date + 'T00:00', end_date + 'T23:59'])

    if period:
        period_formats = {
            'daily': "strftime('%Y-%m-%d', o.created_at)",
            'week': "strftime('%Y-W%W', o.created_at)",
            'month': "strftime('%Y-%m', o.created_at)",
            'bimester': "strftime('%Y', o.created_at) || '-B' || ((strftime('%m', o.created_at) - 1) / 2 + 1)",
            'quarter': "strftime('%Y', o.created_at) || '-Q' || ((strftime('%m', o.created_at) - 1) / 3 + 1)",
            'semester': "strftime('%Y', o.created_at) || '-S' || ((strftime('%m', o.created_at) - 1) / 6 + 1)",
            'year': "strftime('%Y', o.created_at)"
        }
        period_format = period_formats.get(period, period_formats['month'])
        query = f"SELECT p.product_id, p.name as product_name, p.category as product_category, {period_format} as period, SUM(oi.quantity) as total_quantity, SUM(oi.total_price) as total_revenue, COUNT(DISTINCT o.order_id) as order_appearence_count, COUNT(DISTINCT o.customer_id) as distinct_customer_count FROM order_items oi JOIN products p ON oi.product_id = p.product_id JOIN orders o ON oi.order_id = o.order_id {where_clause} GROUP BY p.product_id, p.name, p.category, period ORDER BY period ASC, total_revenue DESC;"
    else:
        query = f"SELECT p.product_id, p.name as product_name, p.category as product_category, SUM(oi.quantity) as total_quantity, SUM(oi.total_price) as total_revenue, COUNT(DISTINCT o.order_id) as order_appearence_count, COUNT(DISTINCT o.customer_id) as distinct_customer_count FROM order_items oi JOIN products p ON oi.product_id = p.product_id JOIN orders o ON oi.order_id = o.order_id {where_clause} GROUP BY p.product_id, p.name, p.category ORDER BY total_revenue DESC;"

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
# painel_app.py

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
    
    # --- CORREÇÃO APLICADA AQUI ---
    # A query foi ajustada para selecionar também o "c.customer_id".
    query = f"""
        SELECT 
            c.customer_id, 
            c.name as customer_name, 
            SUM(o.total_amount) as total_revenue, 
            COUNT(o.order_id) as order_count 
        FROM orders o 
        JOIN customers c ON o.customer_id = c.customer_id 
        {where_clause} 
        GROUP BY c.customer_id, c.name 
        ORDER BY total_revenue DESC;
    """
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

# --- ROTAS DE ANÁLISE RFM ---
# painel_app.py

@app.route('/api/reports/rfm-analysis')
def get_rfm_analysis_data():
    """
    Calcula a segmentação RFM e retorna a ordem explícita dos segmentos.
    """
    end_date_str = request.args.get('end_date', date.today().strftime('%Y-%m-%d'))
    start_date_str = request.args.get('start_date')

    params = [end_date_str + 'T23:59:59'] 
    
    where_clauses = ["DATE(o.created_at) <= ?"]
    params.append(end_date_str)

    if start_date_str:
        where_clauses.append("DATE(o.created_at) >= ?")
        params.append(start_date_str)

    where_clause_str = " AND ".join(where_clauses)
    
    conn = get_db_connection()
    main_query = f"""
        WITH CustomerMetrics AS (
            SELECT
                c.customer_id,
                c.name as customer_name,
                CAST(JULIANDAY(?) - JULIANDAY(MAX(o.created_at)) AS INTEGER) as recency,
                COUNT(DISTINCT o.order_id) as frequency,
                SUM(o.total_amount) as monetary
            FROM customers c
            JOIN orders o ON c.customer_id = o.customer_id
            WHERE {where_clause_str}
            GROUP BY c.customer_id, c.name
        ),
        RFMScores AS (
            SELECT
                *,
                NTILE(5) OVER (ORDER BY recency DESC) as r_score,
                NTILE(5) OVER (ORDER BY frequency ASC) as f_score,
                NTILE(5) OVER (ORDER BY monetary ASC) as m_score
            FROM CustomerMetrics
        )
        SELECT
            *,
            (r_score || f_score || m_score) as rfm_score
        FROM RFMScores
    """
    
    rfm_data = conn.execute(main_query, params).fetchall()

    score_boundaries = { 'recency': {}, 'frequency': {}, 'monetary': {} }
    if rfm_data:
        data_list = [dict(row) for row in rfm_data]
        
        for metric in ['recency', 'frequency', 'monetary']:
            score_col = f'{metric[0]}_score'
            for score in range(1, 6):
                values_for_score = [d[metric] for d in data_list if d[score_col] == score]
                if values_for_score:
                    score_boundaries[metric][score] = {
                        'min': min(values_for_score),
                        'max': max(values_for_score),
                        'count': len(values_for_score) 
                    }

    segment_definitions = {
        'Campeões': { 'description': 'Elite (R≥4, F≥5, M≥4).', 'color': '#28a745', 'scores': [] },
        'Em Risco': { 'description': 'Eram muito frequentes, agora inativos (F≥4, R≤2).', 'color': '#fd7e14', 'scores': [] },
        'Clientes Leais': { 'description': 'Alta frequência (F≥4).', 'color': '#20c997', 'scores': [] },
        'Novos': { 'description': 'Muito recentes, baixa frequência (R≥4, F≤2).', 'color': '#007bff', 'scores': [] },
        'Potenciais': { 'description': 'Ativos e com boa frequência (R≥3, F≥3).', 'color': '#6f42c1', 'scores': [] },
        'Perdidos': { 'description': 'Clientes com baixa atividade geral.', 'color': '#6c757d', 'scores': [] }
    }
    
    # --- ALTERAÇÃO AQUI: Define a ordem explícita dos painéis ---
    segment_order = ['Campeões', 'Em Risco', 'Clientes Leais', 'Novos', 'Potenciais', 'Perdidos']

    segments_data = {name: [] for name in segment_definitions.keys()}
    segment_scores = {name: set() for name in segment_definitions.keys()}

    for row_proxy in rfm_data:
        row = dict(row_proxy)
        r_score, f_score, m_score = row['r_score'], row['f_score'], row['m_score']
        segment_name = ''

        if r_score >= 4 and f_score >= 5 and m_score >= 4:
            segment_name = 'Campeões'
        elif r_score <= 2 and f_score >= 4:
            segment_name = 'Em Risco'
        elif f_score >= 4:
            segment_name = 'Clientes Leais'
        elif r_score >= 4 and f_score <= 2:
            segment_name = 'Novos'
        elif f_score >= 3 and r_score >= 3:
            segment_name = 'Potenciais'
        else:
            segment_name = 'Perdidos'
        
        segments_data[segment_name].append(row)
        segment_scores[segment_name].add(row['rfm_score'])

    for name, scores in segment_scores.items():
        segment_definitions[name]['scores'] = sorted(list(scores))

    for segment in segments_data.values():
        segment.sort(key=lambda x: x['rfm_score'], reverse=True)

    conn.close()
            
    return jsonify({
        'segments': segments_data,
        'score_boundaries': score_boundaries,
        'segment_definitions': segment_definitions,
        'segment_order': segment_order # Nova chave na resposta
    })

@app.route('/rfm_analysis')
def rfm_analysis_page():
    return render_template('rfm_analysis.html')

# --- ROTAS DE EXTRATO DE CLIENTE ---
@app.route('/api/reports/customer-statement/<customer_id>')
def get_customer_statement(customer_id):
    """
    Busca o extrato de transações e o saldo de um cliente específico.
    """
    conn = get_db_connection()
    
    # Busca informações do cliente e seu saldo calculado
    customer_info_query = """
        SELECT
            c.name,
            c.phone,
            c.email,
            (SELECT SUM(CASE 
                WHEN lt.transaction_type IN ('PAYMENT_RECEIVED', 'BONUS_ADDED', 'BALANCE_CORRECTION_CREDIT') THEN lt.amount
                ELSE -lt.amount 
            END) FROM ledger_transactions lt WHERE lt.customer_id = c.customer_id) as current_balance
        FROM customers c
        WHERE c.customer_id = ?;
    """
    customer = conn.execute(customer_info_query, [customer_id]).fetchone()
    
    # Busca todas as transações do ledger para o cliente
    transactions_query = """
        SELECT
            transaction_id,
            timestamp,
            transaction_type,
            description,
            amount
        FROM ledger_transactions
        WHERE customer_id = ?
        ORDER BY timestamp DESC;
    """
    transactions = conn.execute(transactions_query, [customer_id]).fetchall()
    
    conn.close()
    
    if not customer:
        return jsonify({'error': 'Cliente não encontrado'}), 404
        
    return jsonify({
        'customer_info': dict(customer),
        'transactions': [dict(row) for row in transactions]
    })

@app.route('/customer_statement/<customer_id>')
def customer_statement_page(customer_id):
    # Passa o customer_id para o template para que o JS possa buscá-lo
    return render_template('customer_statement.html', customer_id=customer_id)


# --- ROTAS DE ANÁLISE DE COORTES ---
@app.route('/api/reports/cohort-retention')
def get_cohort_retention_data():
    # ... (código existente, sem alterações) ...
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

# --- ADICIONE ISTO AO painel_app.py ---
# --- COLAR ISTO NO ARQUIVO painel_app.py (Substituindo a rota anterior) ---

@app.route('/api/reports/evolution-comparison')
def get_evolution_comparison_data():
    """
    Retorna dados acumulados para comparação, consistente com os Relatórios Gerenciais.
    """
    period_type = request.args.get('period_type', 'month') 
    metric = request.args.get('metric', 'revenue') # 'revenue' ou 'orders'
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    # 1. Definição do Rótulo do Período (A "Linha" do gráfico)
    # Mesma lógica do get_reports_summary para garantir os mesmos nomes de agrupamento
    period_formats = {
        'week': "strftime('%Y-W%W', created_at)",
        'month': "strftime('%Y-%m', created_at)",
        'bimester': "strftime('%Y', created_at) || '-B' || ((strftime('%m', created_at) - 1) / 2 + 1)",
        'trimester': "strftime('%Y', created_at) || '-Q' || ((strftime('%m', created_at) - 1) / 3 + 1)",
        'semester': "strftime('%Y', created_at) || '-S' || ((strftime('%m', created_at) - 1) / 6 + 1)",
        'year': "strftime('%Y', created_at)"
    }
    period_label_sql = period_formats.get(period_type, period_formats['month'])

    # 2. Definição do Eixo X (O progresso dentro do período)
    if period_type == 'week':
        # Eixo X: Dia da semana (0=Domingo, 6=Sábado)
        x_axis_sql = "CAST(strftime('%w', created_at) as INTEGER)"
    elif period_type == 'month':
        # Eixo X: Dia do mês (1-31)
        x_axis_sql = "CAST(strftime('%d', created_at) as INTEGER)"
    elif period_type == 'year':
        # Eixo X: Mês do ano (1-12)
        x_axis_sql = "CAST(strftime('%m', created_at) as INTEGER)"
    elif period_type == 'bimester':
        # Eixo X: Mês dentro do bimestre (1 ou 2)
        x_axis_sql = "(CAST(strftime('%m', created_at) as INTEGER) - 1) % 2 + 1"
    elif period_type == 'trimester':
        # Eixo X: Mês dentro do trimestre (1 a 3)
        x_axis_sql = "(CAST(strftime('%m', created_at) as INTEGER) - 1) % 3 + 1"
    elif period_type == 'semester':
        # Eixo X: Mês dentro do semestre (1 a 6)
        x_axis_sql = "(CAST(strftime('%m', created_at) as INTEGER) - 1) % 6 + 1"
    else:
        # Fallback para dia do mês
        x_axis_sql = "CAST(strftime('%d', created_at) as INTEGER)"

    # 3. Construção da Query
    params = []
    where_clause = "WHERE created_at IS NOT NULL"
    
    if start_date and end_date:
        where_clause += " AND created_at BETWEEN ? AND ?"
        params.extend([start_date + 'T00:00', end_date + 'T23:59'])

    query = f"""
        SELECT 
            {period_label_sql} as period_label,
            {x_axis_sql} as time_index,
            SUM(total_amount) as total_revenue,
            COUNT(order_id) as total_orders
        FROM orders
        {where_clause}
        GROUP BY 1, 2
        ORDER BY 1 ASC, 2 ASC;
    """
    
    conn = get_db_connection()
    raw_data = conn.execute(query, params).fetchall()
    conn.close()

    # 4. Processamento Python (Acumulado)
    datasets = {}
    
    for row in raw_data:
        period = row['period_label']
        if not period: continue # Proteção contra None
            
        day_index = row['time_index']
        val = row['total_revenue'] if metric == 'revenue' else row['total_orders']
        
        if period not in datasets:
            datasets[period] = {
                'data_points': [],
                'running_total': 0
            }
        
        datasets[period]['running_total'] += val
        
        # Se for receita, converte centavos para Reais
        final_val = datasets[period]['running_total'] / 100 if metric == 'revenue' else datasets[period]['running_total']
        
        datasets[period]['data_points'].append({
            'x': day_index,
            'y': final_val
        })
    
    return jsonify(datasets)

@app.route('/evolution_report')
def evolution_report_page():
    return render_template('evolution_comparison.html')


# --- INICIALIZAÇÃO DO SERVIDOR ---
if __name__ == '__main__':
    app.run(port=3001, debug=True)