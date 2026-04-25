import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { photoboothApi } from '@/api/photoboothApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Palette, Star, Trash2, Loader2 } from 'lucide-react';
import type { ThemeResponse } from '@/api/types';

export default function ThemeManager() {
  const queryClient = useQueryClient();

  const { data: themes = [], isLoading } = useQuery({
    queryKey: ['admin-photobooth-themes'],
    queryFn: () => photoboothApi.listAllThemes().then((r: { data: ThemeResponse[] }) => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      photoboothApi.toggleTheme(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-photobooth-themes'] });
      toast.success('Theme updated');
    },
    onError: () => toast.error('Failed to update theme'),
  });

  const defaultMutation = useMutation({
    mutationFn: (id: number) => photoboothApi.setDefaultTheme(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-photobooth-themes'] });
      toast.success('Default theme set');
    },
    onError: () => toast.error('Failed to set default'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => photoboothApi.deleteTheme(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-photobooth-themes'] });
      toast.success('Theme deleted');
    },
    onError: () => toast.error('Cannot delete built-in themes'),
  });

  if (isLoading) {
    return (
      <Card className="card-surface border-0">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-surface border-0">
      <CardHeader style={{ padding: '1.5rem' }}>
        <div className="flex items-center gap-2.5">
          <Palette className="h-4 w-4 text-pink-400" />
          <CardTitle className="font-display text-white">Theme Manager</CardTitle>
        </div>
        <p className="text-xs text-white/25" style={{ marginTop: '0.5rem' }}>
          Manage photobooth strip themes. Built-in themes cannot be deleted. Custom themes can be added, edited, or disabled.
        </p>
      </CardHeader>
      <CardContent style={{ padding: '0 2rem 2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {themes.map((theme: ThemeResponse) => (
            <div
              key={theme.id}
              className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5"
            >
              {/* Color preview */}
              <div
                className="w-10 h-10 rounded-lg flex-shrink-0"
                style={{
                  background:
                    theme.config.background?.type === 'gradient'
                      ? `linear-gradient(135deg, ${theme.config.background.gradient_start}, ${theme.config.background.gradient_end})`
                      : theme.config.background?.color || '#000',
                  borderWidth: `${theme.config.photo_slot?.border_width || 0}px`,
                  borderColor: theme.config.photo_slot?.border_color || '#fff',
                  borderStyle: 'solid',
                }}
              />

              {/* Name + badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-sm">{theme.display_name}</span>
                  {theme.is_builtin && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-white/10 text-white/40">
                      built-in
                    </span>
                  )}
                  {theme.is_default && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-pink-500/20 text-pink-400">
                      default
                    </span>
                  )}
                </div>
                <span className="text-white/30 text-xs">{theme.name}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                {!theme.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => defaultMutation.mutate(theme.id)}
                    className="text-white/40 hover:text-white h-8 px-2"
                    title="Set as default"
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                )}

                <Switch
                  checked={theme.is_enabled}
                  onCheckedChange={(checked: boolean) =>
                    toggleMutation.mutate({ id: theme.id, enabled: checked })
                  }
                />

                {!theme.is_builtin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(theme.id)}
                    className="text-red-400/60 hover:text-red-400 h-8 px-2"
                    title="Delete theme"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
