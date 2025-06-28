# painel_app.py
# Servidor Flask para os Cockpits de Operação e Gestão.
import sqlite3
from flask import Flask, jsonify, render_template

app = Flask(__name__)

# O caminho para o banco de dados do seu PDV.
# Verifique se este caminho relativo está correto para a sua estrutura de pastas.
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

# --- ROTAS E ENDPOINTS DO COCKPIT OPERACIONAL ---

@app.route('/api/cockpit/active-orders')
def get_cockpit_data():
    """API que fornece dados para o cockpit operacional."""
    conn = get_db_connection()

    # 1. Query para "Em Execução"
    in_progress_orders = conn.execute("""
        SELECT o.order_id, o.pickup_datetime, c.name as customer_name
        FROM orders o JOIN customers c ON o.customer_id = c.customer_id
        WHERE o.execution_status = 'EM_EXECUCAO' ORDER BY o.pickup_datetime ASC;
    """).fetchall()

    # 2. Query para "Aguardando Entrega"
    awaiting_delivery_orders = conn.execute("""
        SELECT o.order_id, c.name as customer_name, o.completed_at
        FROM orders o JOIN customers c ON o.customer_id = c.customer_id
        WHERE o.execution_status = 'AGUARDANDO_ENTREGA' ORDER BY o.completed_at DESC;
    """).fetchall()

    # 3. Query para "Aguardando Retirada"
    awaiting_pickup_orders = conn.execute("""
        SELECT o.order_id, c.name as customer_name, o.completed_at
        FROM orders o JOIN customers c ON o.customer_id = c.customer_id
        WHERE o.execution_status = 'AGUARDANDO_RETIRADA' ORDER BY o.completed_at DESC;
    """).fetchall()

    conn.close()

    # Retorna um objeto JSON com três chaves distintas
    return jsonify({
        'in_progress': [dict(row) for row in in_progress_orders],
        'awaiting_delivery': [dict(row) for row in awaiting_delivery_orders],
        'awaiting_pickup': [dict(row) for row in awaiting_pickup_orders]
    })

@app.route('/cockpit')
def cockpit_page():
    """Renderiza a página HTML do cockpit operacional."""
    return render_template('cockpit.html')


# --- ROTAS E ENDPOINTS DO COCKPIT DE GESTÃO (NOVO) ---

@app.route('/api/gestao/financial-summary')
def get_financial_summary():
    """API que fornece dados para o cockpit de gestão financeira."""
    conn = get_db_connection()

    # Query para Pedidos com Saldo Devedor
    pending_orders = conn.execute("""
        SELECT
            o.order_id, c.name as customer_name, o.total_amount, o.payment_status,
            COALESCE(p.total_paid, 0) as total_paid,
            (o.total_amount - COALESCE(p.total_paid, 0)) as remaining_balance
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        LEFT JOIN (
            SELECT order_id, SUM(amount) as total_paid FROM order_payments GROUP BY order_id
        ) p ON o.order_id = p.order_id
        WHERE
            o.execution_status = 'CONCLUIDO' AND
            o.payment_status IN ('AGUARDANDO_PAGAMENTO', 'PAGO_PARCIALMENTE')
        ORDER BY o.created_at DESC;
    """).fetchall()

    # Query para KPIs de Faturamento Bruto e Total Recebido
    kpis = conn.execute("""
        SELECT
            (SELECT SUM(total_amount) FROM orders) as gross_revenue,
            (SELECT SUM(amount) FROM order_payments) as total_received;
    """).fetchone()

    conn.close()

    # Monta o objeto JSON final para o frontend de gestão
    return jsonify({
        'kpis': dict(kpis) if kpis else {},
        'pending_orders': [dict(row) for row in pending_orders]
    })

@app.route('/gestao')
def gestao_page():
    """Renderiza a página HTML do cockpit de gestão financeira."""
    return render_template('gestao.html')


# --- INICIALIZAÇÃO DO SERVIDOR ---

if __name__ == '__main__':
    # Rodando na porta 3001 para não conflitar com o servidor do PDV
    app.run(port=3001, debug=True)