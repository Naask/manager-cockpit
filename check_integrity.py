"""
Verifica a integridade dos dados financeiros do banco de dados.
Uso: python check_integrity.py
"""
import sqlite3

DATABASE_PATH = '../second-pdv/database/lavanderia_ledger.db'

def fmt(cents):
    return f"R$ {cents / 100:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')

def run():
    db_uri = f'file:{DATABASE_PATH}?mode=ro'
    conn = sqlite3.connect(db_uri, uri=True)
    conn.row_factory = sqlite3.Row

    print("=" * 60)
    print("  RELATÓRIO DE INTEGRIDADE DE DADOS")
    print("=" * 60)

    # --- 1. Breakdown por payment_status (excluindo cancelados) ---
    rows = conn.execute("""
        SELECT
            payment_status,
            COUNT(*)        AS qty,
            SUM(total_amount) AS total
        FROM orders
        WHERE execution_status != 'CANCELADO'
        GROUP BY payment_status
        ORDER BY payment_status
    """).fetchall()

    totals_by_status = {r['payment_status']: dict(r) for r in rows}
    grand_total_orders = sum(r['total'] or 0 for r in rows)
    grand_qty          = sum(r['qty']   or 0 for r in rows)

    print(f"\n[1] Pedidos por status de pagamento (excluindo cancelados)")
    print(f"    {'Status':<30} {'Qtd':>6}  {'Valor':>14}")
    print(f"    {'-'*54}")
    for r in rows:
        print(f"    {r['payment_status']:<30} {r['qty']:>6}  {fmt(r['total'] or 0):>14}")
    print(f"    {'-'*54}")
    print(f"    {'TOTAL':<30} {grand_qty:>6}  {fmt(grand_total_orders):>14}")

    pago         = totals_by_status.get('PAGO',                  {}).get('total') or 0
    pago_parc    = totals_by_status.get('PAGO_PARCIALMENTE',      {}).get('total') or 0
    aguardando   = totals_by_status.get('AGUARDANDO_PAGAMENTO',   {}).get('total') or 0

    soma_split = pago + pago_parc + aguardando
    ok1 = soma_split == grand_total_orders
    print(f"\n    CHECK: PAGO + PAGO_PARCIALMENTE + AGUARDANDO = TOTAL?")
    print(f"    {fmt(pago)} + {fmt(pago_parc)} + {fmt(aguardando)} = {fmt(soma_split)}")
    print(f"    {'[OK] OK' if ok1 else '[FALHA] FALHA'} (total pedidos = {fmt(grand_total_orders)})")

    # --- 2. Valores recebidos vs. pendentes via order_payments ---
    pay_row = conn.execute("""
        SELECT
            SUM(op.amount)                              AS total_received,
            SUM(o.total_amount)                         AS total_orders,
            SUM(o.total_amount) - SUM(op.amount)        AS outstanding
        FROM orders o
        JOIN order_payments op ON op.order_id = o.order_id
        WHERE o.execution_status != 'CANCELADO'
    """).fetchone()

    unpaid_row = conn.execute("""
        SELECT SUM(total_amount) AS total_unpaid
        FROM orders
        WHERE execution_status != 'CANCELADO'
          AND payment_status = 'AGUARDANDO_PAGAMENTO'
          AND order_id NOT IN (SELECT DISTINCT order_id FROM order_payments)
    """).fetchone()

    total_received = pay_row['total_received'] or 0
    # Orders that have zero payments are not in the join above, so add them
    orders_with_payments_total = pay_row['total_orders'] or 0
    fully_unpaid_total         = unpaid_row['total_unpaid'] or 0
    total_received_incl        = total_received
    total_order_value_via_pay  = orders_with_payments_total + fully_unpaid_total

    print(f"\n[2] Recebimentos vs. Pendências (order_payments)")
    print(f"    Total recebido (order_payments) :  {fmt(total_received)}")

    # Outstanding per order (what's still owed per order)
    outstanding_row = conn.execute("""
        SELECT SUM(o.total_amount - COALESCE(p.paid, 0)) AS outstanding
        FROM orders o
        LEFT JOIN (
            SELECT order_id, SUM(amount) AS paid
            FROM order_payments GROUP BY order_id
        ) p ON o.order_id = p.order_id
        WHERE o.execution_status != 'CANCELADO'
          AND o.payment_status   != 'PAGO'
    """).fetchone()
    outstanding = outstanding_row['outstanding'] or 0

    print(f"    Saldo pendente (não-PAGO)       :  {fmt(outstanding)}")
    soma2 = total_received + outstanding
    ok2 = soma2 == grand_total_orders
    print(f"    Recebido + Pendente             :  {fmt(soma2)}")
    print(f"    {'[OK] OK' if ok2 else '[FALHA] FALHA'} (total pedidos = {fmt(grand_total_orders)})")

    # --- 3. Pedidos marcados PAGO mas com pagamento diferente do total ---
    mismatch_pago = conn.execute("""
        SELECT o.order_id, o.total_amount, COALESCE(p.paid, 0) AS paid,
               o.total_amount - COALESCE(p.paid, 0) AS diff
        FROM orders o
        LEFT JOIN (
            SELECT order_id, SUM(amount) AS paid
            FROM order_payments GROUP BY order_id
        ) p ON o.order_id = p.order_id
        WHERE o.payment_status = 'PAGO'
          AND o.execution_status != 'CANCELADO'
          AND o.total_amount != COALESCE(p.paid, 0)
    """).fetchall()

    print(f"\n[3] Pedidos PAGO com valor recebido diferente do total do pedido")
    if mismatch_pago:
        print(f"    [FALHA] {len(mismatch_pago)} pedido(s) com divergência:")
        for r in mismatch_pago:
            print(f"      Pedido {r['order_id']}: total={fmt(r['total_amount'])}  "
                  f"recebido={fmt(r['paid'])}  diff={fmt(r['diff'])}")
    else:
        print(f"    [OK] Nenhuma divergência encontrada")

    # --- 4. Pedidos PAGO_PARCIALMENTE com pagamento >= total (deveriam ser PAGO) ---
    mismatch_parc = conn.execute("""
        SELECT o.order_id, o.total_amount, COALESCE(p.paid, 0) AS paid
        FROM orders o
        LEFT JOIN (
            SELECT order_id, SUM(amount) AS paid
            FROM order_payments GROUP BY order_id
        ) p ON o.order_id = p.order_id
        WHERE o.payment_status = 'PAGO_PARCIALMENTE'
          AND o.execution_status != 'CANCELADO'
          AND COALESCE(p.paid, 0) >= o.total_amount
    """).fetchall()

    print(f"\n[4] Pedidos PAGO_PARCIALMENTE com pagamento >= total (deveriam ser PAGO)")
    if mismatch_parc:
        print(f"    [FALHA] {len(mismatch_parc)} pedido(s) com status incorreto:")
        for r in mismatch_parc:
            print(f"      Pedido {r['order_id']}: total={fmt(r['total_amount'])}  recebido={fmt(r['paid'])}")
    else:
        print(f"    [OK] Nenhuma divergência encontrada")

    # --- 5. Pedidos AGUARDANDO_PAGAMENTO com algum pagamento registrado ---
    mismatch_wait = conn.execute("""
        SELECT o.order_id, o.total_amount, COALESCE(p.paid, 0) AS paid
        FROM orders o
        JOIN (
            SELECT order_id, SUM(amount) AS paid
            FROM order_payments GROUP BY order_id
        ) p ON o.order_id = p.order_id
        WHERE o.payment_status = 'AGUARDANDO_PAGAMENTO'
          AND o.execution_status != 'CANCELADO'
          AND p.paid > 0
    """).fetchall()

    print(f"\n[5] Pedidos AGUARDANDO_PAGAMENTO com pagamentos registrados (deveriam ser PAGO/PAGO_PARCIALMENTE)")
    if mismatch_wait:
        print(f"    [FALHA] {len(mismatch_wait)} pedido(s) com status incorreto:")
        for r in mismatch_wait:
            print(f"      Pedido {r['order_id']}: total={fmt(r['total_amount'])}  recebido={fmt(r['paid'])}")
    else:
        print(f"    [OK] Nenhuma divergência encontrada")

    conn.close()

    # --- Resumo final ---
    all_ok = ok1 and ok2 and not mismatch_pago and not mismatch_parc and not mismatch_wait
    print("\n" + "=" * 60)
    if all_ok:
        print("  RESULTADO: [OK] Todos os checks passaram — dados consistentes")
    else:
        print("  RESULTADO: [FALHA] Foram encontradas divergências (ver acima)")
    print("=" * 60)

if __name__ == '__main__':
    run()
