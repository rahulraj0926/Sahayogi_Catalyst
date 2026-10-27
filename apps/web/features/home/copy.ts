/** All wording of the Home screen in one place. */
export const HOME_COPY = {
  productsTitle: 'Products',
  productsSub: 'Every product, where it is in its lifecycle and who owns it.',
  ideasTitle: 'Ideas inbox',
  ideasSub: 'Not products yet. The founder accepts or rejects each one.',
  ideasEmpty: 'No ideas waiting.',
  calendarTitle: 'Calendar',
  activityTitle: 'What people did recently',
  activityEmpty: 'Nothing has happened yet.',
  noProducts: 'No products match these filters.',
  healthLabel: { on_track: 'On track', attention: 'Needs attention', blocked: 'Held up', idle: 'No activity' } as Record<string, string>,
  healthStatus: { on_track: 'healthy', attention: 'info', blocked: 'warning', idle: 'neutral' } as Record<string, 'healthy' | 'info' | 'warning' | 'critical' | 'neutral'>,
  stages: [['', 'All stages'], ...Array.from({ length: 13 }, (_, i) => [`P${i}`, `Phase ${i}`] as const), ['handoff', 'Hand-over'], ['done', 'Done'], ['parked', 'Parked']] as const,
  kinds: [['', 'All kinds'], ['software', 'Software'], ['hardware', 'Hardware'], ['service', 'Service']] as const,
  healths: [['', 'Any health'], ['blocked', 'Held up'], ['attention', 'Needs attention'], ['idle', 'No activity'], ['on_track', 'On track']] as const,
  eventLabel: { approval_expires: 'Approval due', gate_decision: 'Sign-off', stage_entered: 'Stage change', idea_submitted: 'Idea', product_created: 'Started' } as Record<string, string>,
};
