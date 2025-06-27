# painel_app.py
import sqlite3
from flask import Flask, jsonify, render_template

app = Flask(__name__)

# Certifique-se de que este caminho relativo está correto
DATABASE_PATH = '../second-pdv/database/lavanderia_ledger.db'

def get_db_connection():
    db_uri = f'file:{DATABASE_PATH}?mode=ro'
    try:
        conn = sqlite3.connect(db_uri, uri=True)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.OperationalError as e:
        print(f"ERRO: Não foi possível conectar ao banco de dados em '{DATABASE_PATH}'.")
        raise e

@app.route('/api/cockpit/active-orders')
def get_cockpit_data():
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
    return render_template('cockpit.html')

if __name__ == '__main__':
    app.run(port=3001, debug=True)