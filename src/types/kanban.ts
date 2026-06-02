export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface Task {
  id: string;
  columnId: string;
  title: string;
  description?: string;
  priority: PriorityLevel;
  position: number;
  createdAt: string;
}

export interface Column {
  id: string;
  boardId: string;
  title: string;
  position: number;
}