import { Task, Column } from '../types/kanban';

export const mockColumns: Column[] = [
  { id: 'col-1', boardId: 'board-1', title: 'To Do', position: 0 },
  { id: 'col-2', boardId: 'board-1', title: 'In Progress', position: 1 },
  { id: 'col-3', boardId: 'board-1', title: 'Done', position: 2 },
];

export const mockTasks: Task[] = [
  {
    id: 'task-1',
    columnId: 'col-1',
    title: 'Design database schema',
    description: 'Draft the ERD for Supabase tables.',
    priority: 'High',
    position: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'task-2',
    columnId: 'col-2',
    title: 'Setup Vite project',
    priority: 'Medium',
    position: 0,
    createdAt: new Date().toISOString(),
  }
];