import { Box, CheckSquare, ClipboardCheck, Code2, FileBarChart, HelpCircle, Home, StickyNote, Users, type LucideIcon } from 'lucide-react';

/** One tile in the 9-dot launcher. `href` opens inside this app, `liveUrl` opens another Sahayogi app in a new tab. */
export interface LauncherApp {
  id: string;
  name: string;
  href?: string;
  liveUrl?: string;
  /** Picture for an app that has its own logo; without one the icon (or first letter) is used. */
  logoUrl?: string;
  icon?: LucideIcon;
  /** Icon colour; the tile behind it is a soft tint of the same colour, so it works in light and dark. */
  fg?: string;
}

/** The areas of this platform. Add, remove or rename a line to change the launcher; nothing else needs to change. */
export const PLATFORM_APPS: LauncherApp[] = [
  { id: 'home', name: 'Home', href: '/', icon: Home, fg: '#2563EB' },
  { id: 'products', name: 'Products', href: '/products', icon: Box, fg: '#7C3AED' },
  { id: 'approvals', name: 'Approvals', href: '/approvals', icon: ClipboardCheck, fg: '#059669' },
  { id: 'tasks', name: 'Tasks', href: '/tasks', icon: CheckSquare, fg: '#0D9488' },
  { id: 'notes', name: 'Notes', href: '/notes', icon: StickyNote, fg: '#D97706' },
  { id: 'members', name: 'Members', href: '/members', icon: Users, fg: '#0891B2' },
  { id: 'reports', name: 'Reports', href: '/reports', icon: FileBarChart, fg: '#EA580C' },
  { id: 'api-docs', name: 'API docs', href: '/api-docs', icon: Code2, fg: '#475569' },
  { id: 'help', name: 'How to use', href: '/help', icon: HelpCircle, fg: '#DC2626' },
];

/** Other Sahayogi apps that open in a new tab. Example: { id: 'chat', name: 'Chat', liveUrl: 'https://...', logoUrl: '/chat.png' } */
export const EXTERNAL_APPS: LauncherApp[] = [];

/** Shown as favorites until the person changes them. */
export const DEFAULT_FAVORITES = ['home', 'approvals', 'tasks'];

export const LAUNCHER_APPS: LauncherApp[] = [...PLATFORM_APPS, ...EXTERNAL_APPS.filter((a) => a.liveUrl)];
