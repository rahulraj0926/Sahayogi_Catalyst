'use client';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { actor, setActor } from '@/lib/api';

/**
 * Asks who is using the app the first time, because the server refuses changes that have no name on them.
 * Until real sign-in exists this name goes in the X-Actor header and in the audit trail.
 */
export function NamePrompt({ onName }: { onName: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  useEffect(() => { setOpen(!actor()); }, []);
  const save = () => {
    const v = name.trim().slice(0, 80);
    if (!v) return;
    setActor(v);
    onName(v);
    setOpen(false);
  };
  return (
    <Dialog open={open}>
      <DialogContent onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Who are you?</DialogTitle>
          <DialogDescription>Your name is saved with every change you make, so the team can see who did what. You can change it later from the top bar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="grid gap-3">
          <Label htmlFor="who-name">Your full name</Label>
          <Input id="who-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="For example: Asha Verma" />
          <DialogFooter><Button type="submit" disabled={!name.trim()}>Continue</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
