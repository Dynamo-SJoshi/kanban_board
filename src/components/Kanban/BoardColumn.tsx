import type { Column, Task } from '../../types/kanban';
import { MoreHorizontal, Plus } from 'lucide-react';

interface BoardColumnProps {
  column: Column;
  tasks: Task[];
}

export function BoardColumn({ column, tasks }: BoardColumnProps) {
  return (
    <div className="board-column">
      <div className="column-header">
        <h3>{column.title}</h3>
        <button className="btn-ghost" style={{ width: 'auto', padding: '4px' }}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="column-body">
        {tasks.map((task) => (
          <div key={task.id} className="task-card">
            <span className={`task-priority ${
              task.priority === 'High' ? 'priority-high' :
              task.priority === 'Medium' ? 'priority-medium' :
              'priority-low'
            }`}>
              {task.priority}
            </span>
            <h4 className="task-title">{task.title}</h4>
            {task.description && <p className="task-desc">{task.description}</p>}
          </div>
        ))}
      </div>

      <div style={{ padding: '12px' }}>
        <button className="btn-ghost">
          <Plus className="h-4 w-4" /> Add Task
        </button>
      </div>
    </div>
  );
}