export interface Subject {
  id: string;
  label: string;
  /** Frame inside the subject icon sheet. */
  icon: number;
}

export const SUBJECTS: readonly Subject[] = [
  { id: 'general', label: 'Study', icon: 0 },
  { id: 'math', label: 'Math', icon: 1 },
  { id: 'science', label: 'Science', icon: 2 },
  { id: 'languages', label: 'Languages', icon: 3 },
  { id: 'history', label: 'History', icon: 4 },
  { id: 'art', label: 'Art', icon: 5 },
  { id: 'coding', label: 'Coding', icon: 6 },
  { id: 'reading', label: 'Reading', icon: 7 },
  { id: 'music', label: 'Music', icon: 8 },
];

/** Extra frame in the icon sheet used for the "on break" bubble. */
export const BREAK_ICON = 9;

export function getSubject(id: string): Subject {
  return SUBJECTS.find((s) => s.id === id) ?? SUBJECTS[0]!;
}
