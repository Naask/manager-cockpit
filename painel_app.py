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

# --- ROTAS E ENDPOINTS DO COCKPIT OPERACIONAL (Sem alterações) ---

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


# --- ROTAS E ENDPOINTS DO COCKPIT DE GESTÃO ---

@app.route('/api/gestao/financial-summary')
def get_financial_summary():
    """API que fornece dados financeiros, com filtro opcional por data e status 'CONCLUIDO'."""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    conn = get_db_connection()
    
    # --- Lógica de Filtro para Pedidos CONCLUÍDOS ---
    params = []
    where_clauses_completed = ["o.execution_status = 'CONCLUIDO'"]
    if start_date and end_date:
        where_clauses_completed.append("o.completed_at BETWEEN ? AND ?")
        params.extend([start_date + 'T00:00', end_date + 'T23:59'])
    
    final_where_clause_completed = f"WHERE {' AND '.join(where_clauses_completed)}"

    completed_kpi_query = f"""
        WITH FilteredOrders AS (
            SELECT order_id, total_amount FROM orders o {final_where_clause_completed}
        )
        SELECT
            (SELECT COUNT(order_id) FROM FilteredOrders) as orders_count,
            (SELECT SUM(total_amount) FROM FilteredOrders) as gross_revenue,
            (SELECT SUM(p.amount) FROM order_payments p JOIN FilteredOrders fo ON p.order_id = fo.order_id) as total_received,
            (SELECT COUNT(DISTINCT p.order_id) FROM order_payments p JOIN FilteredOrders fo ON p.order_id = fo.order_id) as paid_orders_count;
    """
    completed_kpis = conn.execute(completed_kpi_query, params).fetchone()

    pending_where_clause = f"{final_where_clause_completed} AND o.payment_status IN ('AGUARDANDO_PAGAMENTO', 'PAGO_PARCIALMENTE')"
    pending_orders_query = f"SELECT o.order_id, c.name as customer_name, o.total_amount, o.payment_status, COALESCE(p.total_paid, 0) as total_paid, (o.total_amount - COALESCE(p.total_paid, 0)) as remaining_balance FROM orders o JOIN customers c ON o.customer_id = c.customer_id LEFT JOIN (SELECT order_id, SUM(amount) as total_paid FROM order_payments GROUP BY order_id) p ON o.order_id = p.order_id {pending_where_clause} ORDER BY o.created_at DESC;"
    pending_orders = conn.execute(pending_orders_query, params).fetchall()
    
    all_completed_query = f"SELECT o.order_id, c.name as customer_name, o.completed_at, o.total_amount FROM orders o JOIN customers c ON o.customer_id = c.customer_id {final_where_clause_completed} ORDER BY o.completed_at DESC;"
    all_completed_orders = conn.execute(all_completed_query, params).fetchall()

    # Query para KPIs de Pedidos em ABERTO (não filtrável por data)
    open_orders_kpis_query = """
        WITH OpenOrders AS (
            SELECT order_id, total_amount, payment_status FROM orders WHERE execution_status != 'CONCLUIDO'
        )
        SELECT
            (SELECT COUNT(order_id) FROM OpenOrders) as total_open_count,
            (SELECT SUM(total_amount) FROM OpenOrders) as total_open_value,
            (SELECT COUNT(order_id) FROM OpenOrders WHERE payment_status = 'PAGO') as open_and_paid_count,
            (SELECT SUM(total_amount) FROM OpenOrders WHERE payment_status = 'PAGO') as open_and_paid_value,
            (SELECT COUNT(order_id) FROM OpenOrders WHERE payment_status IN ('AGUARDANDO_PAGAMENTO', 'PAGO_PARCIALMENTE')) as open_and_unpaid_count,
            (SELECT SUM(o.total_amount - COALESCE(p.total_paid, 0)) FROM OpenOrders o LEFT JOIN (SELECT order_id, SUM(amount) as total_paid FROM order_payments GROUP BY order_id) p ON o.order_id = p.order_id WHERE o.payment_status IN ('AGUARDANDO_PAGAMENTO', 'PAGO_PARCIALMENTE')) as open_and_unpaid_value
    """
    open_orders_kpis = conn.execute(open_orders_kpis_query).fetchone()

    # Query para a lista de todos os pedidos em andamento
    # ALTERAÇÃO: Adicionamos os campos de pagamento e valor.
    in_progress_orders_query = """
        SELECT
            o.order_id,
            c.name as customer_name,
            o.execution_status,
            o.pickup_datetime,
            o.payment_status,
            o.total_amount
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        WHERE o.execution_status != 'CONCLUIDO'
        ORDER BY o.pickup_datetime ASC, o.created_at ASC;
    """
    in_progress_orders = conn.execute(in_progress_orders_query).fetchall()

    conn.close()

    return jsonify({
        'completed_kpis': dict(completed_kpis) if completed_kpis else {},
        'pending_orders': [dict(row) for row in pending_orders],
        'all_completed_orders': [dict(row) for row in all_completed_orders],
        'open_orders_kpis': dict(open_orders_kpis) if open_orders_kpis else {},
        'in_progress_orders': [dict(row) for row in in_progress_orders]
    })

@app.route('/gestao')
def gestao_page():
    return render_template('gestao.html')


if __name__ == '__main__':
    app.run(port=3001, debug=True)