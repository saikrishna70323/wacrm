'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Loader2, Plus, Power, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { FaqEntry } from '@/types';

function splitKeywords(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildKeywordsFromQuestion(question: string): string[] {
  const normalized = question.trim();
  const stripped = normalized.replace(/[?؟!.。]+$/u, '').trim();
  return [...new Set([normalized, stripped].filter(Boolean))];
}

function parseBulkFaqText(raw: string): Array<{
  question: string;
  keywords: string[];
  answer: string;
}> {
  const entries: Array<{
    question: string;
    keywords: string[];
    answer: string;
  }> = [];

  const pattern = /(?:^|\n)\s*\d+\.\s*ప్రశ్న:\s*(.+?)\s*\n\s*జవాబు:\s*([\s\S]*?)(?=(?:\n\s*\d+\.\s*ప్రశ్న:)|$)/g;
  for (const match of raw.matchAll(pattern)) {
    const question = match[1]?.trim();
    const answer = match[2]?.trim();
    if (!question || !answer) continue;
    entries.push({
      question,
      keywords: buildKeywordsFromQuestion(question),
      answer,
    });
  }

  return entries;
}

export function FaqManager() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<FaqEntry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [keywords, setKeywords] = useState('');
  const [answer, setAnswer] = useState('');
  const [bulkText, setBulkText] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    void fetchEntries(user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  async function fetchEntries(userId: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('faq_entries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setEntries((data ?? []) as FaqEntry[]);
    } catch (err) {
      console.error('Failed to fetch FAQ entries:', err);
      toast.error('Failed to load FAQ entries');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!user) {
      toast.error('Not authenticated');
      return;
    }
    if (!question.trim()) {
      toast.error('Question is required');
      return;
    }
    if (!answer.trim()) {
      toast.error('Answer is required');
      return;
    }
    const parsedKeywords = splitKeywords(keywords);
    if (parsedKeywords.length === 0) {
      toast.error('Add at least one keyword');
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase.from('faq_entries').insert({
        user_id: user.id,
        question: question.trim(),
        keywords: parsedKeywords,
        answer: answer.trim(),
      });
      if (error) throw error;

      toast.success('FAQ entry created');
      setDialogOpen(false);
      setQuestion('');
      setKeywords('');
      setAnswer('');
      await fetchEntries(user.id);
    } catch (err) {
      console.error('Failed to create FAQ entry:', err);
      toast.error('Failed to create FAQ entry');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(entry: FaqEntry) {
    try {
      setTogglingId(entry.id);
      const { error } = await supabase
        .from('faq_entries')
        .update({ is_active: !entry.is_active })
        .eq('id', entry.id);
      if (error) throw error;

      setEntries((current) =>
        current.map((item) =>
          item.id === entry.id ? { ...item, is_active: !item.is_active } : item,
        ),
      );
    } catch (err) {
      console.error('Failed to toggle FAQ entry:', err);
      toast.error('Failed to update FAQ entry');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(entry: FaqEntry) {
    try {
      setDeletingId(entry.id);
      const { error } = await supabase.from('faq_entries').delete().eq('id', entry.id);
      if (error) throw error;

      setEntries((current) => current.filter((item) => item.id !== entry.id));
      toast.success('FAQ entry deleted');
    } catch (err) {
      console.error('Failed to delete FAQ entry:', err);
      toast.error('Failed to delete FAQ entry');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkImport() {
    if (!user) {
      toast.error('Not authenticated');
      return;
    }

    const parsedEntries = parseBulkFaqText(bulkText);
    if (parsedEntries.length === 0) {
      toast.error('No FAQ entries found. Paste numbered ప్రశ్న / జవాబు content.');
      return;
    }

    try {
      setBulkSaving(true);
      const { error } = await supabase.from('faq_entries').insert(
        parsedEntries.map((entry) => ({
          user_id: user.id,
          question: entry.question,
          keywords: entry.keywords,
          answer: entry.answer,
        })),
      );
      if (error) throw error;

      toast.success(`Imported ${parsedEntries.length} FAQ entries`);
      setBulkDialogOpen(false);
      setBulkText('');
      await fetchEntries(user.id);
    } catch (err) {
      console.error('Failed to bulk import FAQ entries:', err);
      toast.error('Failed to bulk import FAQ entries');
    } finally {
      setBulkSaving(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">FAQ Bot</h2>
          <p className="text-sm text-slate-400">
            Auto-reply to common customer questions using keyword matching.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setBulkText('');
              setBulkDialogOpen(true);
            }}
            className="border-slate-700 text-slate-300"
          >
            <Upload className="size-4" />
            Bulk Import
          </Button>
          <Button
            onClick={() => {
              setQuestion('');
              setKeywords('');
              setAnswer('');
              setDialogOpen(true);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" />
            New FAQ
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <Card className="border-slate-700 bg-slate-900 ring-0 ring-transparent">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="mb-3 size-10 text-slate-600" />
            <p className="text-sm text-slate-400">No FAQ answers yet.</p>
            <p className="mt-1 text-xs text-slate-500">
              Add entries like &quot;price&quot;, &quot;location&quot;, or
              &quot;documents required&quot;.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card
              key={entry.id}
              className="border-slate-700 bg-slate-900 ring-0 ring-transparent"
            >
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{entry.question}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entry.keywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleToggle(entry)}
                      disabled={togglingId === entry.id}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      <Power className="size-3.5" />
                      {entry.is_active ? 'Active' : 'Paused'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDelete(entry)}
                      disabled={deletingId === entry.id}
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
                  {entry.answer}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="border-slate-700 bg-slate-900 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">New FAQ Entry</DialogTitle>
            <DialogDescription className="text-slate-400">
              The bot will send this answer whenever the inbound message contains one of these keywords.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-slate-300">Question Label</Label>
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Price enquiry"
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Keywords</Label>
              <Input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="price, cost, charges"
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500"
              />
              <p className="text-xs text-slate-500">Separate keywords with commas.</p>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Answer</Label>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={5}
                placeholder="Our pricing starts from..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? 'Saving...' : 'Create FAQ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="border-slate-700 bg-slate-900 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white">Bulk Import FAQ Entries</DialogTitle>
            <DialogDescription className="text-slate-400">
              Paste your numbered Telugu ప్రశ్న / జవాబు block. Each item will be imported as one FAQ entry.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={18}
              placeholder={'1. ప్రశ్న: ...\nజవాబు: ...'}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <p className="text-xs text-slate-500">
              Imported entries will use the full question as the starting keyword. You can edit keywords later for broader matching.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDialogOpen(false)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleBulkImport()}
              disabled={bulkSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {bulkSaving ? 'Importing...' : 'Import All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
