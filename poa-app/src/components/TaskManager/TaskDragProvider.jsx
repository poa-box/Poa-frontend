import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// React DnD's default provider shares one reference-counted browser manager.
// Sidebar and board islands therefore keep the same drag/drop backend while
// list-only mobile pages do not need to load or initialize it.
export default function TaskDragProvider({ children }) {
  return <DndProvider backend={HTML5Backend}>{children}</DndProvider>;
}
