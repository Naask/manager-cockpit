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

# --- ROTAS DO COCKPIT OPERACIONAL (Sem alterações) ---
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

# --- ROTAS DO COCKPIT DE GESTÃO (Sem alterações) ---
@app.route('/api/gestao/financial-summary')
def get_financial_summary():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    conn = get_db_connection()
    params = []
    where_clauses_completed = ["o.execution_status = 'CONCLUIDO'"]
    if start_date and end_date:
        where_clauses_completed.append("o.completed_at BETWEEN ? AND ?")
        params.extend([start_date + 'T00:00', end_date + 'T23:59'])
    final_where_clause_completed = f"WHERE {' AND '.join(where_clauses_completed)}"
    completed_kpi_query = f"WITH FilteredOrders AS (SELECT order_id, total_amount FROM orders o {final_where_clause_completed}) SELECT (SELECT COUNT(order_id) FROM FilteredOrders) as orders_count, (SELECT SUM(total_amount) FROM FilteredOrders) as gross_revenue, (SELECT SUM(p.amount) FROM order_payments p JOIN FilteredOrders fo ON p.order_id = fo.order_id) as total_received, (SELECT COUNT(DISTINCT p.order_id) FROM order_payments p JOIN FilteredOrders fo ON p.order_id = fo.order_id) as paid_orders_count;"
    completed_kpis = conn.execute(completed_kpi_query, params).fetchone()
    pending_where_clause = f"{final_where_clause_completed} AND o.payment_status IN ('AGUARDANDO_PAGAMENTO', 'PAGO_PARCIALMENTE')"
    pending_orders_query = f"SELECT o.order_id, c.name as customer_name, o.total_amount, o.payment_status, o.completed_at, COALESCE(p.total_paid, 0) as total_paid, (o.total_amount - COALESCE(p.total_paid, 0)) as remaining_balance FROM orders o JOIN customers c ON o.customer_id = c.customer_id LEFT JOIN (SELECT order_id, SUM(amount) as total_paid FROM order_payments GROUP BY order_id) p ON o.order_id = p.order_id {pending_where_clause} ORDER BY o.completed_at DESC;"
    pending_orders = conn.execute(pending_orders_query, params).fetchall()
    all_completed_query = f"SELECT o.order_id, c.name as customer_name, o.completed_at, o.total_amount FROM orders o JOIN customers c ON o.customer_id = c.customer_id {final_where_clause_completed} ORDER BY o.completed_at DESC;"
    all_completed_orders = conn.execute(all_completed_query, params).fetchall()
    open_orders_kpis_query = "WITH OpenOrders AS (SELECT order_id, total_amount, payment_status FROM orders WHERE execution_status != 'CONCLUIDO') SELECT (SELECT COUNT(order_id) FROM OpenOrders) as total_open_count, (SELECT SUM(total_amount) FROM OpenOrders) as total_open_value, (SELECT COUNT(order_id) FROM OpenOrders WHERE payment_status = 'PAGO') as open_and_paid_count, (SELECT SUM(total_amount) FROM OpenOrders WHERE payment_status = 'PAGO') as open_and_paid_value, (SELECT COUNT(order_id) FROM OpenOrders WHERE payment_status IN ('AGUARDANDO_PAGAMENTO', 'PAGO_PARCIALMENTE')) as open_and_unpaid_count, (SELECT SUM(o.total_amount - COALESCE(p.total_paid, 0)) FROM OpenOrders o LEFT JOIN (SELECT order_id, SUM(amount) as total_paid FROM order_payments GROUP BY order_id) p ON o.order_id = p.order_id WHERE o.payment_status IN ('AGUARDANDO_PAGAMENTO', 'PAGO_PARCIALMENTE')) as open_and_unpaid_value"
    open_orders_kpis = conn.execute(open_orders_kpis_query).fetchone()
    in_progress_orders_query = "SELECT o.order_id, c.name as customer_name, o.execution_status, o.pickup_datetime, o.payment_status, o.total_amount FROM orders o JOIN customers c ON o.customer_id = c.customer_id WHERE o.execution_status != 'CONCLUIDO' ORDER BY o.pickup_datetime ASC, o.created_at ASC;"
    in_progress_orders = conn.execute(in_progress_orders_query).fetchall()
    conn.close()
    return jsonify({'completed_kpis': dict(completed_kpis) if completed_kpis else {}, 'pending_orders': [dict(row) for row in pending_orders], 'all_completed_orders': [dict(row) for row in all_completed_orders], 'open_orders_kpis': dict(open_orders_kpis) if open_orders_kpis else {}, 'in_progress_orders': [dict(row) for row in in_progress_orders]})

@app.route('/gestao')
def gestao_page():
    return render_template('gestao.html')


# --- ROTAS PARA O PAINEL DE RELATÓRIOS GERENCIAIS ---

@app.route('/api/reports/summary')
def get_reports_summary():
    """
    API que retorna dados agregados para os gráficos gerenciais,
    com agrupamento dinâmico e filtro de data.
    """
    period = request.args.get('period', 'month')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    period_formats = {
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

    # CORREÇÃO: Query reescrita para ser mais robusta e correta.
    query = f"""
        WITH PeriodData AS (
            SELECT
                {period_format} as period,
                customer_id,
                order_id,
                total_amount,
                (SELECT {period_format.replace('created_at', 'MIN(o2.created_at)')} FROM orders o2 WHERE o2.customer_id = o.customer_id) as first_period
            FROM orders o
            {where_clause}
        ),
        AggregatedData AS (
            SELECT
                period,
                customer_id,
                SUM(total_amount) as customer_total
            FROM PeriodData
            GROUP BY period, customer_id
        )
        SELECT
            p.period,
            COUNT(DISTINCT p.order_id) as order_count,
            SUM(p.total_amount) as total_revenue,
            COUNT(DISTINCT p.customer_id) as distinct_customer_count,
            COUNT(DISTINCT CASE WHEN p.period = p.first_period THEN p.customer_id ELSE NULL END) as new_customer_count,
            COUNT(DISTINCT CASE WHEN p.period != p.first_period THEN p.customer_id ELSE NULL END) as returning_customer_count,
            GROUP_CONCAT(p.total_amount) as ticket_values,
            GROUP_CONCAT(ad.customer_total) as revenue_per_customer_values
        FROM PeriodData p
        LEFT JOIN AggregatedData ad ON p.period = ad.period AND p.customer_id = ad.customer_id
        GROUP BY p.period
        ORDER BY p.period ASC;
    """

    conn = get_db_connection()
    report_data = conn.execute(query, params).fetchall()
    conn.close()

    # Processamento para evitar duplicatas em agregações de strings
    processed_data = []
    for row_dict in [dict(row) for row in report_data]:
        if row_dict.get('revenue_per_customer_values'):
            unique_revenues = set(row_dict['revenue_per_customer_values'].split(','))
            row_dict['revenue_per_customer_values'] = ",".join(unique_revenues)
        processed_data.append(row_dict)

    return jsonify(processed_data)


@app.route('/reports')
def reports_page():
    """Renderiza a página HTML dos relatórios gerenciais."""
    return render_template('management_reports.html')


# --- INICIALIZAÇÃO DO SERVIDOR ---
if __name__ == '__main__':
    app.run(port=3001, debug=True)