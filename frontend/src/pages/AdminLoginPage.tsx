import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminStore } from '@/stores/adminStore';
import { adminApi } from '@/api/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminLoginPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setToken = useAdminStore((s) => s.setToken);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.login({ pin });
      setToken(response.data.token, response.data.expires_at);
      navigate('/admin');
    } catch {
      setError('Invalid PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface-0">
      <div className="w-full max-w-md card-surface" style={{ padding: '3rem' }}>
        <div className="text-center" style={{ marginBottom: '2.5rem' }}>
          <h1 className="text-3xl font-display font-black text-white" style={{ marginBottom: '0.75rem' }}>VibePrint OS</h1>
          <p className="text-sm text-white/40">Admin Dashboard</p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Label htmlFor="pin" className="text-xs text-white/40 uppercase tracking-wider">PIN Code</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter PIN"
              autoFocus
              className="input-surface text-white placeholder:text-white/25"
              style={{ height: '3rem', paddingLeft: '1rem', paddingRight: '1rem' }}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            type="submit"
            className="w-full font-display font-semibold btn-primary border-0"
            disabled={loading || pin.length < 4}
            style={{ height: '3rem' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
