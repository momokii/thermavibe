import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AiConfig from '@/components/admin/AiConfig';
import PaymentConfig from '@/components/admin/PaymentConfig';
import PhotoboothConfig from '@/components/admin/PhotoboothConfig';

export default function AdminConfigPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 className="text-2xl font-display font-bold text-white">Configuration</h2>
        <p className="text-sm text-white/30" style={{ marginTop: '0.25rem' }}>
          Manage AI provider, payment settings, photobooth, and kiosk behavior.
        </p>
      </div>
      <Tabs defaultValue="ai">
        <TabsList>
          <TabsTrigger value="ai">AI Provider</TabsTrigger>
          <TabsTrigger value="payment">Payment</TabsTrigger>
          <TabsTrigger value="photobooth">Photobooth</TabsTrigger>
        </TabsList>
        <div style={{ marginTop: '2rem' }}>
          <TabsContent value="ai" style={{ marginTop: 0 }}>
            <AiConfig />
          </TabsContent>
          <TabsContent value="payment" style={{ marginTop: 0 }}>
            <PaymentConfig />
          </TabsContent>
          <TabsContent value="photobooth" style={{ marginTop: 0 }}>
            <PhotoboothConfig />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
