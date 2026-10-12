import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { OrderDetail } from '../../components/admin/orders/OrderDetail';
import { PageHeader } from '../../components/admin/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { adminApi } from '../../lib/api';
import type { AdminOrder } from '../../types/admin';

/** Pedido em página inteira (link direto). A lista de pedidos abre o mesmo conteúdo em painel lateral. */
export default function OrderDetailPage() {
  const { id = '' } = useParams();
  // Mesma chave de cache do OrderDetail: não gera requisição extra.
  const order = useQuery({ queryKey: ['admin', 'order', id], queryFn: () => adminApi.get<AdminOrder>(`/orders/${id}`), enabled: !!id });
  useDocumentTitle(order.data ? `Pedido ${order.data.code}` : 'Pedido');
  return (
    <>
      <PageHeader
        title={order.data ? `Pedido ${order.data.code}` : 'Pedido'}
        description={order.data ? order.data.customerName : undefined}
        actions={
          <Link to="/admin/orders" className="btn btn-outline btn-sm">
            Voltar para pedidos
          </Link>
        }
      />
      <div className="order-page">
        <OrderDetail id={id} showTitle={false} />
      </div>
    </>
  );
}
