'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { MediaAsset } from '@/types';

export function ImagesManager() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void fetchAssets(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  async function fetchAssets(userId: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('media_assets')
        .select('*')
        .eq('user_id', userId)
        .eq('media_kind', 'image')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAssets((data ?? []) as MediaAsset[]);
    } catch (err) {
      console.error('Failed to fetch images:', err);
      toast.error('Failed to load images');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file: File) {
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/settings/images/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Upload failed (HTTP ${res.status})`);
      }

      toast.success('Image uploaded');
      setAssets((current) => [data.asset as MediaAsset, ...current]);
    } catch (err) {
      console.error('Image upload failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(id: string) {
    try {
      setDeletingId(id);
      const res = await fetch(`/api/settings/images/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Delete failed (HTTP ${res.status})`);
      }
      setAssets((current) => current.filter((asset) => asset.id !== id));
      toast.success('Image deleted');
    } catch (err) {
      console.error('Image delete failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete image');
    } finally {
      setDeletingId(null);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Image URL copied');
    } catch {
      toast.error('Failed to copy URL');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Images</h2>
          <p className="text-sm text-slate-400">
            Upload public image URLs to S3 and reuse them in template headers.
          </p>
        </div>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {uploading ? 'Uploading...' : 'Upload Image'}
          </Button>
        </div>
      </div>

      {assets.length === 0 ? (
        <Card className="border-slate-700 bg-slate-900 ring-0 ring-transparent">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-slate-400">No images uploaded yet.</p>
            <p className="mt-1 text-xs text-slate-500">
              Upload once here, then paste or reuse the URL in template image headers.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <Card key={asset.id} className="overflow-hidden border-slate-700 bg-slate-900 ring-0 ring-transparent">
              <div className="aspect-video bg-slate-950">
                <img
                  src={asset.public_url}
                  alt={asset.file_name}
                  className="h-full w-full object-cover"
                />
              </div>
              <CardContent className="space-y-3 pt-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{asset.file_name}</p>
                  <p className="truncate text-xs text-slate-500">{asset.public_url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void copyUrl(asset.public_url)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    <Copy className="size-3.5" />
                    Copy URL
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleDelete(asset.id)}
                    disabled={deletingId === asset.id}
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    {deletingId === asset.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
