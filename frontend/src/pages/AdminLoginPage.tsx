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
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface-0">
      <div className="w-full max-w-sm card-surface p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-black text-white mb-1">VibePrint OS</h1>
          <p className="text-sm text-white/40">Admin Dashboard</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
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
              className="input-surface h-11 text-white placeholder:text-white/25"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button
            type="submit"
            className="w-full h-11 font-display font-semibold btn-primary border-0"
            disabled={loading || pin.length < 4}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
