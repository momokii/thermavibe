import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AiConfig from '@/components/admin/AiConfig';
import PaymentConfig from '@/components/admin/PaymentConfig';

export default function AdminConfigPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display font-bold text-white">Configuration</h2>
      <Tabs defaultValue="ai">
        <TabsList>
          <TabsTrigger value="ai">AI Provider</TabsTrigger>
          <TabsTrigger value="payment">Payment</TabsTrigger>
        </TabsList>
        <TabsContent value="ai" className="mt-4">
          <AiConfig />
        </TabsContent>
        <TabsContent value="payment" className="mt-4">
          <PaymentConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}
